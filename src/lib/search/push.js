// search/push.js (O4, backlog §10 item 1): the Push goal, the deepest rung of a ladder (dungeon steps,
// village raid steps, Oblivion floors, campaign levels) the build clears at the win-rate target, and the
// fewest-changes build that gets there. The procedure, its stop rule, seeds, multiplicity and result
// block are docs/Reference/simulation.md §Push; this file implements them.
//
// `pushCore` is the algorithm over an abstract environment (rungs, a fight sampler, the one-change
// neighbours of a build, a per-rung optimiser), so tests can drive it with synthetic clear rates;
// `push` wires it to the real build space, objectives and `optimize`.
import { hashSeed } from '../engine/rng.js';
import { lookSchedule, wilsonInterval, pairedProportion } from '../engine/stats/index.js';
import { stableStringify } from '../engine/metrics.js';
import { EngineInputError } from '../engine/validate.js';
import { PVE_CHAPTERS, PVE_HARD_CHAPTERS, PVE_HARD_CHAPTER_OFFSET, PVE_PROGRESS_CONSTANTS } from '../game/combatPve.js';
import { OBLIVION_FLOORS } from '../game/pveContent.js';
import { celestialDifficulty } from '../game/celestial.js';
import { MAX_PLAYER_LEVEL } from '../game/classes.js';
import { dungeonSteps, raidSteps } from '../engine/pve/enemies.js';
import { describeBuild } from '../build/describe.js';
import { resolveTarget, makeObjective, meetsTarget } from './objectives.js';
import { createSampler, AbortError, isAbort } from './sampler.js';
import { candidateEngineKey } from './effect.js';
import { legalityOf } from './legality.js';
import { prepare, optimize, ALPHA } from './search.js';
import { RESULT_SCHEMA, MULTIPLICITY, targetOut, objectiveOut, estimateOut, failedResult } from './result.js';

export const PUSH_KIND = 'push';
const PROGRESS_MS = 250;
const YIELD_MS = 25;
export const PUSH_CHECKPOINT_SCHEMA = 'push-checkpoint/1';
/** Target kinds that form a ladder. */
export const LADDER_KINDS = Object.freeze(['chapter', 'dungeon', 'raid', 'oblivion', 'celestial']);
/** Push phases, in the order a run first reaches them (climb and optimise alternate per rung). */
export const PUSH_PHASES = Object.freeze([
  { id: 'climb', label: 'Climb' },
  { id: 'screen', label: 'Screen' },
  { id: 'optimise', label: 'Optimise' },
  { id: 'confirm', label: 'Confirm' },
]);

// ---------------------------------------------------------------------------------------------
// ladders

const LEVELS = PVE_PROGRESS_CONSTANTS.levelsPerChapter;
const NORMAL_CHAPTERS = PVE_CHAPTERS.map((c) => c.chapter).sort((a, b) => a - b);
const HARD_CHAPTERS = PVE_HARD_CHAPTERS.map((c) => c.chapter).sort((a, b) => a - b);
const LAST_OBLIVION_FLOOR = Math.max(...OBLIVION_FLOORS.map((f) => f.floor));
const hardDisplay = (chapter) => PVE_HARD_CHAPTERS.find((c) => c.chapter === chapter)?.displayChapter ?? chapter - PVE_HARD_CHAPTER_OFFSET;

const rung = (spec, short, key = stableStringify(spec)) => ({ spec, key, short });

/**
 * The ladder a ladder target belongs to: its rungs in order (difficulty assumed to rise along them,
 * simulation.md §Push) and the index of the target's own rung (the start). A campaign ladder is the
 * track of the start chapter: normal chapters 1-11 or hard chapters 12-22, each level in order. A Celestial
 * ladder is the party's scaling level, from the difficulty's unlock level to the player level cap, the
 * partner and the rest of the spec fixed; a rung's key is the resolved target's, so it carries the
 * partner's build (`ctx` is resolveTarget's: {character, partner}).
 * @returns {{kind: string, label: string, unit: 'step'|'level', rungs: Array<{spec: Object, key: string, short: string}>, start: number}}
 */
export function ladderOf(raw, ctx = {}) {
  const t = resolveTarget(raw, ctx);
  const spec = t.spec;
  let rungs;
  let label;
  if (spec.kind === 'dungeon') {
    rungs = dungeonSteps(spec.id).map((s) => rung({ kind: 'dungeon', id: spec.id, step: s.step }, `step ${s.step}`));
    label = t.label.replace(/, step \d+$/, '');
  } else if (spec.kind === 'raid') {
    rungs = raidSteps(spec.id).map((s) => rung({ kind: 'raid', id: spec.id, step: s.step }, `step ${s.step}`));
    label = t.label.replace(/, step \d+$/, '');
  } else if (spec.kind === 'oblivion') {
    const cut = spec.applyOutputCut ? { applyOutputCut: true } : {};
    rungs = Array.from({ length: LAST_OBLIVION_FLOOR }, (_, i) => rung({ kind: 'oblivion', floor: i + 1, ...cut }, `floor ${i + 1}`));
    label = `Oblivion floors${cut.applyOutputCut ? ', output cut on' : ''}`;
  } else if (spec.kind === 'chapter') {
    const hard = HARD_CHAPTERS.includes(spec.chapter);
    const chapters = hard ? HARD_CHAPTERS : NORMAL_CHAPTERS;
    rungs = chapters.flatMap((c) => Array.from({ length: LEVELS }, (_, i) => rung(
      { kind: 'chapter', chapter: c, level: i + 1 },
      hard ? `hard level ${hardDisplay(c)}-${i + 1}` : `level ${c}-${i + 1}`,
    )));
    label = hard ? 'Hard campaign' : 'Campaign';
  } else if (spec.kind === 'celestial') {
    const floor = celestialDifficulty(spec.difficulty).unlockLevel;
    const from = t.celestial.level;
    if (from < floor || from > MAX_PLAYER_LEVEL) throw new Error(`Push on the Celestial Trial needs a party level from ${floor} (the ${spec.difficulty} unlock) to ${MAX_PLAYER_LEVEL}, got ${from}`);
    rungs = Array.from({ length: MAX_PLAYER_LEVEL - floor + 1 }, (_, i) => {
      const level = floor + i;
      const rs = { ...spec, level };
      return rung(rs, `level ${level}`, resolveTarget(rs, ctx).key);
    });
    label = t.label.replace(/, L\d+/, '');
  } else {
    throw new Error(`Push needs a ladder (chapter, dungeon, raid, Oblivion or Celestial), got '${spec.kind}'`);
  }
  const start = rungs.findIndex((r) => r.key === t.key);
  if (start < 0) throw new Error(`'${t.label}' is not on its ladder`);
  return { kind: spec.kind, label, rungs, start, unit: spec.kind === 'celestial' ? 'level' : 'step' };
}

// ---------------------------------------------------------------------------------------------
// the algorithm

const winsOf = (set) => {
  let k = 0;
  for (const v of set.main[0]) if (v >= 1) k++;
  return k;
};
const rateOf = (set, alpha) => wilsonInterval(winsOf(set), set.n, { alpha });

/**
 * Push over an environment (simulation.md §Push):
 *   env = {rungs: [{key, short}], start, baseline, keyOf(build), getSet(build, r, stage, n) -> set,
 *          neighbours(build) -> builds, optimise(r, {resumeFrom, onCheckpoint, onProgress}) ->
 *          {status: 'already'|'reached'|'not-reached'|'cancelled', build?, row?, baseline?, best?, fights}}
 *   opts = {tau, effort: {n0, maxN, delta, alpha}, seed, replay?, inner?, signal?, onProgress?, onCheckpoint?}
 * Every decision is a logged step (`kind`, a hash of its inputs, its output), so a checkpoint's log
 * replays to the cancel point without fights; a cancelled per-rung optimisation resumes from its own
 * checkpoint (`inner`).
 */
export async function pushCore(env, opts) {
  const { tau, effort, seed, signal } = opts;
  const alpha = effort.alpha ?? ALPHA;
  const { rungs, start, baseline: B } = env;
  const last = rungs.length - 1;
  const bKey = env.keyOf(B);
  const log = [];
  let replay = opts.replay ?? null;
  let inner = opts.inner ?? null; // {rung, checkpoint}: the optimisation a resume continues
  let innerLive = null;
  const ledger = new Map();
  let stepGets = null;
  const phaseFights = Object.fromEntries(PUSH_PHASES.map((p) => [p.id, 0]));
  const probes = [];
  const notes = new Map(); // rung -> what is known, for progress
  const phasesSeen = new Set();
  let phase = 'climb';
  let at = start;

  const checkpoint = () => ({ log: log.slice(), inner: innerLive ?? inner });
  const fights = () => Object.values(phaseFights).reduce((a, b) => a + b, 0);
  const progress = (extra = {}) => opts.onProgress?.({ phase, phasesSeen: [...phasesSeen], rung: at, notes: new Map(notes), fights: fights(), ...extra });
  const setPhase = (p, r) => {
    phase = p;
    at = r;
    phasesSeen.add(p);
    progress();
  };
  const raise = (k, n) => {
    const prev = ledger.get(k) ?? 0;
    if (n > prev) {
      ledger.set(k, n);
      phaseFights[phase] += n - prev;
    }
    if (stepGets) stepGets.set(k, Math.max(stepGets.get(k) ?? 0, n));
  };

  async function step(kind, parts, live) {
    if (signal?.aborted) throw new AbortError();
    const sig = hashSeed(kind, ...parts);
    if (replay) {
      const e = replay[log.length];
      if (e && e.kind === kind && e.sig === sig) {
        for (const [k, n] of e.gets ?? []) raise(k, n);
        if (e.kind === 'optimise') phaseFights.optimise += e.out.fights ?? 0;
        log.push(e);
        return e.out;
      }
      replay = null;
    }
    const outer = stepGets;
    stepGets = new Map();
    let out;
    try {
      out = await live();
    } finally {
      const gets = stepGets;
      stepGets = outer;
      if (out !== undefined) {
        log.push({ kind, sig, out, gets: [...gets] });
        if (kind === 'optimise') phaseFights.optimise += out.fights ?? 0;
      }
    }
    return out;
  }

  const stageOf = (role, r) => ({ id: `push-${role}|${rungs[r].key}`, seed: hashSeed(`push-${role}`, seed, rungs[r].key) });
  async function get(build, r, stage, n) {
    raise(`${stage.id}|${env.keyOf(build)}`, n);
    return env.getSet(build, r, stage, n);
  }

  /** Does `build` meet the target on rung r? Sequential looks n0 … maxN, Wilson at alpha / looks. */
  async function check(build, who, r, role, a) {
    const key = env.keyOf(build);
    const out = await step('check', [role, rungs[r].key, key, a], async () => {
      const looks = lookSchedule(effort.n0, effort.maxN);
      const al = a / looks.length;
      const stage = stageOf(role, r);
      for (let k = 0; k < looks.length; k++) {
        const w = rateOf(await get(build, r, stage, looks[k]), al);
        const meets = meetsTarget(w, tau, effort.delta);
        if (meets != null || k === looks.length - 1) return { meets, value: { est: w.est, lo: w.lo, hi: w.hi, n: looks[k], alphaAdj: al, method: 'wilson' } };
      }
      throw new Error('unreachable');
    });
    probes.push({ role, who, key, rung: r, meets: out.meets, value: out.value });
    notes.set(r, { ...(notes.get(r) ?? {}), [who === 'current' ? 'current' : 'build']: out.meets === true ? 'clears' : out.meets === false ? 'fails' : 'open' });
    progress();
    return out;
  }

  /** Gallop up from a known pass (or below the start), then bisect: the deepest rung the build clears. */
  async function climb(build, who, knownPass) {
    setPhase('climb', knownPass + 1);
    let lo = knownPass;
    let hi = null;
    const pass = async (r) => {
      at = r;
      return (await check(build, who, r, 'climb', alpha)).meets === true;
    };
    if (lo < start) {
      if (!(await pass(start))) return start - 1;
      lo = start;
    }
    let size = 1;
    while (hi == null && lo < last) {
      const r = Math.min(last, lo + size);
      if (await pass(r)) {
        lo = r;
        size *= 2;
      } else hi = r;
    }
    while (hi != null && hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (await pass(mid)) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /**
   * The stop rule (simulation.md §Push, Stop rule): the builds around which rung r is searched (the current
   * build, the deepest build so far), every build one change from them, and every (centre, one-change)
   * pair, looked at n0, 2n0, … maxN at alpha / ((builds + pairs) × looks). Two questions per look: is any
   * build plausibly at the target (Wilson), and does any one change plausibly raise the rate by δ or more
   * (Tango on the paired win bits: a direction the optimiser's ascent could follow towards a build several
   * changes away). 'go' (optimise) as soon as one build meets the target or one change confidently raises
   * the rate, or when anything is still open at maxN; 'stop' only when every build is confidently below
   * the target AND every change is confidently flat (raises the rate by less than δ).
   */
  async function screen(r, around) {
    setPhase('screen', r);
    return step('screen', ['flat', rungs[r].key, ...around.map((b) => env.keyOf(b))], async () => {
      const seen = new Map();
      const add = (c) => {
        const k = env.keyOf(c);
        if (!seen.has(k)) seen.set(k, { c, key: k, last: null, open: true });
        return seen.get(k);
      };
      const pairs = [];
      const pairSeen = new Set();
      for (const b of around) {
        const centre = add(b);
        for (const c of env.neighbours(b)) {
          const o = add(c);
          const pk = `${centre.key}>${o.key}`;
          if (o !== centre && !pairSeen.has(pk)) {
            pairSeen.add(pk);
            pairs.push({ from: centre, to: o, open: true });
          }
        }
      }
      const all = [...seen.values()];
      const looks = lookSchedule(effort.n0, effort.maxN);
      const a = alpha / ((all.length + pairs.length) * looks.length);
      const stage = stageOf('screen', r);
      // the best rate seen: each build's estimate at its last look
      const best = () => all.reduce((m, o) => (o.last && (!m || o.last.est > m.est) ? o.last : m), null);
      const out = (go, reason) => ({ go, reason, builds: all.length, pairs: pairs.length, best: best() });
      for (const n of looks) {
        const need = new Set(all.filter((o) => o.open));
        for (const p of pairs) if (p.open) need.add(p.from).add(p.to);
        const bits = new Map();
        for (const o of all) {
          if (!need.has(o)) continue;
          const set = await get(o.c, r, stage, n);
          const xs = set.main[0].slice(0, n).map((v) => (v >= 1 ? 1 : 0));
          bits.set(o, xs);
          const w = wilsonInterval(xs.reduce((s, v) => s + v, 0), n, { alpha: a });
          o.last = { key: o.key, est: w.est, lo: w.lo, hi: w.hi, n, alphaAdj: a, method: 'wilson' };
          if (!o.open) continue;
          if (meetsTarget(w, tau, effort.delta) === true) return { ...out(true, 'meets'), best: o.last };
          if (w.hi < tau) o.open = false;
        }
        for (const p of pairs) {
          if (!p.open) continue;
          const d = pairedProportion(bits.get(p.to), bits.get(p.from), { alpha: a });
          if (d.lo > 0) return { ...out(true, 'gradient'), gradient: { from: p.from.key, to: p.to.key, est: d.delta, lo: d.lo, hi: d.hi, n } };
          if (d.hi < effort.delta) p.open = false;
        }
        if (!all.some((o) => o.open) && !pairs.some((p) => p.open)) return out(false, 'below');
      }
      return out(true, 'open');
    });
  }

  async function optimiseAt(r) {
    setPhase('optimise', r);
    const out = await step('optimise', [rungs[r].key], async () => {
      const resumeFrom = inner && inner.rung === rungs[r].key ? inner.checkpoint : null;
      inner = null;
      const o = await env.optimise(r, {
        resumeFrom,
        onCheckpoint: (cp) => {
          innerLive = { rung: rungs[r].key, checkpoint: cp };
          opts.onCheckpoint?.(checkpoint());
        },
        onProgress: (p) => progress({ inner: p }),
      });
      if (o.status === 'cancelled') throw new AbortError();
      innerLive = null;
      return o;
    });
    return out;
  }

  const milestones = [];
  let stop = null;
  let bDeep = start - 1;
  let best = null;
  let status = 'done';
  let confirmB = null;
  let confirmBest = null;
  try {
    bDeep = await climb(B, 'current', start - 1);
    best = { build: B, key: bKey, searched: bDeep, row: null, baselineRow: null, foundAt: null };
    milestones.push({ key: bKey, searched: bDeep, foundAt: null });
    for (;;) {
      if (best.searched >= last) {
        stop = { rung: null, reason: 'top', best: null };
        break;
      }
      const r = best.searched + 1;
      const around = best.key === bKey ? [B] : [B, best.build];
      const s = await screen(r, around);
      if (!s.go) {
        stop = { rung: r, reason: 'screen', best: s.best, builds: s.builds };
        notes.set(r, { ...(notes.get(r) ?? {}), stop: 'screen' });
        break;
      }
      const o = await optimiseAt(r);
      if (o.status === 'already') {
        probes.push({ role: 'optimise', who: 'current', key: bKey, rung: r, meets: true, value: o.check ?? null });
        bDeep = await climb(B, 'current', r);
        best = { build: B, key: bKey, searched: bDeep, row: null, baselineRow: null, foundAt: null };
      } else if (o.status === 'reached') {
        const c = await climb(o.build, 'build', r);
        best = { build: o.build, key: env.keyOf(o.build), searched: c, row: o.row, baselineRow: o.baseline, foundAt: r };
      } else {
        stop = { rung: r, reason: 'not-reached', best: o.best ?? null };
        notes.set(r, { ...(notes.get(r) ?? {}), stop: 'not-reached' });
        break;
      }
      milestones.push({ key: best.key, searched: best.searched, foundAt: r });
    }

    // confirm on fresh fights: fixed-sequence from the start rung, alpha / 2 per reported build
    setPhase('confirm', start);
    const fam = best.key === bKey ? 1 : 2;
    confirmB = await confirmSeq(B, 'current', bDeep, alpha / fam);
    confirmBest = best.key === bKey ? confirmB : await confirmSeq(best.build, 'build', best.searched, alpha / fam);
  } catch (e) {
    if (!isAbort(e)) throw e;
    status = 'cancelled';
    opts.onCheckpoint?.(checkpoint());
  }

  async function confirmSeq(build, who, upTo, a) {
    let deepest = start - 1;
    let failedAt = null;
    let value = null;
    for (let r = start; r <= upTo; r++) {
      at = r;
      const c = await check(build, who, r, 'confirm', a);
      if (c.meets !== true) {
        failedAt = r;
        break;
      }
      deepest = r;
      value = c.value;
    }
    return { deepest, failedAt, value, alpha: a };
  }

  // a build that clears a deeper rung but not a shallower one contradicts the rising-difficulty assumption
  const contradictions = [];
  const byKey = new Map();
  for (const p of probes) if (p.meets != null) (byKey.get(p.key) ?? byKey.set(p.key, []).get(p.key)).push(p);
  for (const [key, ps] of byKey) {
    for (const f of ps) {
      if (f.meets !== false) continue;
      const deeper = ps.find((p) => p.meets === true && p.rung > f.rung);
      if (deeper && !contradictions.some((c) => c.key === key && c.failed === f.rung && c.passed === deeper.rung)) {
        contradictions.push({ key, who: f.who, failed: f.rung, passed: deeper.rung, failedRole: f.role, passedRole: deeper.role });
      }
    }
  }

  return {
    status, log, inner: innerLive ?? inner, probes, contradictions, milestones, stop,
    baseline: { searched: bDeep, confirmed: confirmB },
    best: best && { ...best, confirmed: confirmBest },
    baselineKey: bKey,
    fights: fights(),
    phaseFights: { ...phaseFights },
    phasesSeen: [...phasesSeen],
    phase,
  };
}

// ---------------------------------------------------------------------------------------------
// the live environment and the result

const pctText = (p) => `${Math.round(p * 1000) / 10}%`;
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function lineOf(space, cand) {
  return describeBuild(...space.describeArgs(cand)).map((l) => ({ label: l.label, value: l.value, ...(l.inactive ? { inactive: l.inactive } : {}) }));
}

/** The real environment: the build space, a win-rate objective per rung, `optimize` per rung. */
function liveEnv(prep, request, ladder, hooks) {
  const { space } = prep;
  const tau = prep.objective.target;
  let lastYield = Date.now();
  const base = space.canonical(space.start);
  const builds = new Map();
  const buildOf = (cand) => {
    const c = space.canonical(cand);
    const key = space.key(c);
    let b = builds.get(key);
    if (!b) {
      b = { cand: c, key, ek: undefined, fighter: null };
      builds.set(key, b);
    }
    return b;
  };
  const ekOf = (b) => {
    if (b.ek === undefined) {
      try {
        b.ek = candidateEngineKey(space, b.cand);
      } catch (e) {
        if (!(e instanceof EngineInputError)) throw e;
        b.ek = null;
      }
    }
    return b.ek;
  };
  // one sampler per rung; a pool is opened only for a step that samples and closed after it
  const rungs = new Map();
  const handles = new Map();
  const rungOf = (r) => {
    let x = rungs.get(r);
    if (!x) {
      const target = resolveTarget(ladder.rungs[r].spec, { character: prep.character, partner: prep.partner });
      const objective = makeObjective({ kind: 'win-rate', target: tau }, target);
      const setup = { target: target.spec, objective: objective.spec, character: { opponents: prep.character.opponents ?? [], level: prep.character.level }, partner: prep.partner };
      const sample = hooks.pool
        ? (fighter, o) => {
          let p = handles.get(r);
          if (!p) {
            p = hooks.pool('objective', setup);
            handles.set(r, p);
          }
          return p.run({ fighter, seed: o.seed }, o.from, o.to, { signal: o.signal });
        }
        : objective.sample;
      x = { target, sampler: createSampler({ ...objective, sample }) };
      rungs.set(r, x);
    }
    return x;
  };
  const release = () => {
    for (const p of handles.values()) p.close();
    handles.clear();
  };
  return {
    rungs: ladder.rungs,
    start: ladder.start,
    baseline: buildOf(base),
    keyOf: (b) => b.key,
    buildOf,
    release,
    async getSet(b, r, stage, n) {
      const ek = ekOf(b);
      if (ek == null) throw new Error('push: a build that cannot be simulated was sampled');
      const { sampler } = rungOf(r);
      if (sampler.held(ek, stage) < n && !b.fighter) b.fighter = space.fighterOf(b.cand);
      // yield now and then so a cancel lands between inline samples (search.js does the same)
      if (Date.now() - lastYield >= YIELD_MS) {
        await new Promise((res) => setTimeout(res, 0));
        lastYield = Date.now();
      }
      return sampler.get(ek, stage, b.fighter, n, { signal: hooks.signal });
    },
    neighbours(b) {
      const out = [];
      for (const block of space.blocks) {
        if (!block.enabled) continue;
        for (const c of block.domain(b.cand)) {
          const nb = buildOf(c);
          if (nb.key !== b.key && space.admissible(nb.cand) && ekOf(nb) != null) out.push(nb);
        }
      }
      return out;
    },
    async optimise(r, { resumeFrom, onCheckpoint, onProgress }) {
      release();
      const opened = [];
      const pool = hooks.pool ? (k, s) => {
        const p = hooks.pool(k, s);
        opened.push(p);
        return p;
      } : undefined;
      try {
        const res = await optimize({
          character: prep.character, partner: prep.partner, presetId: prep.preset.id, realm: request.realm, target: ladder.rungs[r].spec,
          objective: { kind: 'win-rate', target: tau }, space: request.space, effort: request.effort, seed: prep.seed, powerFloor: request.powerFloor,
          resumeFrom, jobId: hooks.jobId,
        }, { signal: hooks.signal, onProgress, onCheckpoint, pool, strict: hooks.strict });
        const fights = res.phases?.reduce((a, p) => a + (p.fights ?? 0), 0) ?? 0;
        if (res.status === 'cancelled') return { status: 'cancelled', fights };
        if (res.status === 'failed') throw new Error(res.error?.message ?? res.headline?.text ?? 'optimise failed');
        const g = res.goal;
        if (g.status === 'already') return { status: 'already', fights, check: g.baseline.check.value };
        if (g.status === 'reached') {
          const row = res.rows.find((x) => x.key === g.bestKey);
          return { status: 'reached', fights, build: { cand: row.candidate, key: row.key }, row, baseline: res.baseline };
        }
        const top = res.rows[0] ?? res.baseline;
        return { status: 'not-reached', fights, best: { key: top.key, ...top.aux.winRate } };
      } finally {
        for (const p of opened) p.close();
      }
    },
  };
}

/**
 * The Push run (simulation.md §Push). Request: the optimiser's ({character, presetId?, realm?, target
 * (the start rung), objective {kind: 'push', target?}, space?, effort?, seed?, powerFloor?, resumeFrom?, jobId?}).
 * Returns an 'optimiser-result/2' with a `push` block; rows hold the deepest build (its changes measured
 * on the rung it was found for), so Apply and the run history work as for any run.
 */
export async function push(request, hooks = {}) {
  const prep = prepare(request);
  const { space, objective, effort, warnings } = prep;
  if (objective.kind !== PUSH_KIND) throw new Error('push: the objective must be {kind: \'push\'}');
  const ladder = ladderOf(request.target, { character: prep.character, partner: prep.partner });
  const tau = objective.target;
  const t0 = Date.now();
  const echo = { request: prep.requestEcho, target: targetOut(prep.target), objective: objectiveOut(objective) };
  const legal = legalityOf(space.character, space.presetId, space.start);
  if (!legal.ok) return { ...failedResult({ ...echo, warnings, baselineViolations: legal.violations }), phases: phasesOut() };

  const cp = request.resumeFrom;
  const resumable = cp?.schema === PUSH_CHECKPOINT_SCHEMA && cp.requestKey === prep.requestKey && cp.characterKey === prep.characterKey && Array.isArray(cp.log);
  if (cp && !resumable) warnings.push({ code: 'checkpoint-ignored', severity: 'info', message: 'The saved progress belongs to a different request or character; the run started over.' });
  const jobId = request.jobId ?? `push-${prep.requestKey.split(':')[1] ?? 'job'}`;
  const env = liveEnv(prep, request, ladder, { ...hooks, jobId });
  try {
    candidateEngineKey(space, env.baseline.cand);
  } catch (e) {
    if (!(e instanceof EngineInputError)) throw e;
    return { ...failedResult({ ...echo, warnings, error: 'The current preset cannot be simulated: an engine input is missing or not a number.' }), phases: phasesOut() };
  }

  const phaseMs = Object.fromEntries(PUSH_PHASES.map((p) => [p.id, 0]));
  let phaseAt = { id: null, t: t0 };
  let lastProgress = 0;
  const wrapCp = (c) => ({ schema: PUSH_CHECKPOINT_SCHEMA, requestKey: prep.requestKey, characterKey: prep.characterKey, ...c });
  const onProgress = (s) => {
    const now = Date.now();
    const changed = s.phase !== phaseAt.id;
    if (changed) {
      if (phaseAt.id) phaseMs[phaseAt.id] += now - phaseAt.t;
      phaseAt = { id: s.phase, t: now };
    }
    if (!changed && now - lastProgress < PROGRESS_MS) return;
    lastProgress = now;
    hooks.onProgress?.(progressOf(jobId, ladder, s, now - t0));
  };

  let core;
  try {
    core = await pushCore(env, {
      tau, effort, seed: prep.seed, signal: hooks.signal,
      replay: resumable ? cp.log : null, inner: resumable ? cp.inner ?? null : null,
      onProgress, onCheckpoint: (c) => hooks.onCheckpoint?.(wrapCp(c)),
    });
  } finally {
    env.release();
  }
  if (phaseAt.id) phaseMs[phaseAt.id] += Date.now() - phaseAt.t;
  const cancelled = core.status === 'cancelled';

  const block = pushBlock(ladder, tau, core);
  const best = core.best;
  const gain = !cancelled && best?.row && block.reached.deepest > block.baseline.deepest;
  const rows = gain ? [{ ...best.row, rank: 1, tieGroup: best.row.tieGroup ?? 0 }] : [];
  const baseRow = gain ? best.baselineRow : baselineRowOf(space, env.baseline, core, tau, effort.delta);
  if (core.contradictions.length) {
    warnings.push({
      code: 'ladder-not-monotone', severity: 'warn',
      message: `The fights contradict rising difficulty: ${core.contradictions.map((c) => `${c.who === 'current' ? 'the current build' : 'the suggested build'} cleared ${ladder.rungs[c.passed].short} but not ${ladder.rungs[c.failed].short}`).join('; ')}.`,
    });
  }
  if (!cancelled && best && best.confirmed && best.confirmed.deepest < best.searched) {
    warnings.push({
      code: 'push-unconfirmed', severity: 'warn',
      message: `The search reached ${ladder.rungs[best.searched].short}, but fresh fights confirmed only ${block.reached.deepest >= ladder.start ? ladder.rungs[block.reached.deepest].short : `none from ${ladder.rungs[ladder.start].short}`}.`,
    });
  }
  const fightsTotal = core.fights;
  return {
    schema: RESULT_SCHEMA,
    status: cancelled ? 'cancelled' : 'done',
    aborted: cancelled,
    error: null,
    ...echo,
    headline: { better: rows.length, equivalent: 0, unresolved: 0, worseHidden: 0, text: cancelled ? 'Cancelled. Resume to continue the climb.' : block.text },
    push: block,
    baseline: baseRow,
    rows,
    search: null,
    phases: phasesOut(core, phaseMs, cancelled),
    multiplicity: { ...MULTIPLICITY, push: 'fixed-sequence confirm at alpha / reported builds; each climb, screen and optimisation at its own level' },
    warnings: dedupe(warnings),
    baselineViolations: [],
    checkpoint: cancelled ? { jobId, phase: phaseAt.id, resumable: true } : null,
    stats: { ms: Date.now() - t0, workers: 1, fights: fightsTotal },
  };
}

function dedupe(warnings) {
  const seen = new Set();
  return warnings.filter((w) => {
    const k = `${w.code}|${w.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Result phases: each Push phase with its fights and time; the phase a cancel stopped in is 'cancelled'. */
function phasesOut(core = null, ms = {}, cancelled = false) {
  return PUSH_PHASES.map((p) => ({
    ...p,
    state: cancelled && core.phase === p.id ? 'cancelled' : core?.phasesSeen.includes(p.id) ? 'done' : 'not-run',
    fights: core?.phaseFights[p.id] ?? 0,
    ms: ms[p.id] ?? 0,
  }));
}

/** The live progress message: Push phases, the rung being worked on and one step per rung. */
function progressOf(jobId, ladder, s, elapsedMs) {
  const rungText = ladder.rungs[s.rung]?.short ?? '';
  const innerPhase = s.inner?.phases?.find((p) => p.state === 'current')?.label;
  const top = Math.max(s.rung, ...[...s.notes.keys()]);
  const steps = [];
  for (let r = ladder.start; r <= Math.min(ladder.rungs.length - 1, top); r++) {
    const n = s.notes.get(r) ?? {};
    const text = [n.current && `current build ${n.current}`, n.build && `suggested build ${n.build}`, n.stop && 'not reached'].filter(Boolean).join(', ');
    steps.push({ id: ladder.rungs[r].key, label: cap1(ladder.rungs[r].short), state: r === s.rung ? 'current' : 'done', text });
  }
  return {
    type: 'progress',
    jobId,
    phase: s.phase,
    phases: PUSH_PHASES.map((p) => ({ id: p.id, label: p.label, state: p.id === s.phase ? 'current' : s.phasesSeen.includes(p.id) ? 'done' : 'queued', done: null, total: null })),
    block: `${rungText}${innerPhase ? `: ${innerPhase.toLowerCase()}` : ''}`,
    counts: { evaluated: s.inner?.counts?.evaluated ?? 0, fights: s.fights + (s.inner?.counts?.fights ?? 0), eliminated: 0, merged: 0 },
    elapsedMs,
    provisional: null,
    steps,
  };
}

/** The current build's row when no other build is suggested: its last confirmed (or climbed) rung. */
function baselineRowOf(space, B, core, tau, delta) {
  const conf = core.baseline.confirmed;
  const p = conf?.value ? { value: conf.value } : [...core.probes].reverse().find((x) => x.key === B.key && x.value);
  const v = p?.value ?? null;
  const value = v ? estimateOut({ ...v, seed: null }) : { est: null, lo: null, hi: null, n: 0, seed: null, level: 0.95, alphaAdj: ALPHA, method: null };
  return {
    rank: 0, tieGroup: null, isBaseline: true, provisional: false, key: B.key, engineKey: null, candidate: B.cand,
    value, aux: { winRate: value, meetsTarget: v ? meetsTarget(v, tau, delta) : null, target: tau }, vsBaseline: null, changes: [],
    remainder: null, writes: [], runMore: null, lines: lineOf(space, B.cand),
  };
}

/**
 * The `push` block of a result (simulation.md §Push, §Result): the ladder, the reported rungs (confirmed on
 * fresh fights), where the climb stopped and why, per-rung outcomes and the headline text.
 */
export function pushBlock(ladder, tau, core) {
  const R = ladder.rungs;
  const at = (i) => (i != null && i >= ladder.start ? { index: i, label: R[i].short } : { index: null, label: null });
  const bConf = core.baseline?.confirmed?.deepest ?? ladder.start - 1;
  const best = core.best;
  const sConf = best?.confirmed?.deepest ?? ladder.start - 1;
  const reachedIdx = Math.max(bConf, sConf);
  const deeper = !!best && best.key !== core.baselineKey && sConf > bConf;
  const stopRung = core.stop?.rung ?? null;
  const searchedTop = Math.max(core.baseline?.searched ?? -1, best?.searched ?? -1);
  const shown = Math.min(R.length - 1, Math.max(ladder.start, searchedTop + 1, stopRung ?? -1));
  const rungs = [];
  for (let i = ladder.start; i <= shown; i++) {
    const outcome = (key) => {
      const ps = core.probes.filter((p) => p.rung === i && p.key === key && p.role !== 'optimise');
      const c = ps.filter((p) => p.role === 'confirm').at(-1) ?? ps.at(-1);
      return c ? (c.meets === true ? 'clears' : c.meets === false ? 'fails' : 'open') : null;
    };
    rungs.push({ index: i, label: R[i].short, key: R[i].key, current: outcome(core.baselineKey), build: best && best.key !== core.baselineKey ? outcome(best.key) : null });
  }
  const startLabel = R[ladder.start].short;
  const now = bConf >= ladder.start ? R[bConf].short : `below ${startLabel}`;
  const stopText = core.stop?.reason === 'top' ? ' That is the top of the ladder.'
    : core.stop?.reason === 'screen' ? ` ${cap1(R[stopRung].short)} is not reached at this effort: no build one change away comes plausibly near ${pctText(tau)} and no single change raises the rate (best seen ${pctText(core.stop.best?.est ?? 0)}).`
      : core.stop?.reason === 'not-reached' ? ` ${cap1(R[stopRung].short)} was not reached: the best build wins ${pctText(core.stop.best?.est ?? 0)}.`
        : '';
  let status;
  let text;
  if (deeper) {
    status = 'pushed';
    text = `Reaches ${R[sConf].short} (now: ${now}) at ${pctText(tau)}.${stopText}`;
  } else if (bConf >= ladder.start) {
    status = 'no-gain';
    text = `The current build already reaches ${R[bConf].short} at ${pctText(tau)}; no change was found that goes deeper.${stopText}`;
  } else {
    status = 'none';
    text = `Nothing reaches ${startLabel} at ${pctText(tau)} at this effort.${stopText}`;
  }
  return {
    target: tau,
    status,
    ladder: { kind: ladder.kind, label: ladder.label, size: R.length, unit: ladder.unit ?? 'step' },
    start: { index: ladder.start, label: startLabel },
    baseline: { deepest: bConf >= ladder.start ? bConf : null, label: bConf >= ladder.start ? R[bConf].short : null, searched: at(core.baseline?.searched).index },
    reached: { deepest: reachedIdx >= ladder.start ? reachedIdx : null, label: reachedIdx >= ladder.start ? R[reachedIdx].short : null, key: deeper ? best.key : null, foundAt: deeper ? at(best.foundAt).index : null, foundLabel: deeper && best.foundAt != null ? R[best.foundAt].short : null, searched: at(best?.searched).index },
    stop: core.stop ? { index: stopRung, label: stopRung != null ? R[stopRung].short : null, reason: core.stop.reason, best: core.stop.best ? estimateOut(core.stop.best) : null } : null,
    rungs,
    contradictions: core.contradictions.map((c) => ({ who: c.who, failed: c.failed, passed: c.passed, failedLabel: R[c.failed].short, passedLabel: R[c.passed].short })),
    text,
  };
}
