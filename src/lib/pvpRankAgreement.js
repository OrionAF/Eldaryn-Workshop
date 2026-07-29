/**
 * pvpRankAgreement.js - measures how well the closed-form PVP ranking agrees
 * with the duel engine's, over a field of builds.
 *
 * NOT APP CODE. Nothing in `src/` outside the test suite imports this; it
 * exists so the contract test (pvpModelContract.test.js) and the calibration
 * harness (docs/tools/calibrate-pvp-refs.mjs) measure the SAME thing the same way.
 * Two implementations of "how much do the models agree" would be able to
 * disagree, which is the failure this whole area keeps producing.
 *
 * Why rank correlation rather than value agreement: the two models return
 * different units, and the closed form faces an averaged reference opponent
 * while the duels face a specific field. Exact numeric agreement is neither
 * expected nor desirable - what has to hold is that they order builds alike.
 *
 * See docs/Reference/combat-model.md §9 for what the contract asserts and the
 * measured baseline.
 */

import { pvpGoalScoreFromTotals } from './pvpGoalObjective.js';
import { runPvpSimulation, buildPvpSide, PVP_HEALTH_MULTIPLIER } from './pvpSimulation.js';
import { offensiveStats } from './dps.js';
import { applyStatCaps } from './totals.js';

/**
 * The game's base Speed and Crit Damage.
 *
 * ⚠ Every build in a field MUST carry these. offensiveStats() defaults every
 * field to 0, and a Speed 0 build never swings - which turns every duel into
 * the timeout's remaining-HP tiebreak and silently ranks the field by
 * tankiness alone. This mistake produced a plausible-looking rho of 0.257 the
 * first time it was made.
 */
export const BASE_STATS = Object.freeze({ speed: 100, crit_mult: 150 });

/** Effective totals for a build shape at a given Attack+Health budget. */
export function buildTotals(build, budget) {
  return applyStatCaps(
    offensiveStats({
      ...BASE_STATS,
      attack: Math.round(budget * build.attackShare),
      health: Math.round(budget * (1 - build.attackShare)),
      ...build.secondaries,
    })
  );
}

/**
 * Ranks 0..n-1 by value, largest first. Ties share their averaged rank, which
 * is what makes Spearman well-defined on a field containing equal scores.
 */
export function ranks(values) {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const out = new Array(values.length);
  let k = 0;
  while (k < order.length) {
    let end = k;
    while (end + 1 < order.length && order[end + 1].v === order[k].v) end += 1;
    const shared = (k + end) / 2;
    for (let m = k; m <= end; m++) out[order[m].i] = shared;
    k = end + 1;
  }
  return out;
}

/** Spearman's rho between two value lists: rank-order agreement in [-1, 1]. */
export function spearman(a, b) {
  const ra = ranks(a);
  const rb = ranks(b);
  const n = ra.length;
  if (n === 0) return 0;
  const mean = (xs) => xs.reduce((x, y) => x + y, 0) / n;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/**
 * Mean win rate of each build against every other, one duel batch per
 * unordered pair. This is the "truth" the closed form is judged against.
 *
 * One seed for the whole field (common random numbers), so no build wins on
 * luck of the draw and the whole result is reproducible. Duels are the
 * expensive half of any calibration, so callers that sweep parameters should
 * compute this ONCE and re-score the closed form against it - the duel engine
 * does not depend on the reference constants.
 */
export function duelWinRates(field, { budget, iterations, durationSeconds, seed, characterClass = 'Warrior' }) {
  const rates = field.map(() => []);
  for (let i = 0; i < field.length; i++) {
    for (let j = i + 1; j < field.length; j++) {
      const result = runPvpSimulation({
        player: buildPvpSide({ name: field[i].name, stats: buildTotals(field[i], budget), characterClass: field[i].class ?? characterClass }),
        opponent: buildPvpSide({ name: field[j].name, stats: buildTotals(field[j], budget), characterClass: field[j].class ?? characterClass }),
        durationSeconds,
        healthMultiplier: PVP_HEALTH_MULTIPLIER,
        iterations,
        seed,
      });
      rates[i].push(result.winRate);
      rates[j].push(result.lossRate);
    }
  }
  return rates.map((r) => r.reduce((a, b) => a + b, 0) / r.length);
}

/** Closed-form score for each build under `weights` and an optional `refs` override. */
export function closedFormScores(field, { budget, weights, refs = null }) {
  return field.map((b) => pvpGoalScoreFromTotals(buildTotals(b, budget), weights, { refs }));
}

/**
 * Rank agreement between the closed form (under `refs`) and pre-computed duel
 * win rates. Returns rho plus the pieces, so a caller can report the field.
 */
export function rankAgreement(field, { budget, weights, refs = null, winRates }) {
  const closedForm = closedFormScores(field, { budget, weights, refs });
  return { rho: spearman(closedForm, winRates), closedForm, winRates };
}
