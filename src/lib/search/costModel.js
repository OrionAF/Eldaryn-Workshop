// search/costModel.js: what fights an Optimiser run costs, shared by the estimate (estimate.js, before a run)
// and the search's time budget (search.js, during a run). Pure. The model and the measurements behind it:
// docs/Reference/simulation.md §Estimates and §Time budget.
import { CELESTIAL_TARGET_KIND } from './celestialObjective.js';
import { PVP_OBJECTIVE_KIND } from './pvpObjective.js';

export const EFFORT_LEVELS = Object.freeze(['quick', 'standard', 'thorough']);

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
 * Fights per build from one Effort level to the next: n0 doubles (2x) and δ halves, so a near-tie needs
 * about 4x (fights ~ 1/δ²). An assumption, simulation.md §Estimates.
 */
export const EFFORT_STEP = Object.freeze([2, Math.SQRT2 * 2, 4]);

const levelIndex = (l) => Math.max(0, EFFORT_LEVELS.indexOf(l));

/** Fights-per-build scale from Effort level `from` to `to`: [lo, likely, hi]. */
export function effortScale(from, to) {
  const d = levelIndex(to) - levelIndex(from);
  if (d === 0) return [1, 1, 1];
  const s = EFFORT_STEP.map((f) => f ** Math.abs(d));
  return d > 0 ? s : [1 / s[2], 1 / s[1], 1 / s[0]];
}

/** Blocks with a choice (more than one value): what the later phases' cost grows with. */
export const choiceBlocks = (domains) => Math.max(1, Object.values(domains ?? {}).filter((n) => n > 1).length);

/**
 * The later phases' likely fights from the prior: `fixed` fights plus `ratio` x the search's fights
 * (simulation.md §Time budget). The estimate replaces it with past runs' own ratio when it has them.
 * @returns {{fixed: number, ratio: number}}
 */
export function priorReserve(family, level, lanes, choices) {
  const p = PRIOR[family] ?? PRIOR.winrate;
  return { fixed: p.later[1] * effortScale('quick', level)[1] * lanes * choices, ratio: p.share[1] };
}

/** The search's share of a time budget: never less than `min`, never more than `max` (simulation.md §Time budget). */
export const SEARCH_SHARE = Object.freeze({ min: 0.5, max: 0.9 });
/** The predicted later phases' time is padded by this factor before it is kept back. */
export const RESERVE_SAFETY = 1.5;

/**
 * When the search must stop, in ms from the run's start: the budget less the time the later phases are
 * predicted to take at this run's own measured speed (all fights so far over the time so far), padded by
 * RESERVE_SAFETY and kept inside SEARCH_SHARE. Before any fight is measured: the least share.
 * @param {{budgetMs: number, elapsedMs: number, fights: number, searchFights: number, reserve: {fixed: number, ratio: number}}} o
 */
export function searchCutoffMs({ budgetMs, elapsedMs, fights, searchFights, reserve }) {
  const lo = budgetMs * SEARCH_SHARE.min;
  const hi = budgetMs * SEARCH_SHARE.max;
  if (!(fights > 0) || !(elapsedMs > 0)) return lo;
  const later = reserve.fixed + reserve.ratio * Math.max(0, searchFights);
  const keepMs = (later / (fights / elapsedMs)) * RESERVE_SAFETY;
  return Math.min(hi, Math.max(lo, budgetMs - keepMs));
}
