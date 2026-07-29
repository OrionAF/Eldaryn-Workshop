/**
 * The standing contract between the two PVP models.
 *
 * The app ranks PVP builds with a CLOSED FORM (pvpGoalObjective) against an
 * averaged reference opponent, and validates with a DUEL ENGINE
 * (pvpSimulation) against concrete ones. The closed form is what the optimizer
 * actually maximises, so if the two drift apart the optimizer is confidently
 * recommending builds that lose fights - and nothing else in the suite would
 * notice, because each model is self-consistent.
 *
 * PVE has had this contract for a long time: simulation.test.js asserts the
 * sim mean converges on computeDps. This is the PVP equivalent.
 *
 * The measurement machinery is pvpRankAgreement.js, shared with the
 * calibration harness so the two cannot measure the same thing differently.
 * What the contract asserts, the measured baselines, and what calibration
 * found are in docs/Reference/combat-model.md §9.
 */
import { it, expect } from 'vitest';
import { pvpGoalScoreFromTotals, REF_DEFAULTS } from './pvpGoalObjective.js';
import { CONTRACT_FIELD } from './pvpCalibrationField.js';
import {
  buildTotals,
  duelWinRates,
  closedFormScores,
  spearman,
  ranks,
  BASE_STATS,
} from './pvpRankAgreement.js';

/* Small enough to keep the suite fast, large enough that the win-rate ordering
   is stable under the fixed seed. The duration is the model's own 60s horizon:
   shorter, and too few duels reach a kill, so the timeout's remaining-HP
   tiebreak decides the field and every ranking becomes a tanking contest. */
const DUELS = { budget: 120000, iterations: 40, durationSeconds: 60, seed: 20260728 };
const BALANCED = { damage: 34, mitigation: 33, survivability: 33 };

const winRates = () => duelWinRates(CONTRACT_FIELD, DUELS);
const scores = (refs = null) => closedFormScores(CONTRACT_FIELD, { budget: DUELS.budget, weights: BALANCED, refs });

// --- The measurement machinery itself -------------------------------------

it('spearman() is a sane rank-correlation: +1 identical order, -1 reversed, ties averaged', () => {
  expect(spearman([3, 2, 1], [30, 20, 10])).toBeCloseTo(1);
  expect(spearman([3, 2, 1], [10, 20, 30])).toBeCloseTo(-1);
  expect(ranks([5, 5, 1])).toEqual([0.5, 0.5, 2]);
  expect(spearman([], [])).toBe(0);
});

it('every contract build carries the game base stats - a Speed 0 build never swings', () => {
  // The defect that produced a plausible-looking rho of 0.257 on first run:
  // offensiveStats() zeroes every field, so a build that does not name Speed
  // silently stops attacking and the duel becomes a remaining-HP tiebreak.
  for (const build of CONTRACT_FIELD) {
    const totals = buildTotals(build, DUELS.budget);
    expect(totals.speed, build.name).toBeGreaterThanOrEqual(BASE_STATS.speed);
    expect(totals.crit_mult, build.name).toBeGreaterThanOrEqual(BASE_STATS.crit_mult);
  }
});

// --- The contract ----------------------------------------------------------

it('the closed-form PVP ranking agrees with the duel engine on a contrasting field', () => {
  const closedForm = scores();
  const duels = winRates();
  const rho = spearman(closedForm, duels);
  const detail = `rho=${rho.toFixed(3)}; closed-form=${closedForm.map((s) => s.toFixed(0))}; duels=${duels.map((w) => w.toFixed(1))}`;

  // Observed rho on this field: 0.714 (2026-07-28). The threshold sits well
  // below that ON PURPOSE. The reference constants are acknowledged guesses,
  // and any revisit of the survivability factor's shape will legitimately move
  // rho - a bar set just under today's value would fire on that work rather
  // than on a defect. What must not happen is divergence in KIND.
  expect(rho, detail).toBeGreaterThan(0.5);

  // The sharper half, and the part that does not move under tuning: the two
  // models must not flatly contradict each other about who is good. Nothing
  // either model puts in its top two may sit in the other's bottom two.
  const top2 = (v) => new Set(ranks(v).flatMap((r, i) => (r < 2 ? [i] : [])));
  const bottom2 = (v) => new Set(ranks(v).flatMap((r, i) => (r >= CONTRACT_FIELD.length - 2 ? [i] : [])));
  for (const i of top2(closedForm)) expect(bottom2(duels).has(i), `${CONTRACT_FIELD[i].name}: ${detail}`).toBe(false);
  for (const i of top2(duels)) expect(bottom2(closedForm).has(i), `${CONTRACT_FIELD[i].name}: ${detail}`).toBe(false);

  // The bases-only build is nobody's favourite and loses every duel.
  const featureless = CONTRACT_FIELD.findIndex((b) => b.name === 'Featureless');
  expect(closedForm[featureless]).toBe(Math.min(...closedForm));
  expect(duels[featureless]).toBe(Math.min(...duels));
});

it('both models are deterministic, so a contract failure is reproducible', () => {
  expect(winRates()).toEqual(winRates());
  expect(scores()).toEqual(scores());
});

it('a strictly dominated build ranks below its dominator in BOTH models', () => {
  // Same shape, uniformly worse secondaries: no modelling subtlety can make
  // this the better build, so disagreement here is a defect, not a tuning gap.
  const strong = { name: 'Strong', attackShare: 0.55, secondaries: { crit: 40, crit_mult: 220, speed: 170, dmg_reduction: 30, lifesteal: 20 } };
  const weak = { name: 'Weak', attackShare: 0.55, secondaries: { crit: 20, crit_mult: 170, speed: 130, dmg_reduction: 15, lifesteal: 10 } };
  const b = DUELS.budget;

  expect(pvpGoalScoreFromTotals(buildTotals(strong, b), BALANCED)).toBeGreaterThan(
    pvpGoalScoreFromTotals(buildTotals(weak, b), BALANCED)
  );
  const [strongWinRate] = duelWinRates([strong, weak], DUELS);
  expect(strongWinRate).toBeGreaterThan(50);
});

// --- Reference constants are injectable, and default to the shipped values --

it('passing no refs is identical to passing the shipped defaults', () => {
  // The `refs` option exists only so the calibration harness can search this
  // space. If it ever changed the app's behaviour by default, every recorded
  // baseline would be measuring something other than what ships.
  expect(scores(null)).toEqual(scores(REF_DEFAULTS));
  expect(REF_DEFAULTS.block).toBe(0.1);
  expect(REF_DEFAULTS.fightSec).toBe(30);
});

it('a partial refs override inherits the rest of the defaults', () => {
  const partial = scores({ fightSec: 90 });
  expect(partial).not.toEqual(scores(null)); // the override took effect
  expect(partial).toEqual(scores({ ...REF_DEFAULTS, fightSec: 90 })); // and only that one
});
