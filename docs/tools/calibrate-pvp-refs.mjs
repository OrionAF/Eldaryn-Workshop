/**
 * calibrate-pvp-refs.mjs - fits the PVP goal's four invented reference
 * constants against the duel engine's own rankings.
 *
 *   node docs/tools/calibrate-pvp-refs.mjs [--iterations 200] [--budget 120000]
 *
 * Lives under docs/ rather than in the published tree: it is analysis tooling
 * that belongs with the audit it serves, and it is run by hand when someone is
 * changing the PVP model - never by the app or by `npm test`. The measurement
 * logic it uses is NOT here; it is in src/lib/pvpRankAgreement.js, shared with
 * pvpModelContract.test.js so CI and this script cannot measure differently.
 *
 * WHAT THIS IS. `pvpGoalObjective` ranks builds against an AVERAGED reference
 * opponent described by REF_BLOCK / REF_PEN / REF_MISS / REF_FIGHT_SEC. Those
 * four numbers were picked by a plausible rule (half the soft cap, halved
 * again for class-gated stats) and never checked. This searches them for the
 * values that best reproduce the duel engine's ordering of a field of builds.
 *
 * WHY IT IS NOT CIRCULAR. The duel engine does not read these constants - it
 * plays out concrete fights tick by tick. So this is our detailed model
 * judging our cheap model, which is exactly the relationship the cheap model
 * exists to approximate. It depends on nothing the game might rebalance.
 *
 * WHAT IT CANNOT TELL YOU. Whether the duel engine itself is right. If the
 * best achievable agreement stays low, that is evidence the closed form's
 * SHAPE is wrong (audit §C1), not that the constants need another decimal.
 *
 * COST. Duels dominate, and they do not depend on the constants - so win
 * rates are computed once and every candidate setting is scored against that
 * fixed target. The sweep itself is nearly free.
 */

import { REF_DEFAULTS } from '../../src/lib/pvpGoalObjective.js';
import { CALIBRATION_FIELD, CONTRACT_FIELD } from '../../src/lib/pvpCalibrationField.js';
import { duelWinRates, rankAgreement, ranks } from '../../src/lib/pvpRankAgreement.js';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};

const ITERATIONS = arg('iterations', 200);
const BUDGET = arg('budget', 120000);
const DURATION = 60;
const SEED = 20260728;

/**
 * ⚠ ONLY THE BALANCED BLEND IS FITTED, and the reason is not a detail.
 *
 * A slider setting is a statement of PREFERENCE, not a prediction. When the
 * user asks for damage-heavy, the optimizer is supposed to maximise damage -
 * so its ranking legitimately differs from "who wins duels", and fitting the
 * constants to close that gap would be fitting away the feature. Only the
 * balanced blend claims to answer "which build is better overall", which is
 * the question a duel answers.
 *
 * The other two are still SCORED, as diagnostics. A strongly negative rho on
 * damage-heavy is not automatically a defect - see the report at the end of
 * the run for how to read it.
 */
const FIT_WEIGHTS = { damage: 34, mitigation: 33, survivability: 33 };
const DIAGNOSTIC_WEIGHTS = [
  { label: 'balanced (fitted)', weights: FIT_WEIGHTS },
  { label: 'damage-heavy', weights: { damage: 70, mitigation: 15, survivability: 15 } },
  { label: 'defence-heavy', weights: { damage: 15, mitigation: 40, survivability: 45 } },
];

/* Search grids. Wide enough that a fit landing on an endpoint is meaningful
   rather than an artifact of the range, and inside what the stat can
   physically be (a reference opponent's Block cannot exceed its 80 hard cap). */
const GRID = {
  block: [0.0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7],
  pen: [0.0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.65, 0.8],
  miss: [0.0, 0.05, 0.1, 0.125, 0.175, 0.25, 0.3, 0.35, 0.45, 0.6, 0.75],
  fightSec: [0, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 300],
};

/** Rank agreement of the FITTED slider setting against pre-computed duel truth. */
function scoreRefs(field, winRates, refs) {
  return rankAgreement(field, { budget: BUDGET, weights: FIT_WEIGHTS, refs, winRates }).rho;
}

function main() {
  console.log(`PVP reference-constant calibration`);
  console.log(`  field      ${CALIBRATION_FIELD.length} builds, both classes`);
  console.log(`  duels      ${ITERATIONS} iterations x ${DURATION}s, seed ${SEED}, budget ${BUDGET}`);
  console.log(`  fitting    balanced blend only (see FIT_WEIGHTS comment)\n`);

  // Duel truth: one field-wide round robin. Independent of the constants and
  // of the sliders, so it is computed once and reused everywhere below.
  const t0 = Date.now();
  const winRates = duelWinRates(CALIBRATION_FIELD, {
    budget: BUDGET,
    iterations: ITERATIONS,
    durationSeconds: DURATION,
    seed: SEED,
  });
  console.log(`Duel round-robin done in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  const report = (refs) => {
    for (const { label, weights } of DIAGNOSTIC_WEIGHTS) {
      const { rho } = rankAgreement(CALIBRATION_FIELD, { budget: BUDGET, weights, refs, winRates });
      console.log(`  ${label.padEnd(18)} rho = ${rho.toFixed(4)}`);
    }
  };

  const baseline = scoreRefs(CALIBRATION_FIELD, winRates, null);
  console.log(`BASELINE (shipped constants)  fitted-blend rho = ${baseline.toFixed(4)}`);
  report(null);

  // Coordinate ascent over the four axes. The surface is low-dimensional and
  // smooth enough that repeated sweeps converge; three rounds is plenty.
  let best = { ...REF_DEFAULTS };
  let bestScore = baseline;
  for (let round = 0; round < 3; round++) {
    let improved = false;
    for (const [key, values] of Object.entries(GRID)) {
      for (const v of values) {
        if (best[key] === v) continue;
        const trial = { ...best, [key]: v };
        const s = scoreRefs(CALIBRATION_FIELD, winRates, trial);
        if (s > bestScore + 1e-9) {
          bestScore = s;
          best = trial;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  console.log(`\nFITTED                        fitted-blend rho = ${bestScore.toFixed(4)}`);
  for (const key of Object.keys(GRID)) {
    const from = REF_DEFAULTS[key];
    const to = best[key];
    const grid = GRID[key];
    const atEdge = to === grid[0] || to === grid[grid.length - 1];
    console.log(
      `  ${key.padEnd(14)} ${String(from).padStart(6)} -> ${String(to).padStart(6)}` +
        `${from === to ? '   (unchanged)' : ''}${atEdge && from !== to ? '   ⚠ AT GRID EDGE - the fit is drifting, not converging' : ''}`
    );
  }
  report(best);
  console.log(`\n  improvement   ${(bestScore - baseline >= 0 ? '+' : '')}${(bestScore - baseline).toFixed(4)}`);

  // Sensitivity: how much does the fitted blend's rho move across each axis on
  // its own? A flat axis means the constant is not identifiable from this data
  // - no amount of tuning it will change what the user sees.
  console.log(`\nPER-AXIS SENSITIVITY (rho range while sweeping one constant, others shipped)`);
  for (const [key, values] of Object.entries(GRID)) {
    const rhos = values.map((v) => scoreRefs(CALIBRATION_FIELD, winRates, { [key]: v }));
    const lo = Math.min(...rhos);
    const hi = Math.max(...rhos);
    console.log(`  ${key.padEnd(14)} ${lo.toFixed(4)} .. ${hi.toFixed(4)}   (span ${(hi - lo).toFixed(4)})`);
  }

  // Held-out check: the contract field was NOT fitted, so this is the honest
  // read on whether the fit generalises or just memorised the fitting field.
  const heldOutRates = duelWinRates(CONTRACT_FIELD, {
    budget: BUDGET,
    iterations: ITERATIONS,
    durationSeconds: DURATION,
    seed: SEED,
  });
  const heldOutBase = rankAgreement(CONTRACT_FIELD, { budget: BUDGET, weights: FIT_WEIGHTS, refs: null, winRates: heldOutRates }).rho;
  const heldOutFit = rankAgreement(CONTRACT_FIELD, { budget: BUDGET, weights: FIT_WEIGHTS, refs: best, winRates: heldOutRates }).rho;
  console.log(`\nHELD-OUT (contract field, balanced sliders, not fitted)`);
  console.log(`  shipped  rho = ${heldOutBase.toFixed(4)}`);
  console.log(`  fitted   rho = ${heldOutFit.toFixed(4)}`);

  // Per-build detail on the fitting field, worst disagreement first - this is
  // where a wrong SHAPE shows up as a build both settings get badly wrong.
  const { closedForm } = rankAgreement(CALIBRATION_FIELD, { budget: BUDGET, weights: FIT_WEIGHTS, refs: best, winRates });
  const cfRank = ranks(closedForm);
  const duelRank = ranks(winRates);
  const rows = CALIBRATION_FIELD.map((b, i) => ({
    name: b.name,
    cf: cfRank[i],
    duel: duelRank[i],
    gap: Math.abs(cfRank[i] - duelRank[i]),
    win: winRates[i],
  })).sort((a, b) => b.gap - a.gap);
  console.log(`\nWorst rank disagreements (fitted, balanced):`);
  for (const r of rows.slice(0, 6)) {
    console.log(`  ${r.name.padEnd(16)} closed-form #${String(r.cf + 1).padStart(2)}  duels #${String(r.duel + 1).padStart(2)}  (win ${r.win.toFixed(1)}%)`);
  }
}

main();
