// search/search.js (A4): the optimiser driver. Phases screen -> search -> minimise -> confirm ->
// attribute (redesign plan A.7-A.10). The procedure, effort levels, seeds, checkpoint and result
// contract are docs/Reference/simulation.md §Search and §Result; this file implements them.
//
// Every decision is a paired, family-wise-corrected comparison on common random numbers
// (search/sampler.js): nothing is ranked by a proxy, N is never lowered and no block is skipped
// for time. The cost of a run is therefore variable; Effort only sets the precision.
import { hashSeed, mulberry32 } from '../engine/rng.js';
import { lookSchedule } from '../engine/stats/index.js';
import { metricKey } from '../engine/metrics.js';
import { EngineInputError } from '../engine/validate.js';
import { NEUTRAL_VALUE_TEXT } from '../engine/pvp/resolver.js';
import { computePresetStats } from '../build/stats.js';
import { resolvePreset } from '../build/presetInputs.js';
import { describeBuild } from '../build/describe.js';
import { talentSpec } from '../game/talents.js';
import { pointsSpent, sanitiseAllocation } from '../model/talents.js';
import { talentPointsForLevel } from '../model/legality.js';
import { DROP_PRECISION } from '../features/swap.js';
import { formatFlat } from '../format.js';
import { BLOCKS, createBuildSpace, normalisePowerFloor } from './space.js';
import { candidateEngineKey, changesOf, canonicalise, mergeByEngine, writesOf } from './effect.js';
import { legalityOf } from './legality.js';
import { resolveTarget, makeObjective, residualFor, meetsTarget, isWinRateKind } from './objectives.js';
import { createSampler, compareSets, contrastSets, setOf, isAbort, AbortError } from './sampler.js';
import { race } from './race.js';
import { minimise, attribute, holmSequential, holmFixed } from './minimise.js';
import {
  RESULT_SCHEMA, CHECKPOINT_SCHEMA, PHASES, MULTIPLICITY, estimateOut, contrastOut, targetOut, objectiveOut,
  headlineOf, rankRows, failedResult, rowViolations, nearestOfEqual, groupTies,
} from './result.js';

/** The joint space is raced exhaustively at or below this many builds (a strategy switch, not a cap). */
export const EXHAUSTIVE_MAX = 50_000;
/** Seeded random legal starts of the local strategy. */
export const RANDOM_STARTS = 3;
/** First look per Effort level (fights per arm, per lane). */
export const EFFORT_N0 = Object.freeze({ quick: 8, standard: 16, thorough: 32 });
export const EFFORT_LEVELS = Object.freeze(['quick', 'standard', 'thorough']);
/** Family-wise level of every family (racing, confirm, attribution). */
export const ALPHA = 0.05;

// Blocks a compound value is re-optimised over before it is raced (plan A.3).
const SPEC_INNER = ['sigils', 'utility', 'ancient', 'conditions', 'majorGlyphs', 'talents'];
const MOUNT_INNER = ['minorGlyphs', 'majorGlyphs'];
const PROGRESS_MS = 250;
const YIELD_MS = 25;

/**
 * Effort: Q4's precision (the delta and maxN Drop Check uses, features/swap.js DROP_PRECISION) plus the
 * first look. A string picks a level; an object may override n0, maxN, delta and randomStarts (tests).
 * @returns {{level: string, delta: number, deltaKind: 'relative'|'absolute', alpha: number, n0: number, maxN: number, randomStarts: number}}
 */
export function resolveEffort(raw, objective) {
  const o = typeof raw === 'string' ? { level: raw } : raw && typeof raw === 'object' ? raw : {};
  const level = EFFORT_LEVELS.includes(o.level) ? o.level : 'standard';
  const p = DROP_PRECISION[level];
  const deltaKind = objective.deltaKind;
  const posInt = (v) => Number.isInteger(v) && v >= 1;
  const n0 = posInt(o.n0) ? o.n0 : EFFORT_N0[level];
  const maxN = posInt(o.maxN) && o.maxN >= n0 ? o.maxN : Math.max(n0, p.maxN);
  const delta = typeof o.delta === 'number' && o.delta >= 0 ? o.delta : deltaKind === 'relative' ? p.rel : p.prob;
  const randomStarts = Number.isInteger(o.randomStarts) && o.randomStarts >= 0 ? o.randomStarts : RANDOM_STARTS;
  // futility: false restores the pre-A5 race and accept rule (benchmarks; not an Effort control)
  return { level, delta, deltaKind, alpha: ALPHA, n0, maxN, randomStarts, futility: o.futility !== false };
}

/** Phase seeds (I4: the data that decides is never the data reported). */
export function seedsFor(seed, targetKey) {
  return {
    search: hashSeed('search', seed, targetKey),
    minimise: hashSeed('minimise', seed, targetKey),
    confirm: hashSeed('confirm', seed, targetKey),
  };
}

/** The seed of the k-th Run more round. */
export const moreSeed = (seed, targetKey, k) => hashSeed('more', seed, targetKey, k);

// Toggle names before A2 (saved runs can be re-run with their settings).
function togglesOf(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const t = { ...raw };
  if ('talentSet' in t && !('spec' in t)) t.spec = !!t.talentSet;
  if ('glyphs' in t) {
    if (!('minorGlyphs' in t)) t.minorGlyphs = !!t.glyphs;
    if (!('majorGlyphs' in t)) t.majorGlyphs = !!t.glyphs;
  }
  return Object.fromEntries(BLOCKS.filter((b) => b in t).map((b) => [b, !!t[b]]));
}

/** Validate a request and build everything a run needs. Throws on a request that cannot run. */
export function prepare(request) {
  const { character } = request ?? {};
  if (!character || typeof character !== 'object') throw new Error('optimize: request.character is required');
  const preset = resolvePreset(character, request.presetId);
  if (!preset) throw new Error('optimize: the character has no preset to optimise');
  const target = resolveTarget(request.target ?? { kind: 'dummy' }, { character });
  const realm = target.realm ?? (request.realm === 'oblivion' ? 'oblivion' : 'base');
  const mode = target.mode === 'pvp' ? 'pvp' : 'pve';
  const objective = makeObjective(request.objective ?? { kind: 'dps' }, target);
  const effort = resolveEffort(request.effort, objective);
  const seed = Number.isFinite(request.seed) ? request.seed : 1;
  const seeds = seedsFor(seed, target.key);
  const { residual, warnings } = residualFor(computePresetStats(character, preset.id, { realm }));
  if (target.opponents) {
    for (const o of target.opponents) {
      if (o.fighter.defaulted?.length) {
        warnings.push({ code: 'opponent-defaulted', severity: 'warn', message: NEUTRAL_VALUE_TEXT.warning(o.name || 'Opponent', o.fighter.defaulted) });
      }
    }
  }
  const powerFloor = normalisePowerFloor(request.powerFloor);
  const space = createBuildSpace(character, preset, { realm, mode, residual, toggles: togglesOf(request.space), powerFloor });
  const characterKey = metricKey('character', character);
  const requestEcho = {
    presetId: preset.id, realm, mode, target: target.spec, objective: objective.spec, space: space.toggles,
    ...(powerFloor != null ? { powerFloor } : {}),
    seed, seeds, effort: { level: effort.level, delta: effort.delta, deltaKind: effort.deltaKind, alpha: effort.alpha, n0: effort.n0, maxN: effort.maxN }, characterKey,
  };
  const requestKey = metricKey('optimise-request', { ...requestEcho, characterKey: undefined, randomStarts: effort.randomStarts, ...(effort.futility ? {} : { futility: false }) });
  return { character, preset, target, realm, mode, objective, effort, seed, seeds, warnings, space, characterKey, requestEcho, requestKey };
}

const symdiff = (a, b) => a.filter((x) => !b.includes(x)).length + b.filter((x) => !a.includes(x)).length;

/**
 * How far a candidate is from the baseline: one per change, except that relic and sigil changes count
 * each piece swapped and a talent change the points moved. Of builds equal in effect the nearest is kept.
 */
export function distanceOf(space, B, X) {
  const saved = (set) => space.character.talentSets?.[set]?.allocation ?? {};
  const allocOf = (c, set) => (c.talentSet === set && c.talentAllocation ? c.talentAllocation : saved(set));
  let d = 0;
  for (const c of changesOf(space, B, X, { bundles: false })) {
    if (c.id === 'relics') d += symdiff(B.relicIds, X.relicIds);
    else if (c.id === 'sigils') d += symdiff(B.sigilSpecies, X.sigilSpecies);
    else if (c.id.startsWith('talents:')) {
      const set = Number(c.id.slice(8));
      const a = allocOf(B, set);
      const b = allocOf(X, set);
      let moved = 0;
      for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) moved += Math.abs((a[id] ?? 0) - (b[id] ?? 0));
      d += Math.max(1, Math.ceil(moved / 2));
    } else d += 1;
  }
  return d;
}

/** What a pool worker needs to rebuild this run's target and objective (KERNELS.objective). */
function poolSetup(prep) {
  return { target: prep.target.spec, objective: prep.objective.spec, character: { opponents: prep.character.opponents ?? [] } };
}

// ---------------------------------------------------------------------------------------------
// the run state: arms, sampling ledger, logged steps (checkpoint / resume), progress

function createRun(prep, hooks) {
  const { space, objective, effort } = prep;
  // With a worker pool (hooks.pool, simulation.md §Worker pool) the fights of a sample request are
  // sharded over its workers; each worker builds this target and objective once from their specs.
  const pool = hooks.pool ? hooks.pool('objective', poolSetup(prep)) : null;
  const sampler = createSampler(pool
    ? { ...objective, sample: (fighter, o) => pool.run({ fighter, seed: o.seed }, o.from, o.to, { signal: o.signal }) }
    : objective);
  const lanes = Math.max(1, objective.lanes ?? 1);
  const signal = hooks.signal;
  const t0 = Date.now();
  const st = {
    phase: 'screen',
    phaseState: Object.fromEntries(PHASES.map((p) => [p.id, 'not-run'])),
    phaseMs: Object.fromEntries(PHASES.map((p) => [p.id, 0])),
    phaseStart: t0,
    fights: Object.fromEntries(PHASES.map((p) => [p.id, 0])),
    ledger: new Map(),
    log: [],
    replay: hooks.replay ?? null,
    stepGets: null,
    evaluated: new Set(),
    merged: { inert: 0, engineIdentical: 0, sampleIdentical: 0 },
    block: null,
    eliminated: 0,
    lastProgress: 0,
    lastYield: Date.now(),
    provisional: null,
    notSimulable: 0,
    belowFloor: new Set(),
  };
  const arms = new Map();
  const base = space.canonical(space.start);

  function armOf(cand) {
    const c = space.canonical(cand);
    const key = space.key(c);
    let a = arms.get(key);
    if (!a) {
      a = { cand: c, key, dist: distanceOf(space, base, c), ek: undefined };
      arms.set(key, a);
    }
    return a;
  }
  /** The arm's engine key, or null when its fighter cannot fight (EngineInputError). */
  function ekOf(a) {
    if (a.ek === undefined) {
      try {
        a.ek = candidateEngineKey(space, a.cand);
      } catch (e) {
        if (!(e instanceof EngineInputError)) throw e;
        a.ek = null;
        st.notSimulable++;
      }
    }
    return a.ek;
  }

  function raise(k, n) {
    const prev = st.ledger.get(k) ?? 0;
    if (n > prev) {
      st.ledger.set(k, n);
      st.fights[st.phase] += (n - prev) * lanes;
    }
    if (st.stepGets) st.stepGets.set(k, Math.max(st.stepGets.get(k) ?? 0, n));
  }

  async function tick() {
    if (signal?.aborted) throw new AbortError();
    if (Date.now() - st.lastYield >= YIELD_MS) {
      await new Promise((r) => setTimeout(r, 0));
      st.lastYield = Date.now();
      if (signal?.aborted) throw new AbortError();
    }
  }

  /** The first n fights of an arm on a stage. */
  async function getSet(a, stage, n) {
    const ek = ekOf(a);
    raise(`${stage.id}|${ek}`, n);
    await tick();
    const fighter = sampler.held(ek, stage) >= n ? null : space.fighterOf(a.cand);
    const set = await sampler.get(ek, stage, fighter, n, { signal });
    progress();
    return set;
  }

  /**
   * Draw the first n fights of several arms at once, so a pool can sample them in parallel before a
   * sequence of logged steps reads them one by one. Only fights those steps will request anyway are
   * drawn (n is their first look or fixed n), the ledger is untouched (fight counts stay logical) and
   * errors are left for the step itself to raise. Skipped while a checkpoint is being replayed.
   */
  async function prefetch(list, stage, n) {
    if (!pool || st.replay || signal?.aborted) return;
    const todo = [];
    for (const a of list) {
      const ek = a && ekOf(a);
      if (ek && sampler.held(ek, stage) < n && !todo.some((t) => t.ek === ek)) todo.push({ a, ek });
    }
    await Promise.all(todo.map(async ({ a, ek }) => {
      try {
        await sampler.get(ek, stage, space.fighterOf(a.cand), n, { signal });
      } catch { /* the step raises it */ }
    }));
  }

  /** What a cancelled run can still show: the fights held, without simulating. */
  async function heldSet(a, stage) {
    const ek = ekOf(a);
    const n = ek ? sampler.held(ek, stage) : 0;
    return n > 0 ? sampler.get(ek, stage, null, n) : null;
  }

  /**
   * One logged decision. On resume the checkpoint's log is replayed step by step (same kind and
   * inputs), so the run reaches the cancel point without sampling and continues bit for bit.
   */
  async function step(kind, parts, live) {
    const sig = hashSeed(kind, ...parts);
    if (st.replay) {
      const e = st.replay[st.log.length];
      if (e && e.kind === kind && e.sig === sig) {
        for (const [k, n] of e.gets) raise(k, n);
        st.log.push(e);
        return e.out;
      }
      st.replay = null;
    }
    const outer = st.stepGets;
    st.stepGets = new Map();
    let out;
    try {
      out = await live();
    } finally {
      const gets = st.stepGets;
      st.stepGets = outer;
      if (out !== undefined) st.log.push({ kind, sig, phase: st.phase, out, gets: [...gets] });
    }
    return out;
  }

  const effortFor = (alpha) => ({ delta: effort.delta, deltaKind: effort.deltaKind, n0: effort.n0, maxN: effort.maxN, alpha });

  const identical = (x, y, n) => x.main.every((lane, j) => {
    const other = y.main[j];
    for (let i = 0; i < n; i++) if (lane[i] !== other[i]) return false;
    return true;
  });

  /**
   * Sequential paired comparison of X against Y on a stage (logged). `futile` (a challenger against
   * the incumbent) also stops once X cannot beat Y by δ (simulation.md §Search, racing).
   */
  function compare(X, Y, stage, alpha, { futile = false } = {}) {
    const futility = futile && effort.futility;
    return step('compare', [stage.id, X.key, Y.key, alpha, ...(futility ? ['futile'] : [])], async () => {
      const c = await compareSets(objective, (n) => getSet(X, stage, n), (n) => getSet(Y, stage, n), { ...effortFor(alpha), futility, seed: stage.seed });
      const [x, y] = [await getSet(X, stage, c.n), await getSet(Y, stage, c.n)];
      return { ...c, identical: identical(x, y, c.n) };
    });
  }

  /** One paired contrast at a fixed n on a stage (logged). */
  function contrastAt(X, Y, stage, n, alpha) {
    return step('contrast', [stage.id, X.key, Y.key, n, alpha], async () => {
      const [x, y] = await Promise.all([getSet(X, stage, n), getSet(Y, stage, n)]);
      return contrastSets(objective, x, y, { ...effortFor(alpha), seed: stage.seed });
    });
  }

  /** A race on a stage (logged; eliminated and futile arms are kept as counts so checkpoints stay small). */
  function raceArms(list, stage) {
    for (const a of list) st.evaluated.add(a.key);
    return step('race', [stage.id, ...list.map((a) => a.key), ...(effort.futility ? [] : ['no-futility'])], async () => {
      const r = await race(list, {
        objective, effort: { ...effortFor(effort.alpha), futility: effort.futility }, seed: stage.seed,
        getSet: (a, n) => getSet(a, stage, n),
        onLook: () => progress(),
      });
      return { ...r, eliminated: r.eliminated.length + r.futile.length, futile: r.futile.length };
    });
  }

  function setPhase(id) {
    const now = Date.now();
    if (st.phaseState[st.phase] === 'current') {
      st.phaseState[st.phase] = 'done';
      st.phaseMs[st.phase] += now - st.phaseStart;
    }
    st.phase = id;
    st.phaseState[id] = 'current';
    st.phaseStart = now;
    progress(true);
  }

  function progress(force = false) {
    if (!hooks.onProgress) return;
    const now = Date.now();
    if (!force && now - st.lastProgress < PROGRESS_MS) return;
    st.lastProgress = now;
    hooks.onProgress({
      type: 'progress',
      jobId: hooks.jobId,
      phase: st.phase,
      phases: PHASES.map((p) => ({
        id: p.id, label: p.label,
        state: st.phaseState[p.id] === 'current' ? 'current' : st.phaseState[p.id] === 'done' ? 'done' : 'queued',
        done: null, total: null,
      })),
      block: st.block,
      counts: { evaluated: st.evaluated.size, fights: Object.values(st.fights).reduce((a, b) => a + b, 0), eliminated: st.eliminated, merged: st.merged.inert + st.merged.engineIdentical + st.merged.sampleIdentical },
      elapsedMs: now - t0,
      provisional: st.provisional,
    });
  }

  function checkpoint(extra = {}) {
    return {
      schema: CHECKPOINT_SCHEMA,
      requestKey: prep.requestKey,
      characterKey: prep.characterKey,
      phase: st.phase,
      seeds: prep.seeds,
      log: st.log.slice(),
      frontier: { armsN: Object.fromEntries(st.ledger) },
      finalists: [],
      minimised: {},
      confirmed: [],
      ...extra,
    };
  }

  /**
   * Win rate: does the arm meet the target (simulation.md §Win rate)? Looks n0, 2n0, ... maxN on the
   * stage, Wilson at alpha / looks, stopping once `meetsTarget` resolves (logged). The highest-chance goal
   * checks against 1: a build that clears every try (within δ) cannot be beaten by δ.
   * @returns {Promise<{meets: boolean|null, n: number, value: Object}>}
   */
  function goalCheck(X, stage) {
    return step('goal', [stage.id, X.key], async () => {
      const looks = lookSchedule(effort.n0, effort.maxN);
      const alpha = effort.alpha / looks.length;
      for (let k = 0; k < looks.length; k++) {
        const value = objective.estimate(await getSet(X, stage, looks[k]), { alpha }).value;
        const meets = meetsTarget(value, objective.target ?? 1, effort.delta);
        if (meets != null || k === looks.length - 1) return { meets, n: looks[k], value };
      }
      throw new Error('unreachable');
    });
  }

  return { st, sampler, base, armOf, ekOf, getSet, heldSet, prefetch, compare, contrastAt, raceArms, goalCheck, setPhase, progress, checkpoint, t0, signal, workers: pool?.size ?? 1 };
}

// ---------------------------------------------------------------------------------------------
// search (A.7)

async function searchPhase(prep, run) {
  const { space, objective, effort, seeds } = prep;
  const S1 = { id: 'search', seed: seeds.search };
  const { st, armOf, ekOf } = run;
  const B = armOf(space.start);
  const enabled = new Set(space.blocks.filter((b) => b.enabled).map((b) => b.id));
  const blockById = new Map(space.blocks.map((b) => [b.id, b]));
  const sizes = space.domainSizes(B.cand);
  const status = new Map(); // block id -> 'converged' | 'unresolved'
  const unresolvedOut = [];
  // the Combat Power guard is a legality rule: an arm below the floor is never raced (simulation.md §Build space)
  const simulable = (a) => {
    if (!space.admissible(a.cand)) {
      st.belowFloor.add(a.key);
      return false;
    }
    return ekOf(a) != null;
  };

  let jointSize = 1;
  for (const id of enabled) jointSize *= sizes[id] ?? 1;
  const talentsLocal = enabled.has('talents') && (sizes.talents ?? 1) > 1;

  /** Canonical (inert changes reverted, A.5) arm of a candidate. */
  const canonArm = (a) => {
    const r = canonicalise(space, B.cand, a.cand);
    st.merged.inert += r.inert.length;
    return armOf(r.candidate);
  };

  /** Simulable, distinct, engine-merged arms; the incumbent stays first. */
  function prepareArms(list) {
    const seen = new Set();
    const ok = [];
    for (const a of list) {
      if (seen.has(a.key) || !simulable(a)) continue;
      seen.add(a.key);
      ok.push(a);
    }
    const m = mergeByEngine(space, ok.map((a) => a.cand), { base: B.cand });
    st.merged.engineIdentical += m.merged;
    return m.arms.map(armOf);
  }

  const labelOf = (from, to) => changesOf(space, from.cand, to.cand, { bundles: false }).map((c) => `${c.label}: ${c.from} -> ${c.to}`).join('; ');

  // --- exhaustive ------------------------------------------------------------------------------
  function enumerateJoint() {
    const ids = BLOCKS.filter((id) => enabled.has(id));
    const out = new Map([[B.key, B.cand]]);
    let over = false;
    const rec = (i, c) => {
      if (over) return;
      if (i === ids.length) {
        const k = space.key(c);
        if (!out.has(k)) out.set(k, c);
        if (out.size > EXHAUSTIVE_MAX) over = true;
        return;
      }
      rec(i + 1, c);
      for (const v of blockById.get(ids[i]).domain(c)) rec(i + 1, v);
    };
    rec(0, B.cand);
    return over ? null : [...out.values()];
  }

  async function exhaustive(cands) {
    const arms = prepareArms(cands.map(armOf));
    st.block = 'all';
    const r = await run.raceArms(arms, S1);
    st.eliminated += r.eliminated;
    for (const id of enabled) status.set(id, 'converged');
    for (const u of r.unresolved) {
      for (const c of changesOf(space, arms[r.winner].cand, arms[u.i].cand, { bundles: false })) status.set(c.dimension, 'unresolved');
      unresolvedOut.push({ fromKey: arms[r.winner].key, toKey: arms[u.i].key, change: labelOf(arms[r.winner], arms[u.i]), contrast: contrastOut(u.contrast) });
    }
    const contenders = [...r.ties, ...r.unresolved.map((u) => u.i)].map((i) => arms[i]);
    return { strategy: 'exhaustive', starts: 1, optima: [arms[r.winner]], contenders };
  }

  // --- local -----------------------------------------------------------------------------------
  const innerMemo = new Map();

  async function innerBest(cand, inner) {
    const ids = inner.filter((id) => enabled.has(id));
    const start = armOf(cand);
    if (!ids.length || !simulable(start)) return start;
    const k = `${ids.join(',')}|${start.key}`;
    if (!innerMemo.has(k)) {
      // The inner optimum is the arm raced; its neighbours still open are listed like the outer ones.
      // Its ties are not finalists: the outer ascent's last pass re-races every block around the final x.
      const r = await ascent(start, ids);
      unresolvedOut.push(...r.unresolved);
      innerMemo.set(k, r.x);
    }
    return innerMemo.get(k);
  }

  async function blockArms(id, x) {
    let vals = blockById.get(id).domain(x.cand).map(armOf);
    if (id === 'spec') {
      const out = [];
      for (const v of vals) out.push(await innerBest(v.cand, SPEC_INNER));
      vals = out;
    } else if (id === 'mount') {
      const out = [];
      for (const v of vals) out.push(v.cand.mountId ? await innerBest(v.cand, MOUNT_INNER) : v);
      vals = out;
    }
    return prepareArms([x, ...vals]);
  }

  /** Talent moves of two points that the talents block does not list (+1 +1, -1 -1). */
  function twoPointArms(x) {
    const specKey = space.specOf(x.cand);
    const spec = talentSpec(specKey);
    const cap = talentPointsForLevel(Number.isFinite(space.character.level) ? space.character.level : 100);
    if (!spec || cap === 0) return [];
    const alloc = x.cand.talentAllocation ?? space.character.talentSets?.[x.cand.talentSet]?.allocation ?? {};
    const spent = pointsSpent(alloc);
    const talents = spec.tiers.flatMap((t) => t.talents);
    const out = [];
    for (let a = 0; a < talents.length; a++) {
      for (let b = a; b < talents.length; b++) {
        for (const s of [1, -1]) {
          const next = { ...alloc };
          next[talents[a].id] = (next[talents[a].id] ?? 0) + s;
          next[talents[b].id] = (next[talents[b].id] ?? 0) + s;
          if (Object.values(next).some((r) => r < 0)) continue;
          const clean = sanitiseAllocation(next, specKey, cap);
          if (pointsSpent(clean) !== spent + 2 * s) continue;
          out.push(armOf(space.legalise({ ...x.cand, talentAllocation: clean })));
        }
      }
    }
    return out;
  }

  /** The arm to accept from a race, if one is significantly better than the incumbent (arms[0]). */
  async function acceptable(arms, r, visited) {
    const picks = [r.winner, r.leader].filter((v, i, a) => a.indexOf(v) === i && v !== 0);
    for (const w of picks) {
      const c = await run.compare(arms[w], arms[0], S1, effort.alpha / arms.length, { futile: true });
      if (c.verdict !== 'better') continue;
      const W = canonArm(arms[w]);
      if (!visited.has(W.key)) return W;
    }
    return null;
  }

  /**
   * Coordinate ascent (A.7): race each block's full domain against the incumbent, accept a
   * significantly better winner, until a full pass (and the two-point talent check) accepts nothing.
   * @returns {Promise<{x: Object, contenders: Object[], unresolved: Object[]}>}
   */
  async function ascent(x0, ids) {
    let x = x0;
    const visited = new Set([x.key]);
    for (;;) {
      let accepted = false;
      const contenders = [];
      const unresolved = [];
      const raced = [];
      for (const id of ids) {
        if (!enabled.has(id)) continue;
        st.block = id;
        const arms = await blockArms(id, x);
        if (!status.has(id)) status.set(id, 'converged');
        if (arms.length < 2) continue;
        const r = await run.raceArms(arms, S1);
        st.eliminated += r.eliminated;
        raced.push({ id, unresolved: r.unresolved.length > 0 });
        contenders.push(...r.ties.map((i) => arms[i]), ...r.unresolved.map((u) => arms[u.i]));
        for (const u of r.unresolved) unresolved.push({ fromKey: arms[0].key, toKey: arms[u.i].key, change: labelOf(arms[0], arms[u.i]), contrast: contrastOut(u.contrast) });
        const W = await acceptable(arms, r, visited);
        if (W) {
          x = W;
          visited.add(x.key);
          accepted = true;
        }
      }
      if (!accepted && ids.includes('talents') && enabled.has('talents')) {
        st.block = 'talents';
        const arms = prepareArms([x, ...twoPointArms(x)]);
        if (arms.length > 1) {
          const r = await run.raceArms(arms, S1);
          st.eliminated += r.eliminated;
          for (const u of r.unresolved) unresolved.push({ fromKey: arms[0].key, toKey: arms[u.i].key, change: labelOf(arms[0], arms[u.i]), contrast: contrastOut(u.contrast) });
          if (r.unresolved.length) raced.push({ id: 'talents', unresolved: true });
          contenders.push(...r.ties.map((i) => arms[i]), ...r.unresolved.map((u) => arms[u.i]));
          const W = await acceptable(arms, r, visited);
          if (W) {
            x = W;
            visited.add(x.key);
            accepted = true;
          }
        }
      }
      if (!accepted) {
        for (const r of raced) if (r.unresolved) status.set(r.id, 'unresolved');
        return { x, contenders, unresolved };
      }
    }
  }

  /** Talent points spent one at a time on the best ordering heuristic (a start only, I7). */
  function talentFill(cand, pick) {
    const talents = blockById.get('talents');
    let c = space.legalise({ ...cand, talentAllocation: {} });
    for (;;) {
      const spent = pointsSpent(c.talentAllocation ?? {});
      const plus = talents.domain(c).filter((v) => pointsSpent(v.talentAllocation ?? space.character.talentSets?.[v.talentSet]?.allocation ?? {}) === spent + 1);
      if (!plus.length) return c;
      c = pick(plus);
    }
  }

  function greedyStart() {
    return talentFill(B.cand, (plus) => {
      let best = plus[0];
      let bestV = -Infinity;
      for (const v of plus) {
        let s = -Infinity;
        try {
          s = objective.screen(space.fighterOf(v).stats);
        } catch {
          s = -Infinity;
        }
        if (s > bestV) {
          bestV = s;
          best = v;
        }
      }
      return best;
    });
  }

  function randomStart(k) {
    const rng = mulberry32(hashSeed('start', seeds.search, k));
    let c = B.cand;
    for (const id of BLOCKS) {
      if (!enabled.has(id)) continue;
      if (id === 'talents') {
        c = talentFill(c, (plus) => plus[Math.floor(rng() * plus.length)]);
        continue;
      }
      const d = blockById.get(id).domain(c);
      const i = Math.floor(rng() * (d.length + 1));
      if (i < d.length) c = d[i];
    }
    return c;
  }

  async function local() {
    st.block = null;
    const starts = [B];
    if (enabled.has('spec')) for (const v of blockById.get('spec').domain(B.cand)) starts.push(await innerBest(v, SPEC_INNER));
    if (enabled.has('equipmentSet')) for (const v of blockById.get('equipmentSet').domain(B.cand)) starts.push(armOf(v));
    if (talentsLocal) starts.push(armOf(greedyStart()));
    for (let k = 0; k < effort.randomStarts; k++) starts.push(armOf(randomStart(k)));
    const distinct = [];
    for (const s of starts) {
      const a = simulable(s) ? canonArm(s) : null;
      if (a && simulable(a) && !distinct.some((d) => d.key === a.key)) distinct.push(a);
    }
    const optima = [];
    const contenders = [];
    for (const s of distinct) {
      const r = await ascent(s, BLOCKS);
      optima.push(r.x);
      contenders.push(...r.contenders);
      unresolvedOut.push(...r.unresolved);
      st.provisional = optima.map((a) => ({ key: a.key, candidate: a.cand, provisional: true }));
      run.progress();
    }
    return { strategy: 'local', starts: distinct.length, optima, contenders };
  }

  let out = null;
  if (!talentsLocal && jointSize <= EXHAUSTIVE_MAX) {
    const cands = enumerateJoint();
    if (cands) out = await exhaustive(cands);
  }
  if (!out) out = await local();
  const blocks = BLOCKS.map((id) => ({
    id,
    enabled: enabled.has(id),
    domain: enabled.has(id) ? sizes[id] ?? 1 : 1,
    status: !enabled.has(id) ? 'disabled' : status.get(id) ?? 'not-reached',
  }));
  const optimaKeys = new Set(out.optima.map((a) => a.key));
  return {
    ...out,
    jointSize: out.strategy === 'exhaustive' || jointSize <= Number.MAX_SAFE_INTEGER ? jointSize : null,
    blocks,
    optimaCount: optimaKeys.size,
    unresolved: [...new Map(unresolvedOut.map((u) => [`${u.fromKey}|${u.toKey}`, u])).values()],
    canonArm,
  };
}

// ---------------------------------------------------------------------------------------------
// rows

function auxOf(prep, est, set, baseSet) {
  const aux = { ...est.aux };
  if (aux.winRate) aux.winRate = estimateOut(aux.winRate);
  if (isWinRateKind(prep.objective.kind)) {
    aux.winRate = estimateOut(est.value);
    if (prep.objective.target != null) aux.meetsTarget = meetsTarget(est.value, prep.objective.target, prep.effort.delta);
    aux.margin = estimateOut(aux.margin);
  }
  if (aux.matchups) {
    aux.matchups = aux.matchups.map((m, j) => {
      let vs = null;
      if (set && baseSet) {
        const lane = (s) => setOf([s.main[j]], {});
        vs = contrastOut(contrastSets(prep.objective, lane(set), lane(baseSet), { alpha: ALPHA, delta: prep.effort.delta, deltaKind: prep.effort.deltaKind }));
      }
      return { ...m, value: estimateOut(m.value), vsBaseline: vs };
    });
  }
  if (prep.target.opponents) {
    const d = prep.target.opponents.filter((o) => o.fighter.defaulted?.length).map((o) => ({ opponentId: o.id, keys: [...o.fighter.defaulted] }));
    if (d.length) aux.defaulted = d;
  }
  for (const k of ['meanMs', 'timeoutShare']) if (k in aux) aux[k] = Number.isFinite(aux[k]) ? aux[k] : null;
  return aux;
}

function lineOf(space, cand) {
  return describeBuild(...space.describeArgs(cand)).map((l) => ({ label: l.label, value: l.value, ...(l.inactive ? { inactive: l.inactive } : {}) }));
}

function nextLook(n, need) {
  let t = Math.max(2 * n, 1);
  while (need && t < need) t *= 2;
  return t;
}

/** A provisional row: what a cancelled run (or live progress) can show without more fights. */
async function provisionalRow(prep, run, arm, B, stages) {
  const { space, objective } = prep;
  let set = null;
  for (const s of stages) {
    set = await run.heldSet(arm, s);
    if (set) break;
  }
  const value = set ? estimateOut({ ...objective.estimate(set, { alpha: ALPHA }).value, seed: null }) : { est: null, lo: null, hi: null, n: 0, seed: null, level: 0.95, alphaAdj: ALPHA, method: null };
  const changes = arm.key === B.key ? [] : changesOf(space, B.cand, arm.cand).map((c) => ({ ...c, own: null, needed: null, keptBecause: null }));
  return {
    rank: 0, tieGroup: null, isBaseline: arm.key === B.key, provisional: true, key: arm.key, engineKey: run.ekOf(arm),
    candidate: arm.cand, value, aux: {}, vsBaseline: null, changes, power: space.powerOf(arm.cand), remainder: null,
    writes: arm.key === B.key ? [] : writesOf(space, B.cand, arm.cand, changes), runMore: null, lines: lineOf(space, arm.cand),
  };
}

/** Rows that hold I1-I3 (result.js rowViolations); strict throws on the first violation, else it is withheld with a warning. */
function withholdViolations(space, B, rows, { strict, warnings, decided }) {
  const kept = [];
  for (const r of rows) {
    const v = rowViolations(space, B.cand, r, { decided: decided(r) });
    if (v.length && strict) throw new Error(`Optimiser invariant violated on row ${r.key}: ${v.join('; ')}`);
    if (v.length) warnings.push({ code: 'invariant', severity: 'warn', message: `A build was withheld: ${v.join('; ')}` });
    else kept.push(r);
  }
  return kept;
}

/**
 * Whether two adjacent `better` rows are resolved apart (groupTies): one fixed-n contrast on the stage
 * and n `pick(a, b)` returns ({stage, n}).
 */
function apartOn(prep, run, pick) {
  const { objective, effort } = prep;
  return async (a, b, alpha) => {
    const { stage, n } = pick(a, b);
    const x = await run.getSet(run.armOf(a.candidate), stage, n);
    const y = await run.getSet(run.armOf(b.candidate), stage, n);
    return contrastSets(objective, x, y, { alpha, delta: effort.delta, deltaKind: effort.deltaKind, seed: stage.seed }).significant;
  };
}

const strictDefault = () => {
  try {
    return import.meta.env?.MODE === 'test' || import.meta.env?.DEV === true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------------------------
// the task

/**
 * Optimise one preset (A.7-A.10). Request: {character, presetId?, realm?, target?, objective?, space?,
 * effort?, seed?, resumeFrom?, jobId?}. Returns an OptimiserResult (simulation.md §Result); a request
 * that cannot run throws, a baseline that breaks a game rule returns status 'failed'.
 * @param {Object} request
 * @param {{signal?: AbortSignal, onProgress?: Function, onCheckpoint?: Function, strict?: boolean}} [hooks]
 */
export async function optimize(request, hooks = {}) {
  const prep = prepare(request);
  const { space, objective, effort, seeds, target, warnings } = prep;
  const strict = hooks.strict ?? strictDefault();
  const echo = { request: prep.requestEcho, target: targetOut(target), objective: objectiveOut(objective) };
  const t0 = Date.now();

  const legal = legalityOf(space.character, space.presetId, space.start);
  if (!legal.ok) return failedResult({ ...echo, warnings, baselineViolations: legal.violations });
  if (!space.admissible(space.start)) {
    const detail = powerFloorText(space.powerOf(space.start), space.powerFloor);
    return failedResult({ ...echo, warnings, error: detail, baselineViolations: [{ gate: 'powerFloor', field: 'powerFloor', detail }] });
  }

  const cp = request.resumeFrom;
  const resumable = cp?.schema === CHECKPOINT_SCHEMA && cp.requestKey === prep.requestKey && cp.characterKey === prep.characterKey && Array.isArray(cp.log);
  if (cp && !resumable) warnings.push({ code: 'checkpoint-ignored', severity: 'info', message: 'The saved progress belongs to a different request or character; the run started over.' });
  const jobId = request.jobId ?? `opt-${prep.requestKey.split(':')[1] ?? 'job'}`;
  const run = createRun(prep, { ...hooks, jobId, replay: resumable ? cp.log : null });
  const { st, armOf } = run;
  const B = armOf(space.start);
  if (run.ekOf(B) == null) {
    return failedResult({ ...echo, warnings, error: 'The current preset cannot be simulated: an engine input is missing or not a number.' });
  }
  const S1 = { id: 'search', seed: seeds.search };
  const S2 = { id: 'minimise', seed: seeds.minimise };
  const S3 = { id: 'confirm', seed: seeds.confirm };
  const onCheckpoint = hooks.onCheckpoint ?? (() => {});

  let searchOut = null;
  let finals = [];
  let rowsDraft = [];
  try {
    // screen: the baseline's first look (the space and its legality are checked above)
    run.setPhase('screen');
    await run.getSet(B, S1, effort.n0);
    // win rate: a baseline that already meets the target needs no change (the check is on S3, whose
    // baseline fights confirm reuses; the baseline is fixed, so no selection rides on it)
    const goal = isWinRateKind(objective.kind) ? await run.goalCheck(B, S3) : null;
    if (goal?.meets) return alreadyResult(prep, run, B, goal, await run.getSet(B, S3, goal.n), echo, S3, t0);

    run.setPhase('search');
    searchOut = await searchPhase(prep, run);
    const fmap = new Map();
    for (const a of [...searchOut.optima, ...searchOut.contenders]) {
      if (!a || a.key === B.key) continue;
      const F = searchOut.canonArm(a);
      if (F.key !== B.key && !fmap.has(F.key)) fmap.set(F.key, F);
    }
    finals = [...fmap.values()];
    st.provisional = null;
    onCheckpoint(run.checkpoint({ finalists: finals.map((a) => a.key) }));

    // minimise (S2)
    run.setPhase('minimise');
    const ctx2 = { space, B, armOf, objective, compare: (X, Y, a) => run.compare(X, Y, S2, a), prefetch: (arms) => run.prefetch(arms, S2, effort.n0) };
    const minimised = new Map();
    for (const F of finals) {
      const m = await minimise(ctx2, F, { alpha: effort.alpha, alphaFinal: effort.alpha / finals.length });
      for (const d of m.dropped) {
        if (d.contrast.identical) st.merged.sampleIdentical++;
        if (d.contrast.verdict === 'unresolved') {
          warnings.push({ code: 'change-dropped-unresolved', severity: 'info', message: `${d.change.label} (${d.change.from} to ${d.change.to}) was dropped: too close to call at ${d.contrast.n} fights.` });
        }
      }
      if (m.arm.key !== B.key && !minimised.has(m.arm.key)) minimised.set(m.arm.key, { arm: m.arm, decided: m.decided });
    }
    rowsDraft = [...minimised.values()];
    onCheckpoint(run.checkpoint({ finalists: finals.map((a) => a.key), minimised: Object.fromEntries(rowsDraft.map((r) => [r.arm.key, Object.keys(r.decided)])) }));

    // confirm (S3): every row against the baseline, Holm across rows
    run.setPhase('confirm');
    await run.prefetch([B, ...rowsDraft.map((r) => r.arm)], S3, effort.n0);
    const vs = await holmSequential(rowsDraft, effort.alpha, (r, a) => run.compare(r.arm, B, S3, a));
    rowsDraft.forEach((r, i) => { r.vs = vs[i]; });

    // attribute (S3, at each row's own n)
    run.setPhase('attribute');
    const ctx3 = {
      space, B, armOf, objective,
      contrastAt: (X, Y, n, a) => run.contrastAt(X, Y, S3, n, a),
      getSet: (a, n) => run.getSet(a, S3, n),
      prefetch: (arms, n) => run.prefetch(arms, S3, n),
    };
    for (const r of rowsDraft) {
      if (r.vs.verdict === 'worse') continue;
      r.attr = await attribute(ctx3, r.arm, r.vs.n, { alpha: effort.alpha, seed: S3.seed });
    }

    // assemble
    const nBase = Math.max(effort.n0, ...rowsDraft.map((r) => r.vs.n));
    const baseSet = await run.getSet(B, S3, nBase);
    const shown = rowsDraft.filter((r) => r.vs.verdict !== 'worse');
    const rows = [];
    for (const r of shown) {
      const set = await run.getSet(r.arm, S3, r.vs.n);
      const est = objective.estimate(set, { alpha: ALPHA });
      const changes = r.attr.changes.map((c) => ({ ...c, own: contrastOut(c.own), needed: contrastOut(c.needed) }));
      rows.push({
        rank: 0, tieGroup: null, isBaseline: false, provisional: false, key: r.arm.key, engineKey: run.ekOf(r.arm), candidate: r.arm.cand,
        value: estimateOut({ ...est.value, seed: S3.seed }), aux: auxOf(prep, est, set, await run.getSet(B, S3, r.vs.n)),
        vsBaseline: contrastOut(r.vs), changes, power: space.powerOf(r.arm.cand),
        remainder: r.attr.remainder, writes: writesOf(space, B.cand, r.arm.cand, changes),
        runMore: r.vs.verdict === 'unresolved' ? { targetN: nextLook(r.vs.n, r.vs.nNeeded), reason: 'unresolved' } : null,
        lines: lineOf(space, r.arm.cand),
        _score: objective.score(set),
        _primary: objective.primary ? objective.primary(set) : 0,
        _decided: r.decided,
        _sig: `${r.vs.n}|${hashSeed(...set.main.map((l) => l.join(',')))}`,
        _dist: r.arm.dist,
      });
    }
    // builds equal in effect on this target (bit-identical outcomes, A.5 b): the nearest one stays
    const equal = nearestOfEqual(rows);
    st.merged.sampleIdentical += equal.merged;
    const kept = withholdViolations(space, B, equal.rows, { strict, warnings, decided: (r) => r._decided });
    const ranked = await groupTies(rankRows(kept, (r) => r._score, { primaryOf: objective.primary ? (r) => r._primary : null }), apartOn(prep, run, (a, b) => ({ stage: S3, n: Math.min(a.vsBaseline.n, b.vsBaseline.n) })));

    const baseEst = objective.estimate(baseSet, { alpha: ALPHA });
    const baseline = {
      rank: 0, tieGroup: null, isBaseline: true, provisional: false, key: B.key, engineKey: run.ekOf(B), candidate: B.cand,
      value: estimateOut({ ...baseEst.value, seed: S3.seed }), aux: auxOf(prep, baseEst, null, null), vsBaseline: null, changes: [], power: space.powerOf(B.cand),
      remainder: null, writes: [], runMore: null, lines: lineOf(space, B.cand),
    };
    const rowsOut = ranked.map(({ _score, _primary, _decided, _sig, _dist, ...r }) => r);
    st.phaseState.attribute = 'done';
    st.phaseMs.attribute += Date.now() - st.phaseStart;
    const headline = headlineOf(rowsOut, shown.length === rowsDraft.length ? 0 : rowsDraft.length - shown.length);
    const goalOut = goal ? goalOf(objective, baseline, rowsOut, goal) : null;
    if (goalOut) headline.text = goalOut.text;
    const result = {
      schema: RESULT_SCHEMA,
      status: 'done',
      aborted: false,
      error: null,
      ...echo,
      headline,
      ...(goalOut ? { goal: goalOut } : {}),
      baseline,
      rows: rowsOut,
      search: searchSummary(searchOut, st),
      phases: phasesOut(st),
      multiplicity: { ...MULTIPLICITY },
      warnings: dedupeWarnings(warnings, st),
      baselineViolations: [],
      checkpoint: null,
      stats: { ms: Date.now() - t0, workers: run.workers },
    };
    return result;
  } catch (e) {
    if (!isAbort(e)) throw e;
    const phase = st.phase;
    st.phaseState[phase] = 'cancelled';
    st.phaseMs[phase] += Date.now() - st.phaseStart;
    onCheckpoint(run.checkpoint());
    const stagesNewest = [S3, S2, S1];
    const pool = rowsDraft.length ? rowsDraft.map((r) => r.arm) : finals.length ? finals : (searchOut?.optima ?? []);
    const prov = [];
    for (const a of pool) if (a.key !== B.key && !prov.some((p) => p.key === a.key)) prov.push(await provisionalRow(prep, run, a, B, stagesNewest));
    const baseline = await provisionalRow(prep, run, B, B, stagesNewest);
    return {
      schema: RESULT_SCHEMA,
      status: 'cancelled',
      aborted: true,
      error: null,
      ...echo,
      headline: headlineOf(prov, 0),
      baseline,
      rows: prov.map((r, i) => ({ ...r, rank: i + 1 })),
      search: searchOut ? searchSummary(searchOut, st) : null,
      phases: phasesOut(st),
      multiplicity: { ...MULTIPLICITY },
      warnings: dedupeWarnings(warnings, st),
      baselineViolations: [],
      checkpoint: { jobId, phase, resumable: true },
      stats: { ms: Date.now() - t0, workers: run.workers },
    };
  }
}

/** Why a baseline below the Combat Power guard cannot be optimised (also the setup's blocker text). */
export function powerFloorText(power, floor) {
  const n = (v) => formatFlat(v);
  return `The current build's Combat Power (${n(power)}) is below the floor of ${n(floor)}; lower the floor or improve the build first.`;
}

const pctText = (p) => `${Math.round(p * 1000) / 10}%`;
const countText = (n) => n.toLocaleString('en-US');
const ciText = (e) => (e.lo == null || e.hi == null ? '' : ` (95% CI ${pctText(e.lo)}-${pctText(e.hi)})`);

/**
 * The win-rate verdict (simulation.md §Win rate): 'already' (the baseline meets the target), 'reached'
 * (a row meets it; the first such row has the fewest changes) or 'not-reached' (the best row, or the
 * baseline, and how close it comes).
 */
function goalOf(objective, baseline, rows, check) {
  if (objective.goal === 'max') return chanceGoalOf(baseline, rows, check);
  const target = objective.target;
  const base = { winRate: baseline.aux.winRate, meetsTarget: baseline.aux.meetsTarget, check: { meets: check.meets, n: check.n, value: estimateOut(check.value) } };
  const reaching = rows.filter((r) => r.aux.meetsTarget === true);
  if (reaching.length) {
    const r = reaching[0];
    const k = r.changes.length;
    return {
      target, status: 'reached', baseline: base, bestKey: r.key,
      text: `${reaching.length} build${reaching.length === 1 ? '' : 's'} reach${reaching.length === 1 ? 'es' : ''} ${pctText(target)}. Fewest changes: ${k} change${k === 1 ? '' : 's'}, win rate ${pctText(r.aux.winRate.est)}${ciText(r.aux.winRate)}.`,
    };
  }
  const best = rows[0] ?? baseline;
  const w = best.aux.winRate;
  return {
    target, status: 'not-reached', baseline: base, bestKey: best.key,
    text: `No build was shown to reach ${pctText(target)}. ${best.isBaseline ? 'The current build' : 'The best build'} wins ${pctText(w.est)}${ciText(w)}.`,
  };
}

/**
 * The highest-chance verdict (simulation.md §Win rate): 'best' names the build with the best clear chance
 * (the first row shown better than the current build, else the current build); 'no-wins' when no build
 * won a single fight, with how far the build that gets furthest goes (its mean progress score, the share
 * of the step's HP removed). 'already' is alreadyResult's.
 */
function chanceGoalOf(baseline, rows, check) {
  const base = { winRate: baseline.aux.winRate, check: { meets: check.meets, n: check.n, value: estimateOut(check.value) } };
  const best = rows.find((r) => r.vsBaseline?.verdict === 'better') ?? baseline;
  const k = best.changes.length;
  const who = best.isBaseline ? 'the current build' : `${k} change${k === 1 ? '' : 's'}`;
  const w = best.aux.winRate;
  if ([baseline, ...rows].every((r) => r.aux.winRate.est === 0)) {
    const n = Math.max(baseline.aux.winRate.n, ...rows.map((r) => r.aux.winRate.n));
    return {
      mode: 'max', target: null, status: 'no-wins', baseline: base, bestKey: best.key, progress: best.aux.margin,
      text: `No build won any of ${countText(n)} fights; the build that gets furthest (${who}) removes ${pctText(best.aux.margin.est)} of the step's HP.`,
    };
  }
  return {
    mode: 'max', target: null, status: 'best', baseline: base, bestKey: best.key,
    text: best.isBaseline
      ? `No change was shown to raise the chance to win. The current build wins ${pctText(w.est)}${ciText(w)}.`
      : `Best chance to win: ${pctText(w.est)}${ciText(w)} with ${who}; the current build wins ${pctText(baseline.aux.winRate.est)}.`,
  };
}

/** The result of a run whose baseline already meets the win-rate target (or clears every try): no search, no rows. */
function alreadyResult(prep, run, B, goal, set, echo, S3, t0) {
  const { space, objective, warnings } = prep;
  // the decision's own interval (alpha / looks) on the same fights: the value shown is the value tested
  const est = objective.estimate(set, { alpha: goal.value.alphaAdj });
  const value = estimateOut({ ...est.value, seed: S3.seed });
  const baseline = {
    rank: 0, tieGroup: null, isBaseline: true, provisional: false, key: B.key, engineKey: run.ekOf(B), candidate: B.cand,
    value, aux: auxOf(prep, est, null, null), vsBaseline: null, changes: [], remainder: null, writes: [], runMore: null,
    lines: lineOf(space, B.cand),
  };
  const text = `Already clears at ${pctText(value.est)}${ciText(value)}. No change needed.`;
  const st = run.st;
  st.phaseState[st.phase] = 'done';
  st.phaseMs[st.phase] += Date.now() - st.phaseStart;
  return {
    schema: RESULT_SCHEMA,
    status: 'done',
    aborted: false,
    error: null,
    ...echo,
    headline: { better: 0, equivalent: 0, unresolved: 0, worseHidden: 0, text },
    goal: {
      ...(objective.goal === 'max' ? { mode: 'max' } : {}), target: objective.target, status: 'already',
      baseline: { winRate: value, ...(objective.goal === 'max' ? {} : { meetsTarget: true }), check: { meets: true, n: goal.n, value } }, bestKey: B.key, text,
    },
    baseline,
    rows: [],
    search: null,
    phases: phasesOut(st),
    multiplicity: { ...MULTIPLICITY },
    warnings: dedupeWarnings(warnings, st),
    baselineViolations: [],
    checkpoint: null,
    stats: { ms: Date.now() - t0, workers: run.workers },
  };
}

function dedupeWarnings(warnings, st) {
  const out = [...warnings];
  if (st.notSimulable) out.push({ code: 'arms-not-simulable', severity: 'info', message: `${st.notSimulable} build${st.notSimulable === 1 ? '' : 's'} could not be simulated (an engine input is missing) and were skipped.` });
  const seen = new Set();
  return out.filter((w) => {
    const k = `${w.code}|${w.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function phasesOut(st) {
  return PHASES.map((p) => ({
    ...p,
    state: st.phaseState[p.id] === 'current' ? 'done' : st.phaseState[p.id],
    fights: st.fights[p.id],
    ms: st.phaseMs[p.id],
  }));
}

function searchSummary(s, st) {
  const f = st.fights;
  const search = f.screen + f.search;
  const confirm = f.confirm + f.attribute;
  return {
    strategy: s.strategy,
    jointSize: s.jointSize,
    blocks: s.blocks,
    starts: s.starts,
    optima: s.optimaCount,
    evaluated: st.evaluated.size,
    merged: { ...st.merged },
    belowFloor: st.belowFloor.size,
    fights: { search, minimise: f.minimise, confirm, total: search + f.minimise + confirm },
    unresolved: s.unresolved,
  };
}

// ---------------------------------------------------------------------------------------------
// Run more (A.9 requests)

/**
 * Re-measure rows of a finished result, their changes and the baseline at a fixed `targetN` on a
 * fresh seed (S4k). Request: {character, result, rowKeys?, targetN, seed?, round?}. Returns the
 * result with those rows (and the baseline) updated, the rows re-checked (I1, I2), re-ranked and
 * re-grouped, rows now `worse` hidden, and `more: {round, targetN, seed, rowKeys}`.
 */
export async function optimizeMore(request, hooks = {}) {
  const { character, result } = request ?? {};
  if (!result || result.schema !== RESULT_SCHEMA || result.status !== 'done') throw new Error('optimizeMore: needs a finished optimiser result');
  const r = result.request;
  const prep = prepare({ character, presetId: r.presetId, realm: r.realm, target: r.target, objective: r.objective, space: r.space, powerFloor: r.powerFloor, effort: r.effort, seed: r.seed });
  if (prep.characterKey !== r.characterKey) throw new Error('optimizeMore: the character has changed since this run; run the optimiser again');
  const targetN = Number.isInteger(request.targetN) && request.targetN >= 2 ? request.targetN : null;
  if (!targetN) throw new Error('optimizeMore: targetN must be an integer >= 2');
  const round = Number.isInteger(request.round) && request.round >= 1 ? request.round : (result.more?.round ?? 0) + 1;
  const S3 = { id: 'confirm', seed: prep.seeds.confirm };
  const S4 = { id: `more${round}`, seed: moreSeed(prep.seed, prep.target.key, round) };
  const { space, objective, effort } = prep;
  const strict = hooks.strict ?? strictDefault();
  const run = createRun(prep, { ...hooks, jobId: request.jobId ?? null, replay: null });
  const { armOf } = run;
  const B = armOf(space.start);
  const wanted = new Set(Array.isArray(request.rowKeys) ? request.rowKeys : result.rows.map((x) => x.key));
  const picked = result.rows.filter((x) => wanted.has(x.key));
  try {
    run.setPhase('confirm');
    const arms = picked.map((x) => armOf(x.candidate));
    await run.prefetch([B, ...arms], S4, targetN);
    const vs = await holmFixed(arms.map((a) => [a, B]), effort.alpha, (X, Y, n, a) => run.contrastAt(X, Y, S4, n, a), targetN);
    run.setPhase('attribute');
    const ctx = {
      space, B, armOf, objective,
      contrastAt: (X, Y, n, a) => run.contrastAt(X, Y, S4, n, a),
      getSet: (a, n) => run.getSet(a, S4, n),
      prefetch: (list, n) => run.prefetch(list, S4, n),
    };
    const baseSet = await run.getSet(B, S4, targetN);
    const updated = new Map();
    for (let i = 0; i < arms.length; i++) {
      const set = await run.getSet(arms[i], S4, targetN);
      const est = objective.estimate(set, { alpha: ALPHA });
      const attr = await attribute(ctx, arms[i], targetN, { alpha: effort.alpha, seed: S4.seed });
      const changes = attr.changes.map((c) => ({ ...c, own: contrastOut(c.own), needed: contrastOut(c.needed) }));
      updated.set(arms[i].key, {
        value: estimateOut({ ...est.value, seed: S4.seed }), aux: auxOf(prep, est, set, baseSet), vsBaseline: contrastOut(vs[i]),
        changes, remainder: attr.remainder,
        runMore: vs[i].verdict === 'unresolved' ? { targetN: nextLook(targetN, vs[i].nNeeded), reason: 'unresolved' } : null,
      });
    }
    const baseEst = objective.estimate(baseSet, { alpha: ALPHA });
    // Re-rank on each row's latest data: a re-measured row on S4 at targetN, the others on S3 at their
    // confirm n (the same fights the run reported). Adjacent rows are resolved apart on S4 when both were
    // re-measured, else on S3 at the smaller of their confirm n.
    const confirmN = new Map(result.rows.map((x) => [x.key, x.vsBaseline.n]));
    const merged = result.rows.map((x) => (updated.has(x.key) ? { ...x, ...updated.get(x.key) } : x));
    const shown = merged.filter((x) => x.vsBaseline.verdict !== 'worse');
    const warnings = [...(result.warnings ?? [])];
    const kept = withholdViolations(space, B, shown, { strict, warnings, decided: () => null });
    const scores = new Map();
    for (const x of kept) {
      const set = updated.has(x.key) ? await run.getSet(armOf(x.candidate), S4, targetN) : await run.getSet(armOf(x.candidate), S3, confirmN.get(x.key));
      scores.set(x.key, objective.score(set));
    }
    const pick = (a, b) => (updated.has(a.key) && updated.has(b.key)
      ? { stage: S4, n: targetN }
      : { stage: S3, n: Math.min(confirmN.get(a.key), confirmN.get(b.key)) });
    const primary = new Map();
    if (objective.primary) {
      for (const x of kept) {
        const set = updated.has(x.key) ? await run.getSet(armOf(x.candidate), S4, targetN) : await run.getSet(armOf(x.candidate), S3, confirmN.get(x.key));
        primary.set(x.key, objective.primary(set));
      }
    }
    const rows = await groupTies(rankRows(kept, (x) => scores.get(x.key), { primaryOf: objective.primary ? (x) => primary.get(x.key) : null }), apartOn(prep, run, pick));
    const baseline = { ...result.baseline, value: estimateOut({ ...baseEst.value, seed: S4.seed }), aux: auxOf(prep, baseEst, null, null) };
    const headline = headlineOf(rows, result.headline.worseHidden + merged.length - shown.length);
    const goal = result.goal ? goalOf(objective, baseline, rows, result.goal.baseline.check) : null;
    if (goal) headline.text = goal.text;
    return {
      ...result,
      baseline,
      rows,
      warnings,
      headline,
      ...(goal ? { goal } : {}),
      more: { round, targetN, seed: S4.seed, rowKeys: [...updated.keys()] },
    };
  } catch (e) {
    if (!isAbort(e)) throw e;
    return { ...result, aborted: true };
  }
}
