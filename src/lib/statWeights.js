/**
 * statWeights.js - marginal score per stat point ("stat weights") for a
 * preset, under a chosen goal.
 *
 * Perturbs the preset's Calculated totals one stat at a time by a
 * game-meaningful unit and re-scores with the goal's own closed-form
 * scorer, so the weights agree with what that goal's Build Optimizer
 * maximises. Rows come back sorted by score gained. See
 * docs/Reference/combat-model.md §8 "Stat weights".
 *
 * ⚠ THE THING TO GET RIGHT HERE: probe the RAW totals, then curve exactly
 * once - the same discipline dropGoals.js documents. Perturbing the already-
 * curved record instead credits a point at its full linear value no matter
 * how far past the soft cap the stat already sits, and can even produce an
 * impossible above-hard-cap state. This module did that until 2026-07-28;
 * the curve is not idempotent, so neither mistake is loud.
 *
 * Default (no options) = the DPS goal: offensive probes only, scored by
 * sigilAwareDpsFromTotals. Tank / PVP goals add the defensive & utility
 * probes and score through their own closed forms, so the linking
 * simulation's per-stat priority report is meaningful for those builds too.
 */

import { computePresetRawTotals, applyStatCaps } from './totals.js';
import { computeDps, buffedAttack } from './dps.js';
import { sigilAwareDpsFromTotals } from './optimizer.js';
import { tankScoreFromTotals } from './tankObjective.js';
import { pvpGoalScoreFromTotals } from './pvpGoalObjective.js';

/**
 * Offensive probes - one per stat the DPS engine reads. `apply(value, totals)`
 * returns the perturbed value from the current one; `totals` is the whole raw
 * record, needed only by probes that cannot be expressed as a change to their
 * own field. Percent-style stats step by a flat point. Attack gets two probes
 * because gear rolls it two ways: flat Attack, and Attack % .
 *
 * ⚠ The Attack % probe adds one PERCENTAGE POINT to the Attack % total, via
 * buffedAttack - not a 1% relative bump to displayed Attack, which is what it
 * did until 2026-07-29. Those differ on any build that already has Attack %,
 * i.e. every real end-game build, and the confusion between them is exactly
 * what dps.js's buffedAttack exists to end. `key` stays 'attack' because the
 * probe's effect lands on displayed Attack; the label is what it means.
 */
export const STAT_PERTURBATIONS = [
  { key: 'attack', label: 'Attack', unit: '+100 flat', apply: (v) => v + 100 },
  { key: 'attack', label: 'Attack %', unit: '+1pt', apply: (v, totals) => buffedAttack(v, totals.attack_pct, 0, 1) },
  { key: 'crit', label: 'Crit Chance', unit: '+1%', apply: (v) => v + 1 },
  { key: 'crit_mult', label: 'Crit Multiplier', unit: '+10%', apply: (v) => v + 10 },
  { key: 'speed', label: 'Speed', unit: '+10', apply: (v) => v + 10 },
  { key: 'double_hit', label: 'Double Hit', unit: '+1%', apply: (v) => v + 1 },
  // Only moves the sigil-spell side of the score - weights ~0 with no damage sigils equipped.
  { key: 'spell_damage', label: 'Spell Damage', unit: '+1%', apply: (v) => v + 1 },
];

/** Defensive / utility probes - added for the tank and PVP goals. */
export const DEFENSIVE_PERTURBATIONS = [
  { key: 'health', label: 'Health', unit: '+1.000 flat', apply: (v) => v + 1000 },
  { key: 'health_pct', label: 'Health %', unit: '+1%', apply: (v) => v + 1 },
  { key: 'hp_regen', label: 'HP Regen', unit: '+1%', apply: (v) => v + 1 },
  { key: 'lifesteal', label: 'Lifesteal', unit: '+1%', apply: (v) => v + 1 },
  { key: 'dmg_reduction', label: 'DMG Reduction', unit: '+1%', apply: (v) => v + 1 },
  { key: 'block_chance', label: 'Block Chance', unit: '+1%', apply: (v) => v + 1 },
  { key: 'spell_resist', label: 'Spell Resist', unit: '+1%', apply: (v) => v + 1 },
  { key: 'miss_chance', label: 'Miss Chance', unit: '+1%', apply: (v) => v + 1 },
  { key: 'blind_chance', label: 'Blind Chance', unit: '+1%', apply: (v) => v + 1 },
  { key: 'paralyze_chance', label: 'Paralyze Chance', unit: '+1%', apply: (v) => v + 1 },
  { key: 'penetration', label: 'Penetration', unit: '+1%', apply: (v) => v + 1 },
  { key: 'pvp_attack', label: 'PVP Attack', unit: '+50 flat', apply: (v) => v + 50 },
  { key: 'pvp_defense', label: 'PVP Defense', unit: '+50 flat', apply: (v) => v + 50 },
];

/** A totals -> score function for the given goal (closed-form, matching each goal's optimizer objective). */
function scorerFor(character, preset, { goalKind, ehpWeight, weights } = {}) {
  if (goalKind === 'tank') {
    return (totals) => tankScoreFromTotals(totals, ehpWeight ?? 0.5);
  }
  if (goalKind === 'pvp' || goalKind === 'custom') {
    return (totals) => {
      // Same sigil-active increment createPvpGoalObjective folds in.
      const sigilActiveDps = sigilAwareDpsFromTotals(totals, character, preset) - computeDps(totals);
      return pvpGoalScoreFromTotals(totals, weights, { sigilActiveDps });
    };
  }
  return (totals) => sigilAwareDpsFromTotals(totals, character, preset); // dps / null
}

/**
 * [{ key, label, unit, delta, deltaDps, deltaPct }] sorted by delta desc.
 * `deltaDps` is kept as an alias of `delta` for the Simulation screen's
 * DPS-only panel. `options` (goalKind/ehpWeight/weights) selects the goal;
 * omit it for the default DPS behaviour.
 */
export function computeStatWeights(character, preset, options = {}) {
  const goalKind = options.goalKind ?? null;
  const raw = computePresetRawTotals(character, preset);
  const score = scorerFor(character, preset, options);
  // Curving the unperturbed raw record IS computePresetTotals, so the baseline
  // is unchanged from before the F2 fix - only the probes move.
  const base = score(applyStatCaps(raw));
  const probes =
    goalKind === 'tank' || goalKind === 'pvp' || goalKind === 'custom'
      ? [...STAT_PERTURBATIONS, ...DEFENSIVE_PERTURBATIONS]
      : STAT_PERTURBATIONS;
  return probes
    .map(({ key, label, unit, apply }) => {
      const perturbed = applyStatCaps({ ...raw, [key]: apply(Number(raw[key]) || 0, raw) });
      const delta = score(perturbed) - base;
      return {
        key,
        label,
        unit,
        delta,
        deltaDps: delta, // historical alias (SimulationScreen reads deltaDps)
        deltaPct: base > 0 ? (delta / base) * 100 : 0,
      };
    })
    .sort((a, b) => b.delta - a.delta);
}
