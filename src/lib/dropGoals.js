/**
 * dropGoals.js - Drop Check's selectable verdict goals.
 *
 * Drop Check's verdict used to be hardwired to the closed-form DPS diff in
 * compareSwap. A character now carries a persisted `dropGoal`
 * ({ kind, ehpWeight } - normalised in model.js) and the verdict is "did the
 * goal's score improve", using the SAME scoring the Build Optimizer's
 * objectives use, but at the totals level: compareSwap already produces the
 * before/after totals for a piece swap, so each goal only needs a
 * (totals) => number scorer, no preset reconstruction.
 *
 * ⚠ SCORER INPUTS ARE RAW (pre-curve) TOTALS, and every scorer here curves
 * its own input exactly once. VerdictCard swaps on computePresetRawTotals and
 * applySwap recombines without capping, so the curve has not been applied yet
 * when a scorer receives the totals. Swapping on already-curved totals would
 * let an item's printed stats bypass diminishing returns, and the curve is
 * not idempotent - see combat-model.md §1 for the pipeline and §2 for why
 * double-curving is silent rather than loud.
 *
 * This module is the reference implementation of that discipline; statWeights
 * gets it wrong (audit F2).
 *
 * 'dps-accurate' (Monte Carlo) is too slow for the per-keystroke reactive
 * flow, so createDropScorer returns the fast sigil-aware closed form as an
 * instant interim estimate and VerdictCard debounces scoreSwapMonteCarlo to
 * confirm. Both MC runs share one seed (common random numbers) so the
 * before/after comparison is paired - the same trick optimize() uses.
 */

import { applyStatCaps } from './totals.js';
import { sigilAwareDpsFromTotals } from './optimizer.js';
import { tankScoreFromTotals } from './tankObjective.js';
import { runSimulation, DEFAULT_EFFECTS } from './simulation.js';
import { buildSigilEffects } from './sigilEffects.js';

/**
 * The selectable goals, in display order. `label` is the toggle-button text;
 * `scoreLabel` prefixes the score line in a verdict row. Tank mirrors the
 * Simulation screen's Warrior-only gating (normaliseDropGoal enforces it on
 * persisted data too).
 */
export const DROP_GOALS = [
  { kind: 'dps-fast', label: 'DPS', scoreLabel: 'DPS' },
  { kind: 'dps-accurate', label: 'DPS (sim)', scoreLabel: 'Sim DPS' },
  { kind: 'tank', label: 'Tank', scoreLabel: 'Tank', warriorOnly: true },
];

/* Same defaults as the optimizer's pve-accurate spec; not user-configurable
   in Drop Check (a drop verdict doesn't need tunable precision). */
export const MC_ITERATIONS = 100;
export const MC_DURATION_SECONDS = 60;

/**
 * Synchronous (totals) => number scorer for one (character, preset) under
 * `goal`. For 'dps-accurate' this is the instant interim estimate (the fast
 * sigil-aware closed form); the MC confirmation is scoreSwapMonteCarlo.
 */
export function createDropScorer(goal, character, preset) {
  switch (goal?.kind) {
    case 'tank':
      return (totals) => tankScoreFromTotals(applyStatCaps(totals), goal.ehpWeight);
    default: // 'dps-fast', and the interim estimate for 'dps-accurate'
      return (totals) => sigilAwareDpsFromTotals(applyStatCaps(totals), character, preset);
  }
}

/**
 * Monte Carlo scoring of one before/after swap for the 'dps-accurate' goal.
 * Synchronous and ~tens of ms per call at the default iteration count -
 * callers debounce, this doesn't. Returns { curScore, newScore }.
 */
export function scoreSwapMonteCarlo({
  character,
  preset,
  beforeTotals,
  afterTotals,
  iterations = MC_ITERATIONS,
  durationSeconds = MC_DURATION_SECONDS,
}) {
  // Effects are rebuilt per totals set: the swapped piece can itself roll
  // Spell Damage, which scales the sigil effects' damage numbers.
  const run = (totals) => {
    const stats = applyStatCaps(totals);
    const effects = [...DEFAULT_EFFECTS, ...buildSigilEffects(character, preset, stats.spell_damage)];
    return runSimulation({ stats, iterations, durationSeconds, seed: 1, effects }).meanDps;
  };
  return { curScore: run(beforeTotals), newScore: run(afterTotals) };
}
