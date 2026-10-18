// search/estimate.js (backlog §3): what an Optimiser run will cost, before it runs. Pure and cheap (no
// simulation), so the setup can call it on every change. The model, the prior table and the measurements
// behind it: docs/Reference/simulation.md §Estimates; the procedure it models is §Search (search.js optimize).
import { BLOCKS } from './space.js';
import { prepare, enumerateJoint, EXHAUSTIVE_MAX, EFFORT_LEVELS, RANDOM_STARTS } from './search.js';
import { looksFor } from './sampler.js';
import { CELESTIAL_TARGET_KIND } from './celestialObjective.js';
import { PVP_OBJECTIVE_KIND } from './pvpObjective.js';
import { estimateSeconds } from '../calibration.js';
import { CALIBRATION_FIGHT_SECONDS } from '../tasks/calibrate.js';

/** The joint space is counted build by build (exact) up to this size; above it the product of block sizes stands in. */
export const LIVE_ENUMERATE_MAX = 1000;
/** Past runs read per estimate, newest first. */
export const HISTORY_MAX = 8;

/**
 * The calibrated fight kind a target's fights cost like (lib/calibration.js FIGHT_KINDS), and for dummy-kind
 * targets whether the cost scales with the target's window. An assumption: the calibration measures one
 * fight of each kind. A target kind not listed (a newer target) has no calibrated time estimate.
 */
export const FIGHT_KIND_OF = Object.freeze({
  dummy: 'dummy', worldBoss: 'dummy', custom: 'dummy',
  chapter: 'dungeon', dungeon: 'dungeon', raid: 'dungeon', oblivion: 'dungeon',
  fortressBoss: 'duel', pvp: 'duel',
});

/**
 * Objective families: runs in one family cost alike per build (the statistic's noise against δ decides how
 * many fights a comparison needs). simulation.md §Estimates.
 */
export function familyOf(objectiveKind, targetKind) {
  if (targetKind === CELESTIAL_TARGET_KIND) return 'celestial';
  if (objectiveKind === PVP_OBJECTIVE_KIND || targetKind === 'pvp') return 'pvp';
  if (targetKind === 'fortressBoss') return 'fortress';
  if (objectiveKind === 'dps') return 'dps';
  return 'winrate'; // win-chance, win-rate, Push and survival: proportions against PVE
}

/**
 * The prior per family, at Quick and per lane: `search` = search fights per build tried, by strategy;
 * minimise, confirm and attribute = `later` fights per block with a choice (they depend on the finalists and
 * their changes; in a small space they are most of the run) plus `share` of the search fights (a long
 * search leaves more close finalists). [lo, likely, hi], measured on reference characters
 * (simulation.md §Estimates, estimate.bench.test.js); `measured: false` marks a guessed band.
 */
export const PRIOR = Object.freeze({
  dps: { measured: true, search: { exhaustive: [6, 9, 20], local: [6, 9, 20] }, later: [20, 50, 150], share: [0, 0.02, 0.1] },
  fortress: { measured: true, search: { exhaustive: [6, 9, 20], local: [6, 9, 20] }, later: [20, 50, 150], share: [0, 0.02, 0.1] },
  winrate: { measured: true, search: { exhaustive: [120, 380, 1600], local: [120, 380, 1600] }, later: [100, 1000, 4000], share: [0.002, 0.02, 0.6] },
  pvp: { measured: true, search: { exhaustive: [120, 450, 1600], local: [120, 450, 1600] }, later: [100, 2000, 4000], share: [0.002, 0.03, 0.4] },
  celestial: { measured: false, search: { exhaustive: [50, 500, 5000], local: [50, 500, 5000] }, later: [100, 2000, 10000], share: [0, 0.05, 1] },
});

/**
 * Builds a local search tries per start (simulation.md §Estimates): the start itself, `base` times each
 * other value of a fixed-domain block (an ascent sweeps them about that often) and `talent` x (sqrt(moves + 1)
 * - 1) for the talent block (each accepted move shifts the neighbourhood, so the block is swept until the
 * points stop moving; win-rate objectives move them much further than DPS). `band` is the measured spread.
 */
export const SWEEP_MODEL = Object.freeze({
  dps: { base: 2.5, talent: 19 }, fortress: { base: 2.5, talent: 19 },
  winrate: { base: 1.5, talent: 75 }, pvp: { base: 1.5, talent: 75 }, celestial: { base: 1.5, talent: 75 },
  band: [0.35, 1, 2.2],
});

/**
 * Fights per build from one Effort level to the next: n0 doubles (2x) and δ halves, so a near-tie needs
 * about 4x (fights ~ 1/δ²). An assumption, simulation.md §Estimates.
 */
export const EFFORT_STEP = Object.freeze([2, Math.SQRT2 * 2, 4]);
/** Widening of the range around the past runs: one run, then two or more. */
export const HISTORY_MARGIN = Object.freeze({ one: 1.5, more: 1.25 });

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const geo = (xs) => Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length);
const levelIndex = (l) => Math.max(0, EFFORT_LEVELS.indexOf(l));
const sizesOf = (ids, sizes) => Object.fromEntries([...ids].map((id) => [id, sizes[id] ?? 1]));

/**
 * The starts of a local search (§Strategy): the baseline, each other spec, each other gear set, the talent
 * fill, the random starts. A saved run does not record its random starts; the app always uses the default.
 */
export function nominalStarts(domains, randomStarts = RANDOM_STARTS) {
  const d = (id) => Math.max(0, (domains?.[id] ?? 1) - 1);
  return 1 + d('spec') + d('equipmentSet') + (d('talents') > 0 ? 1 : 0) + randomStarts;
}

/** The builds a local search is expected to try per start (before the measured spread): SWEEP_MODEL. */
export function sweepBuilds(domains, family) {
  const m = SWEEP_MODEL[family] ?? SWEEP_MODEL.winrate;
  const talents = Math.max(0, (domains?.talents ?? 1) - 1);
  const other = Object.entries(domains ?? {}).reduce((s, [id, n]) => s + (id === 'talents' ? 0 : Math.max(0, n - 1)), 0);
  return 1 + m.base * other + m.talent * (Math.sqrt(talents + 1) - 1);
}

/** Blocks with a choice (more than one value): what the later phases' cost grows with. */
const choiceBlocks = (domains) => Math.max(1, Object.values(domains ?? {}).filter((n) => n > 1).length);

const enabledIds = (space) => BLOCKS.filter((id) => id === 'stones' ? space?.stones === true : space?.[id] !== false).sort().join(',');

const isPushRun = (r) => r?.objective?.kind === 'push' || isObj(r?.headline?.push);

/** The phases of one optimisation in a debug summary (inside a Push run, the optimised rungs' own). */
const SEARCH_PHASES = ['screen', 'search'];
const LATER_PHASES = ['minimise', 'confirm', 'attribute'];

/**
 * What a saved run cost, as the estimate reads it (simulation.md §Estimates): from its `cost`, else from its
 * debug summary (`debug.phases`: builds, fights, wallMs per phase; for a Push run only the optimisation's
 * phases). A debug-only run has no domains or starts, so it gives fights per build and speed, never builds
 * per start. null when the run has neither or they hold no search.
 * @returns {{from: 'cost'|'debug', strategy: string, domains: Object|null, lanes: number, builds: number,
 *   fights: {search: number, later: number, total: number}, elapsedMs: number|null}|null}
 */
export function runCost(r) {
  const c = r?.cost;
  if (isObj(c) && c.fights?.total > 0) {
    const builds = c.evaluated ?? r.headline?.evaluated ?? 0;
    if (!(builds > 0)) return null;
    return {
      from: 'cost', strategy: c.strategy, domains: c.domains ?? null, lanes: c.lanes ?? 1, builds,
      fights: { search: c.fights.search, later: c.fights.minimise + c.fights.confirm, total: c.fights.total }, elapsedMs: c.elapsedMs ?? null,
    };
  }
  const d = r?.debug;
  // a PVP run's lanes are not in the summary
  if (!isObj(d) || !Array.isArray(d.phases) || r.target?.kind === 'pvp') return null;
  const ph = (ids, k) => d.phases.filter((p) => ids.includes(p.id)).reduce((s, p) => s + (p[k] ?? 0), 0);
  const search = ph(SEARCH_PHASES, 'fights');
  const later = ph(LATER_PHASES, 'fights');
  const builds = d.phases.find((p) => p.id === 'search')?.builds ?? 0;
  if (!(search > 0) || !(builds > 0)) return null;
  const inner = ph([...SEARCH_PHASES, ...LATER_PHASES], 'wallMs');
  const push = isPushRun(r);
  const wall = push ? inner : d.totals?.wallMs || inner;
  return {
    from: 'debug', strategy: (d.blocks ?? []).some((b) => b.id === 'all') ? 'exhaustive' : 'local', domains: null, lanes: 1, builds,
    fights: { search, later, total: push ? search + later : Math.max(search + later, d.totals?.fights ?? 0) }, elapsedMs: wall > 0 ? wall : null,
  };
}

/** A saved run the estimate can learn from: a finished schema 2 run (optimise or Push) with a cost or a debug summary. */
export function usableRun(r) {
  if (!isObj(r) || r.schema !== 2 || r.headline?.aborted) return false;
  return runCost(r) != null;
}

/**
 * The target and objective a saved run stands for in this estimate. A Push run is a Push run to a Push
 * estimate (its start rung); to any other it is the win-rate search on the rung it optimised (`cost.rung`;
 * a debug-only Push run does not record that rung).
 */
function runView(r, want) {
  if (!isPushRun(r)) return { targetKey: r.target?.key, objectiveKind: r.objective?.kind };
  if (want.objectiveKind === 'push') return { targetKey: r.target?.key, objectiveKind: 'push' };
  return { targetKey: r.cost?.rung?.key ?? null, objectiveKind: 'win-rate' };
}

/** The match tiers, strictest first (simulation.md §Estimates). Each is a predicate over (want, run, view). */
const TIERS = [
  { id: 'same', label: 'your past runs of this setup', scaled: false,
    test: (w, r, v) => v.targetKey === w.targetKey && v.objectiveKind === w.objectiveKind && r.budget?.level === w.level && enabledIds(r.space) === w.blocks },
  { id: 'like', label: 'your past runs like this', scaled: false,
    test: (w, r, v) => r.target?.kind === w.targetKind && v.objectiveKind === w.objectiveKind && r.budget?.level === w.level },
  { id: 'family', label: 'your past runs of the same kind of objective', scaled: false,
    test: (w, r) => r.budget?.level === w.level },
  { id: 'other-effort', label: 'your past runs of the same kind of objective at another Effort', scaled: true, test: () => true },
];

/**
 * The past runs an estimate learns from: the first tier with any usable run of the same family and
 * strategy, newest HISTORY_MAX of it, with what each cost (`runCost`, same order).
 * @returns {{tier: string, label: string, scaled: boolean, runs: Object[], costs: Object[]} | null}
 */
export function matchHistory(want, history) {
  const pool = [];
  for (const r of Array.isArray(history) ? history : []) {
    if (!isObj(r) || r.schema !== 2 || r.headline?.aborted) continue;
    const c = runCost(r);
    if (!c || c.strategy !== want.strategy) continue;
    const v = runView(r, want);
    if (familyOf(v.objectiveKind, r.target?.kind) !== want.family) continue;
    pool.push({ r, c, v });
  }
  for (const t of TIERS) {
    const hit = pool.filter((x) => t.test(want, x.r, x.v)).sort((a, b) => (a.r.at < b.r.at ? 1 : a.r.at > b.r.at ? -1 : 0)).slice(0, HISTORY_MAX);
    if (hit.length) return { tier: t.id, label: t.label, scaled: t.scaled, runs: hit.map((x) => x.r), costs: hit.map((x) => x.c) };
  }
  return null;
}

/**
 * The win rate's saturated races (simulation.md §Estimates, the tie look): when no build wins, no arm can
 * leave a race on the rate before the rates tie, so each distinct build raced is sampled to at least the
 * first look at or after n*, the exact tie point at its race's per-look level (alpha / (arms x looks),
 * `rateTieN`; the tie look `looksFor` adds usually sits there). `races` are the search's races as
 * [{arms, weight}] (weight: the share of the builds tried in races of that size).
 * @returns {{perBuild: number, least: number}|null}  the weighted and the least floor; null when the
 *   objective has no tie point (not a win rate, or a relative zone)
 */
export function saturatedPerBuild(objective, effort, races) {
  if (typeof objective?.rateTieN !== 'function') return null;
  if ((effort.deltaKind ?? objective.deltaKind) !== 'absolute' || !(effort.delta > 0)) return null;
  const at = (arms) => {
    const o = { n0: effort.n0, maxN: effort.maxN, alpha: effort.alpha / arms, delta: effort.delta, deltaKind: effort.deltaKind, tieLook: effort.tieLook };
    const looks = looksFor(objective, o);
    const n = objective.rateTieN({ alpha: o.alpha / looks.length, delta: effort.delta });
    return looks.find((m) => m >= n) ?? effort.maxN;
  };
  const rs = races.filter((x) => x.arms > 1 && x.weight > 0);
  if (!rs.length) return null;
  const w = rs.reduce((t, x) => t + x.weight, 0);
  const sat = rs.map((x) => ({ ...x, n: at(x.arms) }));
  return { perBuild: sat.reduce((t, x) => t + x.weight * x.n, 0) / w, least: Math.min(...sat.map((x) => x.n)) };
}

/**
 * The races a search runs, as saturatedPerBuild reads them: one race of every build (exhaustive), else one
 * race per block of its values, weighted like sweepBuilds (an assumption: the ascent's share of each block).
 */
function racesOf(strategy, domains, exactBuilds, family) {
  if (strategy === 'exhaustive') return [{ arms: exactBuilds ?? 1, weight: 1 }];
  const m = SWEEP_MODEL[family] ?? SWEEP_MODEL.winrate;
  return Object.entries(domains).map(([id, d]) => ({ arms: d, weight: id === 'talents' ? m.talent * (Math.sqrt(d) - 1) : m.base * (d - 1) }));
}

/**
 * What past runs say about the win rate at this target: 'none' when a finished run here found no build that
 * wins (goal `no-wins`), else null. A run in which every build clears the target stops at its first check
 * (`already`), so no saved search shows that regime.
 */
export function regimeOf(want, history) {
  if (want.family !== 'winrate') return null;
  for (const r of Array.isArray(history) ? history : []) {
    if (!isObj(r) || r.schema !== 2 || r.headline?.aborted || isPushRun(r)) continue;
    if (r.target?.key === want.targetKey && r.headline?.goal?.status === 'no-wins') return 'none';
  }
  return null;
}

/**
 * Builds and fights from [lo, likely, hi] bands: `g` builds per unit, `fpb` search fights per build and lane,
 * `share` later fights per search fight, `later` fixed later fights. The build spread and the fights-per-build
 * spread are independent, so they add in quadrature on a log scale.
 */
function banded({ unit, lanes, g, fpb, share, later }) {
  const wide = (i) => Math.exp(Math.hypot(Math.log(g[i] / g[1]), Math.log(fpb[i] / fpb[1])));
  const search = g[1] * unit * fpb[1] * lanes;
  const likely = search * (1 + share[1]) + later[1];
  return {
    builds: { lo: g[0] * unit, likely: g[1] * unit, hi: g[2] * unit },
    fights: { lo: (search / wide(0)) * (1 + share[0]) + later[0], likely, hi: search * wide(2) * (1 + share[2]) + later[2] },
    laterShare: (search * share[1] + later[1]) / likely,
  };
}

/** Fights-per-build scale from Effort level `from` to `to`: [lo, likely, hi]. */
export function effortScale(from, to) {
  const d = levelIndex(to) - levelIndex(from);
  if (d === 0) return [1, 1, 1];
  const s = EFFORT_STEP.map((f) => f ** Math.abs(d));
  return d > 0 ? s : [1 / s[2], 1 / s[1], 1 / s[0]];
}

/**
 * The estimate of one Optimiser run. Push runs the same search at its start rung, so for Push this
 * covers one rung's build search (`push: true`); the climb adds a search per rung it optimises.
 * @param {Object} request  the optimize request the setup stands for (ui/optimiserSetup.js requestOf)
 * @param {{calibration?: Object|null, history?: Object[]}} [o]  this device's speed calibration
 *   (lib/calibration.js) and saved runs (model/runs.js, any character)
 * @returns {{ok: false, reason: string} | {ok: true, strategy: 'exhaustive'|'local', push: boolean, family: string,
 *   blocks: Array<{id: string, enabled: boolean, values: number}>, starts: number|null, lanes: number,
 *   source: {kind: 'history'|'prior', tier: string|null, runs: number, scaled: boolean, measured: boolean, text: string},
 *   builds: {lo: number, likely: number, hi: number, exact: boolean, basis: string},
 *   fights: {lo: number, likely: number, hi: number, perBuild: number, laterShare: number|null, basis: string},
 *   kind: string|null, time: {lo: number, likely: number, hi: number, rate: number, workers: number|null, source: 'observed'|'calibration', basis: string}|null,
 *   timeReason: null|'no-calibration'|'unmapped-kind', assumptions: string[]}}
 */
export function estimateRun(request, { calibration = null, history = [] } = {}) {
  let prep;
  try {
    prep = prepare(request);
  } catch (e) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
  const { space, effort, objective, target } = prep;
  const B = space.start;
  const enabled = new Set(space.blocks.filter((b) => b.enabled).map((b) => b.id));
  const sizes = space.domainSizes(B);
  const blocks = BLOCKS.map((id) => ({ id, enabled: enabled.has(id), values: enabled.has(id) ? sizes[id] ?? 1 : 1 }));
  const lanes = Math.max(1, objective.lanes ?? 1);
  const family = familyOf(objective.kind, target.kind);
  const assumptions = [];

  let jointSize = 1;
  for (const id of enabled) jointSize *= sizes[id] ?? 1;
  const talentsLocal = enabled.has('talents') && (sizes.talents ?? 1) > 1;
  const stonesLocal = enabled.has('stones') && (sizes.stones ?? 1) > 1;
  // one sweep from one start: the current build plus every other value of each allowed block
  const sweep = 1 + [...enabled].reduce((s, id) => s + Math.max(0, (sizes[id] ?? 1) - 1), 0);

  // ---- strategy and the exact part of the build count ----------------------------------------------
  let strategy;
  let exactBuilds = null;
  let exactBasis = '';
  let starts = null;
  if (!talentsLocal && !stonesLocal && jointSize <= EXHAUSTIVE_MAX) {
    strategy = 'exhaustive';
    const list = jointSize <= LIVE_ENUMERATE_MAX ? enumerateJoint(space, B, enabled) : null;
    if (list) {
      exactBuilds = space.powerFloor == null ? list.length : list.filter((c) => space.admissible(c)).length;
      exactBasis = 'Every legal build of the allowed blocks, counted one by one (after pruning and the Combat Power guard).';
    } else {
      exactBuilds = jointSize;
      exactBasis = 'The product of the block sizes; the search counts the actual list.';
      assumptions.push('A space this size is listed when the run starts; if the list exceeds the exhaustive limit the run switches to the local search.');
    }
  } else {
    strategy = 'local';
    starts = nominalStarts(sizesOf(enabled, sizes), effort.randomStarts);
    if (space.powerFloor != null) assumptions.push('Builds below the Combat Power floor are skipped when they come up, so fewer may be tried.');
  }
  const unit = strategy === 'local' ? starts * sweepBuilds(sizesOf(enabled, sizes), family) : exactBuilds;

  // ---- per-build cost: past runs like this one, else the prior -------------------------------------
  const want = {
    family, strategy, level: effort.level, targetKey: target.key, targetKind: target.kind, objectiveKind: objective.kind,
    blocks: enabledIds(Object.fromEntries(BLOCKS.map((id) => [id, enabled.has(id)]))),
  };
  const match = matchHistory(want, history);
  const choices = choiceBlocks(sizesOf(enabled, sizes));
  // a known no-wins target: every distinct build is raced to at least its race's tie point (saturatedPerBuild)
  const regime = regimeOf(want, history);
  const sat = regime ? saturatedPerBuild(objective, effort, racesOf(strategy, sizesOf(enabled, sizes), exactBuilds, family)) : null;
  const satFloor = (fpb) => (sat ? fpb.map((x) => Math.max(x, sat.perBuild)) : fpb);
  let band;
  let source;
  if (match) {
    const sc = (r) => effortScale(r.budget?.level, effort.level);
    const per = match.runs.map((r, i) => {
      const c = match.costs[i];
      return {
        // builds per start need the run's domains: a debug-only run has none (null)
        rho: strategy !== 'local' ? 1 : c.domains ? c.builds / (nominalStarts(c.domains) * sweepBuilds(c.domains, family)) : null,
        fpb: (c.fights.search / c.lanes / c.builds) * sc(r)[1],
        ratio: c.fights.later / Math.max(1, c.fights.search),
      };
    });
    const known = per.filter((q) => q.rho != null);
    if (match.tier === 'same' && known.length === per.length) {
      // this very setup: each past run is a point; the range spans them with a margin
      const m = per.length === 1 ? HISTORY_MARGIN.one : HISTORY_MARGIN.more;
      const pts = per.map((q) => {
        const b = q.rho * unit;
        return { builds: b, fights: b * q.fpb * lanes * (1 + q.ratio), later: q.ratio / (1 + q.ratio) };
      });
      const range = (k) => {
        const xs = pts.map((q) => q[k]);
        return { lo: Math.min(...xs) / m, likely: geo(xs), hi: Math.max(...xs) * m };
      };
      band = { builds: range('builds'), fights: range('fights'), laterShare: geo(pts.map((q) => Math.max(1e-6, q.later))) };
    } else if (match.tier === 'same') {
      // this setup, but some runs are debug-only (no builds per start): their fights per build and later ratio
      // are this setup's, the builds come from the model around the known runs' rate
      const m = per.length === 1 ? HISTORY_MARGIN.one : HISTORY_MARGIN.more;
      const rho = known.length ? geo(known.map((q) => q.rho)) : 1;
      const fpb = per.map((q) => q.fpb);
      const ratio = per.map((q) => q.ratio);
      band = banded({
        unit, lanes,
        g: SWEEP_MODEL.band.map((x) => x * rho),
        fpb: [Math.min(...fpb) / m, geo(fpb), Math.max(...fpb) * m],
        share: [Math.min(...ratio), geo(ratio.map((x) => Math.max(1e-6, x))), Math.max(...ratio)],
        later: [0, 0, 0],
      });
    } else {
      // another setup of the same kind: its per-build cost carries over, but how a different space sweeps does
      // not, so builds keep the model's measured spread around the runs' own rate
      const rho = known.length ? geo(known.map((q) => q.rho)) : 1;
      const fpb = per.map((q) => q.fpb);
      const ratio = per.map((q) => q.ratio);
      const [sLo, sL, sHi] = match.scaled ? effortScale(match.runs[0].budget?.level, effort.level) : [1, 1, 1];
      // per-build cost differs between setups about as much as the prior says (measured: 5x within a family), so
      // the prior's spread is kept, centred on these runs
      const pr = PRIOR[family].search[strategy];
      // runs of another target kind say less about this one: their rate is averaged with the prior's
      const mid = match.tier === 'like' ? geo(fpb) : Math.sqrt(geo(fpb) * pr[1] * effortScale('quick', effort.level)[1]);
      band = banded({
        unit, lanes,
        g: strategy === 'local' ? SWEEP_MODEL.band.map((x) => x * rho) : [1, 1, 1],
        fpb: satFloor([
          Math.min(Math.min(...fpb) / HISTORY_MARGIN.one, (mid * pr[0]) / pr[1]) * (sLo / sL), mid,
          Math.max(Math.max(...fpb) * HISTORY_MARGIN.one, (mid * pr[2]) / pr[1]) * (sHi / sL),
        ]),
        share: [Math.min(...ratio), geo(ratio.map((x) => Math.max(1e-6, x))), Math.max(...ratio)],
        later: [0, 0, 0],
      });
    }
    const n = match.runs.length;
    const fromDebug = match.costs.filter((c) => c.from === 'debug').length;
    source = {
      kind: 'history', tier: match.tier, runs: n, scaled: match.scaled, measured: true, debug: fromDebug,
      text: `From ${n === 1 ? 'your past run' : `your ${n} past runs`} ${match.label.replace(/^your past runs /, '')}.${fromDebug
        ? ` ${fromDebug === n ? (n === 1 ? 'It was' : 'They were') : `${fromDebug} of them were`} saved before runs kept their cost: fights per build and speed come from ${fromDebug === 1 ? 'its' : 'their'} debug summary${strategy === 'local' ? ', the builds per start from the model' : ''}.`
        : ''}`,
    };
  } else {
    const p = PRIOR[family];
    const sc = effortScale('quick', effort.level);
    band = banded({
      unit, lanes,
      g: strategy === 'local' ? SWEEP_MODEL.band : [1, 1, 1],
      fpb: satFloor(p.search[strategy].map((x, i) => x * sc[i])),
      share: p.share,
      later: p.later.map((x, i) => x * sc[i] * lanes * choices),
    });
    source = {
      kind: 'prior', tier: null, runs: 0, scaled: effort.level !== 'quick', measured: p.measured,
      text: p.measured
        ? 'From runs on a reference character; no run like this on this device yet.'
        : 'A rough guess: this kind of run was not measured, and none like it has run on this device yet.',
    };
  }
  const laterShare = band.laterShare;

  // ---- builds ----------------------------------------------------------------------------------------
  let builds;
  if (strategy === 'exhaustive') {
    builds = { lo: exactBuilds, likely: exactBuilds, hi: exactBuilds, exact: jointSize <= LIVE_ENUMERATE_MAX, basis: exactBasis };
  } else {
    const r = (x) => Math.max(1, Math.round(x));
    builds = {
      lo: r(band.builds.lo), likely: r(band.builds.likely), hi: r(band.builds.hi), exact: false,
      basis: `Coordinate ascent from ${starts} start${starts === 1 ? '' : 's'}; one sweep of the allowed blocks is ${sweep.toLocaleString('en-US')} builds. How many sweeps it takes depends on what it finds${enabled.has('talents') ? ' (each talent move shifts what the next sweep tries, so talents take many more)' : ''}; the sweeps per start come from ${source.kind === 'history' ? 'those runs' : 'the reference runs'}.`,
    };
  }
  assumptions.push('Builds equal in effect (same engine inputs) are raced once, so a few less may be tried.');

  // ---- fights ----------------------------------------------------------------------------------------
  // every build is sampled to at least the first look (§Racing), a hard floor under the range; on a known
  // no-wins target to at least its race's tie point
  const floor = builds.lo * Math.max(effort.n0, sat?.least ?? 0) * lanes;
  if (sat) assumptions.push(`A past run at this target found no build that wins, so every build is sampled to at least the point where two win rates of 0 tie (about ${Math.round(sat.perBuild).toLocaleString('en-US')} fights per build).`);
  const round = (x) => Math.max(1, Math.round(x));
  const perBuild = Math.round((band.fights.likely * (1 - laterShare)) / Math.max(1, band.builds.likely) / lanes);
  const fights = {
    lo: round(Math.max(floor, band.fights.lo)),
    likely: round(Math.max(floor, band.fights.likely)),
    hi: round(Math.max(floor, band.fights.hi)),
    perBuild,
    laterShare,
    basis: `About ${perBuild.toLocaleString('en-US')} fights per build tried in the search${lanes > 1 ? ` and matchup (times ${lanes} matchups)` : ''}, plus minimise and confirm (${laterShare < 0.01 ? 'under 1%' : `about ${Math.round(laterShare * 100)}%`} of the total).`,
  };
  if (source.scaled) assumptions.push(`Scaled from ${source.kind === 'history' ? 'runs at another Effort' : 'Quick'}: each Effort level costs about 2 to 4 times the fights per build (n0 doubles, δ halves).`);
  assumptions.push('No run is capped, so an unlucky run with many close builds can go past the range.');

  // ---- time --------------------------------------------------------------------------------------
  const observed = match && (match.tier === 'same' || match.tier === 'like') ? observedRate(match, target) : null;
  const { kind, time, reason: timeReason, assumption } = observed
    ? { kind: FIGHT_KIND_OF[target.kind] ?? null, time: observedTime(fights, observed), reason: null, assumption: null }
    : estimateTime(fights, target, calibration);
  if (assumption) assumptions.push(assumption);

  return {
    ok: true, strategy, push: request?.objective?.kind === 'push', family, blocks, starts, lanes,
    source, builds, fights, kind, time, timeReason, assumptions,
  };
}

/**
 * Fights per second the matching past runs really ran at (all phases, wall time), or null. Only runs of the
 * same target kind (and for a dummy-kind window the same length) say how fast this target's fights are.
 */
function observedRate({ runs, costs }, target) {
  const same = runs.map((r, i) => ({ r, c: costs[i] })).filter(({ r, c }) => c.elapsedMs > 0 && r.target?.kind === target.kind
    && (FIGHT_KIND_OF[target.kind] !== 'dummy' || r.target?.seconds === target.seconds));
  if (!same.length) return null;
  const fights = same.reduce((s, x) => s + x.c.fights.total, 0);
  const ms = same.reduce((s, x) => s + x.c.elapsedMs, 0);
  return { rate: (fights * 1000) / ms, runs: same.length };
}

function observedTime(fights, { rate, runs }) {
  return {
    lo: fights.lo / rate, likely: fights.likely / rate, hi: fights.hi / rate, rate, workers: null, source: 'observed',
    basis: `Fights divided by the speed your ${runs === 1 ? 'past run' : `${runs} past runs`} like this ran at (${Math.round(rate).toLocaleString('en-US')} fights/s).`,
  };
}

/**
 * Seconds a fight range takes on this device: fights / the calibrated speed of the target's fight kind. The
 * calibrated speed is the whole worker pool's (tasks/calibrate.js), so it is not divided by the workers again.
 * A dummy-kind window costs in proportion to its length against the calibration's fight.
 * @param {{lo: number, likely: number, hi: number}} fights
 * @param {{kind: string, seconds?: number, label?: string}} target  a resolved target
 * @param {Object|null} calibration
 * @returns {{kind: string|null, time: Object|null, reason: null|'no-calibration'|'unmapped-kind', assumption: string|null}}
 */
export function estimateTime(fights, target, calibration) {
  const kind = FIGHT_KIND_OF[target.kind] ?? null;
  if (!kind) return { kind, time: null, reason: 'unmapped-kind', assumption: null };
  if (!calibration) return { kind, time: null, reason: 'no-calibration', assumption: null };
  const scale = kind === 'dummy' && target.seconds > 0 ? target.seconds / CALIBRATION_FIGHT_SECONDS : 1;
  const secs = (n) => estimateSeconds(calibration, { [kind]: n * scale }) ?? 0;
  const measured = calibration.fightsPerSec[kind] ?? null;
  const rate = measured ?? Math.min(...Object.values(calibration.fightsPerSec));
  const w = calibration.workers;
  return {
    kind,
    time: {
      lo: secs(fights.lo), likely: secs(fights.likely), hi: secs(fights.hi), rate, workers: w, source: 'calibration',
      basis: `Fights divided by this device's measured ${kind} speed (${Math.round(rate)} fights/s using ${w} core${w === 1 ? '' : 's'})${scale !== 1 ? `, scaled to a ${target.seconds} s fight` : ''}.`,
    },
    reason: null,
    assumption: `${target.label || target.kind} fights are assumed to cost like the speed test's ${kind} fight${measured ? '' : ' (not measured: the slowest measured speed is used)'}.`,
  };
}
