// search/search.js (F2a): the generic search machinery plus the PVE build optimiser driver.
//
// Part 1 is domain-free: subset enumeration, top-k selection, an evaluation cache, a pacer that keeps
// a worker responsive to 'abort', and `tieredBeamSearch` (a beam over named dimensions with a cheap
// screen and a simulated score). The subset and beam ideas are salvaged from the retired v1 optimiser
// (subsetsUpTo, subsetCount, the transcendence beam); nothing is imported from it.
//
// Part 2 is `optimizeBuild`: the tiered PVE optimiser (rebuild-plan §5 row 2) on top of
// search/candidates.js (what a build is) and search/objectives.js (what "better" means).
//   tier 0  closed-form screen on the candidate's stats (microseconds); only prunes big neighbour sets
//   tier 1  simulation, N = budget.n1 (default 16), drives the beam
//   tier 2  simulation, N = budget.n2 (default 64), a different seed, re-measures the finalists
// Every tier uses ONE seed for all candidates (common random numbers, engine/metrics.js), and the
// current build is always evaluated at every tier, so the top result can never rank below it.
import { hashSeed } from '../engine/rng.js';
import { pairedDelta, stableStringify, metricKey } from '../engine/metrics.js';
import { computePresetStats } from '../build/stats.js';
import { resolvePreset } from '../build/presetInputs.js';
import { describeBuild } from '../build/describe.js';
import { createBuildSpace } from './candidates.js';
import { subsetsUpTo, combinations, subsetCount, choose } from './combinatorics.js';
import { resolveTarget, makeObjective } from './objectives.js';

// ---------------------------------------------------------------------------------------------
// Part 1: generic machinery

/**
 * Order records best first: higher `score`, then higher `tie`, then the smaller `dist` (fewer changes
 * from the starting state), so of two equally good builds the less disruptive one comes first.
 */
export function byScoreDesc(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if ((b.tie ?? 0) !== (a.tie ?? 0)) return (b.tie ?? 0) - (a.tie ?? 0);
  return (a.dist ?? 0) - (b.dist ?? 0);
}

/**
 * Drop records whose `equiv` was already seen earlier in the list (items are already ordered best
 * first, so the survivor is the better or less disruptive one). Records without `equiv` all stay.
 * @template T
 * @param {T[]} items
 * @param {(item: T) => string|undefined} equivOf
 */
export function dedupeEquivalent(items, equivOf) {
  const seen = new Set();
  return items.filter((it) => {
    const e = equivOf(it);
    if (e === undefined) return true;
    if (seen.has(e)) return false;
    seen.add(e);
    return true;
  });
}

/** The best `k` items by a comparator (stable for equal items). */
export function topK(items, k, cmp) {
  return items.map((it, i) => [it, i]).sort((x, y) => cmp(x[0], y[0]) || x[1] - y[1]).slice(0, k).map((p) => p[0]);
}

/**
 * Keep the best `keep` items by `value` (higher is better), but also the best `perGroup` of every
 * group, so a cheap screen cannot wipe out a whole kind of build it cannot rank (spell kits).
 */
export function screenWithGroups(items, { value, group, keep, perGroup }) {
  if (items.length <= keep) return items;
  const ranked = items.map((it, i) => ({ it, v: value(it), i })).sort((a, b) => b.v - a.v || a.i - b.i);
  const chosen = new Set(ranked.slice(0, keep).map((r) => r.i));
  if (group && perGroup > 0) {
    const seen = new Map();
    for (const r of ranked) {
      const g = group(r.it);
      const n = seen.get(g) ?? 0;
      if (n < perGroup) chosen.add(r.i);
      seen.set(g, n + 1);
    }
  }
  return ranked.filter((r) => chosen.has(r.i)).map((r) => r.it);
}

/** Bounded Map: oldest entries leave first. */
export function createEvalCache(max = 20000) {
  const map = new Map();
  return {
    get: (k) => map.get(k),
    has: (k) => map.has(k),
    set(k, v) {
      if (map.size >= max && !map.has(k)) map.delete(map.keys().next().value);
      map.set(k, v);
    },
    get size() {
      return map.size;
    },
  };
}

/**
 * Cooperative scheduling for a search that runs in a worker: `tick()` yields to the event loop
 * every `yieldMs` so an 'abort' message can be processed. `stop()` is true once aborted.
 */
export function createPacer({ signal, yieldMs = 25 } = {}) {
  let last = Date.now();
  return {
    stop: () => !!signal?.aborted,
    async tick() {
      if (Date.now() - last >= yieldMs) {
        await new Promise((r) => setTimeout(r, 0));
        last = Date.now();
      }
    },
  };
}

/**
 * Beam search over dimensions with a cheap screen and an (async, expensive) evaluation.
 *
 * @template S
 * @param {Object} o
 * @param {S} o.start                       the starting state (always evaluated, always kept in the pool)
 * @param {Array<{id: string, neighbours: (s: S) => S[]}>} o.dimensions
 * @param {(s: S) => string} o.key          canonical identity of a state (dedupes neighbours)
 * @param {(s: S) => number} [o.screen]     tier 0: higher is better; used only to prune big neighbour sets
 * @param {(s: S) => string} [o.group]      diversity group of the screen (see screenWithGroups)
 * @param {(s: S) => Promise<Object|null>} o.evaluate  tier 1: {score, tie?, dist?, equiv?, ...}; null = aborted.
 *   Records with the same `equiv` are the same build in effect: only the best (then least disruptive) is expanded.
 * @param {number} [o.width=3]              beam width
 * @param {number} [o.maxPasses=3]
 * @param {number} [o.screenKeep=40]       neighbours that survive the screen per dimension step
 * @param {number} [o.perGroup=6]
 * @param {number} [o.minGain=0.0005]       relative gain a pass must reach to trigger another pass
 * @param {number} [o.maxEvals=Infinity]    cap on evaluate() calls
 * @param {number} [o.deadline=Infinity]    Date.now() limit for starting new evaluations
 * @param {{stop: () => boolean, tick: () => Promise<void>}} [o.pacer]
 * @param {(p: Object) => void} [o.onProgress]
 * @returns {Promise<{records: Map<string, {state: S, rec: Object, dimension: string}>, best: string, passes: number,
 *   evals: number, screened: number, truncated: null|'evals'|'time', aborted: boolean}>}
 */
export async function tieredBeamSearch(o) {
  const {
    start, dimensions, key, screen = () => 0, group, evaluate,
    width = 3, maxPasses = 3, screenKeep = 40, perGroup = 6, minGain = 0.0005,
    maxEvals = Infinity, deadline = Infinity, pacer = createPacer(), onProgress,
  } = o;
  const records = new Map();
  let evals = 0;
  let screened = 0;
  let truncated = null;
  let aborted = false;
  const attempted = new Set(); // keys already screened (or evaluated): never reconsidered

  const budgetLeft = () => {
    if (pacer.stop()) { aborted = true; return false; }
    if (evals >= maxEvals) { truncated = truncated ?? 'evals'; return false; }
    if (Date.now() >= deadline) { truncated = truncated ?? 'time'; return false; }
    return true;
  };
  const evalOne = async (state, dimension) => {
    const k = key(state);
    const rec = await evaluate(state);
    evals++;
    if (!rec) { aborted = true; return null; }
    records.set(k, { state, rec, dimension });
    onProgress?.({ phase: 'search', evals, best: records.get(bestKey())?.rec.score ?? null, dimension });
    await pacer.tick();
    return k;
  };
  const bestKey = () => {
    let bk = null;
    for (const [k, r] of records) if (bk === null || byScoreDesc(r.rec, records.get(bk).rec) < 0) bk = k;
    return bk;
  };

  const startKey = key(start);
  attempted.add(startKey);
  await evalOne(start, 'start');
  if (aborted || !records.has(startKey)) return { records, best: startKey, passes: 0, evals, screened, truncated, aborted };

  let beam = [startKey];
  let passes = 0;
  for (let pass = 1; pass <= maxPasses; pass++) {
    passes = pass;
    const before = records.get(bestKey()).rec.score;
    for (const dim of dimensions) {
      if (!budgetLeft()) break;
      const fresh = new Map();
      for (const bk of beam) {
        for (const s of dim.neighbours(records.get(bk).state)) {
          const k = key(s);
          if (!attempted.has(k) && !fresh.has(k)) fresh.set(k, s);
        }
      }
      if (fresh.size === 0) continue;
      const states = [...fresh.values()];
      screened += states.length;
      const kept = screenWithGroups(states, { value: screen, group, keep: screenKeep, perGroup });
      for (const s of states) attempted.add(key(s));
      for (const s of kept) {
        if (!budgetLeft()) break;
        if (await evalOne(s, dim.id) === null) break;
      }
      if (aborted) break;
      beam = dedupeEquivalent(
        topK([...records.keys()], records.size, (a, b) => byScoreDesc(records.get(a).rec, records.get(b).rec)),
        (k) => records.get(k).rec.equiv,
      ).slice(0, width);
    }
    if (aborted || truncated) break;
    const after = records.get(bestKey()).rec.score;
    const base = Math.abs(before) || 1;
    if (!(after - before > minGain * base)) break;
  }
  return { records, best: bestKey(), passes, evals, screened, truncated, aborted };
}

// ---------------------------------------------------------------------------------------------
// Part 2: the PVE build optimiser

export const DEFAULT_BUDGET = {
  n1: 16,           // tier-1 fights per candidate
  n2: 64,           // tier-2 fights per finalist
  width: 3,         // beam width
  maxPasses: 3,
  screenKeep: 40,   // neighbours past the tier-0 screen per dimension step
  perGroup: 6,      // per spell-kit group, kept regardless of the screen
  finalists: 12,    // tier-2 candidates (the current build is always one of them)
  topN: 10,         // entries in result.results
  maxEvals: 400,    // tier-1 evaluations; the search stops when reached
  maxMs: 20000,     // wall clock for the search stage (tier 2 follows)
  minGain: 0.0005,
};

/** Fill a partial budget; unknown keys and non-positive numbers fall back to the default. */
export function resolveBudget(partial = {}) {
  const out = { ...DEFAULT_BUDGET };
  for (const k of Object.keys(DEFAULT_BUDGET)) {
    const v = partial?.[k];
    if (typeof v === 'number' && Number.isFinite(v) && (k === 'minGain' ? v >= 0 : v > 0)) out[k] = v;
  }
  for (const k of ['n1', 'n2', 'width', 'maxPasses', 'screenKeep', 'perGroup', 'finalists', 'topN', 'maxEvals']) out[k] = Math.max(1, Math.floor(out[k]));
  return out;
}

const finite = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/**
 * Optimise one preset for a target and objective.
 *
 * @param {Object} req
 * @param {Object} req.character           a normalised v2 Character (plain data)
 * @param {string} [req.presetId]          default: the active preset
 * @param {'base'|'oblivion'} [req.realm]  default 'base'; an 'oblivion' target forces 'oblivion'
 * @param {Object} [req.target]            see objectives.js resolveTarget; default the 60 s dummy
 * @param {Object} [req.objective]         see objectives.js makeObjective; default {kind: 'dps'}
 * @param {Object} [req.space]             dimension toggles, see candidates.js SPACE_DEFAULTS
 * @param {Object} [req.budget]            partial DEFAULT_BUDGET
 * @param {number} [req.seed=1]
 * @param {AbortSignal} [req.signal]       abort resolves with best-so-far and `aborted: true`
 * @param {(p: Object) => void} [req.onProgress]  {phase: 'search'|'final', done?, total?, evals?, best?}
 * @param {{get: Function, set: Function}} [req.cache]  createEvalCache(); sharing one across runs is only
 *   valid for the same character snapshot, target, objective and seed (the key includes all of them anyway)
 * @returns {Promise<OptimiserResult>}
 *
 * @typedef {Object} OptimiserEntry
 * @property {number} rank                 1-based among result.results
 * @property {boolean} isBaseline          the current preset, unchanged
 * @property {string} key                  candidate identity
 * @property {Object} candidate            see candidates.js Candidate
 * @property {number|null} value           headline metric (DPS, median TTK ms, survival p)
 * @property {number|null} lo               95 % interval of `value` (null when undefined)
 * @property {number|null} hi
 * @property {number} n                    fights behind `value`
 * @property {number} score                higher is better, in objective score space
 * @property {null|{delta: number, lo: number, hi: number, significant: boolean, pct: number|null}} vsBaseline
 *   paired (common-random-number) difference in score space; positive = better than the current preset
 * @property {Array<{label: string, from: string, to: string}>} changes   describe lines that differ from the baseline
 * @property {Array<{label: string, value: string}>} lines                describeBuild of the candidate
 * @property {Array<{opponentId: string, name: string, seat: 'attacker'|'defender', p: number, lo: number, hi: number, n: number}>} [matchups]
 *   PVP objective only (pvpObjective.js): my win rate per (opponent, seat), each over `perMatchupN` duels
 *
 * @typedef {Object} OptimiserResult
 * @property {boolean} aborted
 * @property {null|'evals'|'time'} truncated
 * @property {1|2} tier                    fidelity of the ranked values (2 unless aborted before tier 2 finished)
 * @property {Object} target               {kind, label, key, ...spec}
 * @property {Object} objective            {kind, label, unit, higherIsBetter, ...spec}
 * @property {'base'|'oblivion'} realm
 * @property {string} presetId
 * @property {number} seed
 * @property {Object} space
 * @property {Object} budget
 * @property {OptimiserEntry} baseline
 * @property {OptimiserEntry[]} results
 * @property {{tier0: number, tier1: number, tier2: number, passes: number, cacheHits: number, ms: number, residualKeys: number}} stats
 */
export async function optimizeBuild(req) {
  const t0 = Date.now();
  const { character, signal, onProgress } = req;
  if (!character || typeof character !== 'object') throw new Error('optimize: request.character is required');
  const preset = resolvePreset(character, req.presetId);
  if (!preset) throw new Error('optimize: the character has no preset to optimise');
  const target = resolveTarget(req.target ?? { kind: 'dummy' }, { character });
  const realm = target.realm ?? (req.realm === 'oblivion' ? 'oblivion' : 'base');
  const objective = makeObjective(req.objective ?? { kind: 'dps' }, target);
  const wanted = { ...objective.defaultBudget, ...req.budget }; // F5: PVP brings its own defaults
  // F5: `finalMs` (outside DEFAULT_BUDGET) caps the tier-2 wall clock by shrinking n2 to what fits, never below 2 * n1.
  const finalMs = typeof wanted.finalMs === 'number' && Number.isFinite(wanted.finalMs) && wanted.finalMs > 0 ? wanted.finalMs : null;
  let budget = { ...resolveBudget(wanted), ...(finalMs ? { finalMs } : {}) };
  const seed = Number.isFinite(req.seed) ? req.seed : 1;
  const seed1 = hashSeed('tier1', seed, target.key);
  const seed2 = hashSeed('tier2', seed, target.key);

  // Tier 1 carries the current preset's residual (rebuild-plan §4 "Residual carry").
  const current = computePresetStats(character, preset.id, { realm });
  const space = createBuildSpace(character, preset, { realm, residual: current.residual, space: req.space });
  const start = space.start;
  const cache = req.cache ?? createEvalCache();
  const ctxKey = metricKey('optctx', character, preset.id, realm, target.key, objective.key, seed);
  let cacheHits = 0;
  let tier2Evals = 0;
  let tier1Measured = 0;
  let tier1Ms = 0;
  const pacer = createPacer({ signal });

  const measureCached = async (cand, tier) => {
    const ck = `${ctxKey}|t${tier}|${space.key(cand)}`;
    const hit = cache.get(ck);
    if (hit) { cacheHits++; return hit; }
    const fighter = space.fighterOf(cand);
    const tStart = Date.now();
    const m = await objective.measure(fighter, { // F5: the PVP measure is async (it yields so abort lands)
      n: tier === 1 ? budget.n1 : budget.n2,
      seed: tier === 1 ? seed1 : seed2,
      keepSamples: tier === 2,
      signal,
    });
    if (m.aborted) return null;
    if (tier === 1) { tier1Measured++; tier1Ms += Date.now() - tStart; }
    m.dist = space.distance(cand);
    m.equiv = metricKey('fighter', fighter);
    cache.set(ck, m);
    return m;
  };

  // --- search stage (tier 0 screen, tier 1 beam)
  const search = await tieredBeamSearch({
    start,
    dimensions: space.dimensions,
    key: space.key,
    screen: (c) => objective.tier0(space.fighterOf(c).stats),
    group: space.kitKey,
    evaluate: (c) => measureCached(c, 1),
    width: budget.width,
    maxPasses: budget.maxPasses,
    screenKeep: budget.screenKeep,
    perGroup: budget.perGroup,
    minGain: budget.minGain,
    maxEvals: budget.maxEvals,
    deadline: t0 + budget.maxMs,
    pacer,
    onProgress,
  });

  // --- final stage (tier 2): the best tier-1 builds plus the current one, re-measured on a fresh seed
  const startKey = space.key(start);
  if (!search.records.has(startKey)) {
    // Aborted before the current build was even measured: nothing to rank.
    return {
      aborted: true, truncated: search.truncated, tier: 1, target: { ...target.spec, label: target.label, key: target.key },
      objective: { ...objective.spec, label: objective.label, unit: objective.unit, higherIsBetter: objective.higherIsBetter },
      realm, presetId: preset.id, seed, space: space.toggles, budget, baseline: null, results: [],
      stats: { tier0: 0, tier1: search.evals, tier2: 0, passes: 0, cacheHits, ms: Date.now() - t0, residualKeys: Object.keys(current.residual).length },
    };
  }
  const ranked = dedupeEquivalent(
    topK([...search.records.keys()], search.records.size, (a, b) => byScoreDesc(search.records.get(a).rec, search.records.get(b).rec)),
    (k) => search.records.get(k).rec.equiv,
  ).slice(0, budget.finalists);
  const finalKeys = ranked.includes(startKey) ? ranked : [...ranked.slice(0, Math.max(0, budget.finalists - 1)), startKey];
  if (finalMs && tier1Measured > 0 && !search.aborted) {
    const msPerFight = Math.max(tier1Ms / tier1Measured / budget.n1, 1e-3);
    const fit = Math.floor(finalMs / (finalKeys.length * msPerFight));
    budget = { ...budget, n2: Math.max(Math.min(budget.n2, fit), Math.min(budget.n2, 2 * budget.n1)) };
  }
  const tier2 = new Map();
  let aborted = search.aborted;
  if (!aborted) {
    for (const k of finalKeys) {
      if (pacer.stop()) { aborted = true; break; }
      const m = await measureCached(search.records.get(k).state, 2);
      if (!m) { aborted = true; break; }
      tier2.set(k, m);
      tier2Evals++;
      onProgress?.({ phase: 'final', done: tier2.size, total: finalKeys.length });
      await pacer.tick();
    }
  }
  const tierDone = !aborted && tier2.size === finalKeys.length ? 2 : 1;
  const measureOf = (k) => (tierDone === 2 ? tier2.get(k) : search.records.get(k).rec);
  const pool = tierDone === 2 ? finalKeys
    : dedupeEquivalent(topK([...search.records.keys()], search.records.size, (a, b) => byScoreDesc(search.records.get(a).rec, search.records.get(b).rec)),
      (k) => search.records.get(k).rec.equiv);
  const order = topK(pool, pool.length, (a, b) => byScoreDesc(measureOf(a), measureOf(b)));

  // --- entries
  const baseM = measureOf(startKey);
  const baseLines = describeBuild(...space.describeArgs(start));
  const entryOf = (k, rank) => {
    const { state } = search.records.get(k);
    const m = measureOf(k);
    const isBaseline = k === startKey;
    let vs = null;
    if (!isBaseline && tierDone === 2 && m.scoreSamples && baseM.scoreSamples) {
      const d = pairedDelta(baseM.scoreSamples, m.scoreSamples);
      vs = {
        delta: finite(d.delta), lo: finite(d.lo), hi: finite(d.hi), significant: d.significant,
        pct: objective.higherIsBetter && objective.kind === 'dps' && baseM.value ? finite(d.delta / baseM.value) : null,
      };
    } else if (!isBaseline) {
      vs = { delta: finite(m.score - baseM.score), lo: null, hi: null, significant: false, pct: null };
    }
    const lines = describeBuild(...space.describeArgs(state));
    const changes = lines
      .map((l, i) => ({ label: l.label, from: baseLines[i]?.value ?? '', to: l.value }))
      .filter((c, i) => c.from !== c.to || baseLines[i]?.label !== lines[i].label);
    return {
      rank, isBaseline, key: k, candidate: state,
      value: finite(m.value), lo: finite(m.lo), hi: finite(m.hi), n: m.n, score: m.score,
      vsBaseline: vs, changes, lines,
      // F5: a PVP win rate also carries its per-matchup rates (same N, Wilson interval each).
      ...(m.extra?.matchups ? { matchups: m.extra.matchups, perMatchupN: m.extra.perMatchupN } : {}),
    };
  };
  const results = order.slice(0, budget.topN).map((k, i) => entryOf(k, i + 1));
  const baseline = results.find((e) => e.isBaseline) ?? entryOf(startKey, order.indexOf(startKey) + 1);

  return {
    aborted,
    truncated: search.truncated,
    tier: tierDone,
    target: { ...target.spec, label: target.label, key: target.key },
    objective: { ...objective.spec, label: objective.label, unit: objective.unit, higherIsBetter: objective.higherIsBetter },
    realm,
    presetId: preset.id,
    seed,
    space: space.toggles,
    budget,
    baseline,
    results,
    stats: {
      tier0: search.screened, tier1: search.evals, tier2: tier2Evals, passes: search.passes, cacheHits,
      ms: Date.now() - t0, residualKeys: Object.keys(current.residual).length,
    },
  };
}

// Re-exported so callers hashing their own keys use the same stable JSON, and so the salvaged
// combinatorics are reachable from the one search entry point.
export { stableStringify, subsetsUpTo, combinations, subsetCount, choose };
