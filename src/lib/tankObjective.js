/**
 * tankObjective.js - the "Tank" optimization goal (Warrior).
 *
 * The formulas, the inversion that motivates them, and why each factor
 * excludes what it excludes are documented in
 * docs/Reference/combat-model.md §8 "Tank goal". Do not restate them here.
 *
 * Closed-form and cheap (like sigilAwareDpsObjective) - used single-stage, no
 * Monte Carlo screening needed.
 *
 * ⚠ selfHps comes from computeHps, and this is now its ONLY caller. That
 * function is a cheap ranking proxy, not a measurement - its biases are listed
 * in combat-model.md §3 "Healing". Ranking is all this objective needs, so the
 * proxy is defensible here; do not read a score as a survivability rate.
 */

import { computeHps } from './dps.js';
import { computePresetTotals } from './totals.js';

/** Named ehpWeight defaults for the UI; 'custom' (slider) covers the rest. */
export const TANK_PROFILES = [
  { id: 'max-tank', label: 'Max Tankiness', ehpWeight: 0.75 },
  { id: 'balanced', label: 'Balanced Tank', ehpWeight: 0.5 },
];

/**
 * The tank metrics for one set of (already-capped) display totals.
 * Returns { ehp, selfHps, landedFraction, sustainDps }.
 */
export function tankMetrics(totals) {
  const dr = (totals.dmg_reduction || 0) / 100; // capped at 60% by applyStatCaps
  const block = (totals.block_chance || 0) / 100; // capped at 80%
  const ehp = totals.health / (1 - dr);
  const selfHps = computeHps(totals).total_hps;
  // Caps guarantee landedFraction >= 0.4 * 0.2 = 0.08; the guard is belt-and-braces.
  const landedFraction = Math.max((1 - dr) * (1 - block), 1e-6);
  const sustainDps = selfHps / landedFraction;
  return { ehp, selfHps, landedFraction, sustainDps };
}

/**
 * The geometric ehp/sustain blend for one set of (already-capped) display
 * totals. `ehpWeight` 1 = pure burst buffer, 0 = pure sustain. Shared by
 * createTankObjective (optimizer) and Drop Check's tank goal scorer.
 */
export function tankScoreFromTotals(totals, ehpWeight = 0.5) {
  const w = Math.min(1, Math.max(0, Number(ehpWeight) || 0));
  const { ehp, sustainDps } = tankMetrics(totals);
  return Math.pow(1 + ehp, w) * Math.pow(1 + sustainDps, 1 - w);
}

/**
 * Objective factory for optimize(): scores a candidate build by the
 * geometric ehp/sustain blend above.
 */
export function createTankObjective({ ehpWeight = 0.5 } = {}) {
  return (candidateCharacter, candidatePreset) =>
    tankScoreFromTotals(computePresetTotals(candidateCharacter, candidatePreset), ehpWeight);
}
