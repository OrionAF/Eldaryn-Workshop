/**
 * statWeights.js - marginal DPS per stat point ("stat weights") for a preset.
 *
 * Perturbs the preset's CALCULATED totals one stat at a time by a
 * game-meaningful unit and re-scores with the optimizer's own closed-form
 * sigil-aware DPS (sigilAwareDpsFromTotals), so the weights agree with what
 * the Build Optimizer maximises. Rows come back sorted by DPS gained, and a
 * capped stat that can't help anymore simply scores ~0 - which is itself the
 * answer ("crit is capped, hunt something else").
 */

import { computePresetTotals } from './totals.js';
import { sigilAwareDpsFromTotals } from './optimizer.js';

/**
 * One probe per stat the DPS engine reads. `apply` returns the perturbed
 * value from the current one - percent-style stats step by a flat point,
 * Attack gets both a flat and a relative probe (gear rolls come both ways).
 */
export const STAT_PERTURBATIONS = [
  { key: 'attack', label: 'Attack', unit: '+100 flat', apply: (v) => v + 100 },
  { key: 'attack', label: 'Attack %', unit: '+1%', apply: (v) => v * 1.01 },
  { key: 'crit', label: 'Crit Chance', unit: '+1%', apply: (v) => v + 1 },
  { key: 'crit_mult', label: 'Crit Multiplier', unit: '+10%', apply: (v) => v + 10 },
  { key: 'speed', label: 'Speed', unit: '+10', apply: (v) => v + 10 },
  { key: 'double_hit', label: 'Double Hit', unit: '+1%', apply: (v) => v + 1 },
];

/** [{ key, label, unit, deltaDps, deltaPct }] sorted by deltaDps desc. */
export function computeStatWeights(character, preset) {
  const totals = computePresetTotals(character, preset);
  const base = sigilAwareDpsFromTotals(totals, character, preset);
  return STAT_PERTURBATIONS.map(({ key, label, unit, apply }) => {
    const perturbed = { ...totals, [key]: apply(Number(totals[key]) || 0) };
    const dps = sigilAwareDpsFromTotals(perturbed, character, preset);
    return {
      key,
      label,
      unit,
      deltaDps: dps - base,
      deltaPct: base > 0 ? ((dps - base) / base) * 100 : 0,
    };
  }).sort((a, b) => b.deltaDps - a.deltaDps);
}
