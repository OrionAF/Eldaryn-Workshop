/**
 * pvpGoalObjective.js - the closed-form "PVP" optimization goal (both
 * classes), scoring a build as a weighted blend of three factors matching
 * the goal's three sliders: Maximum Damage / Damage Mitigation /
 * Survivability (weights sum 100, see normalisePresetGoal in model.js).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ THE FACTOR FORMULAS AND THEIR DERIVATION LIVE IN                     │
 * │ docs/Reference/combat-model.md §8 "PVP goal" - the inversion trick,   │
 * │ all three factors term by term (including the blind/paralyze uptime   │
 * │ models), the geometric blend, and why each reference constant has     │
 * │ the value it does. That document is the design record; this file is   │
 * │ the implementation. Do not restate the formulas here.                 │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * ⚠ The reference constants below are all [INVENTED] - plausible values on a
 * stated rule (half the relevant soft cap; halved again for class-gated
 * stats, since only one of the two classes on the ladder carries them), never
 * validated against anything. They drive every PVP ranking in the app.
 * Calibrating them against gauntlet duel rankings is audit item C2; the
 * survivability factor's own shape is F4/F6.
 */

import { computeDps, pvpEffect } from './dps.js';
import { PVP_HEALTH_MULTIPLIER } from './pvpSimulation.js';
import { computePresetTotals } from './totals.js';
import { sigilAwareDpsFromTotals } from './optimizer.js';

// --- Reference-opponent constants (see header: half soft cap, halved again
// for class-gated stats because only half the ladder has them) -------------
export const REF_BLOCK = 0.1; // Block soft cap 40%, Warrior-only
export const REF_PEN = 0.15; // Penetration soft cap 30% (post-rework), both classes
export const REF_MISS = 0.125; // Miss soft cap 50%, Sentinel-only
export const REF_SPELL_SHARE = 0.25; // share of incoming damage that is sigil spell damage
export const REF_ENEMY_SWINGS_PER_SEC = 2; // Speed soft cap 200%
export const REF_FIGHT_SEC = 30; // half the 60s duel horizon

// Mirrors pvpSimulation's PARALYZE_TICKS. NOT a reference constant and not
// tunable: it is a property of the duel engine, so changing it here would
// desync the two models rather than tune this one.
export const PARALYZE_SEC = 2;

/**
 * The tunable reference-opponent set, as one object so it can be overridden
 * wholesale. `pvpFactorMetrics` takes a `refs` option purely so the
 * calibration harness (docs/tools/calibrate-pvp-refs.mjs) can search this space -
 * nothing in the app passes it, and the defaults ARE the shipped constants.
 */
export const REF_DEFAULTS = Object.freeze({
  block: REF_BLOCK,
  pen: REF_PEN,
  miss: REF_MISS,
  spellShare: REF_SPELL_SHARE,
  enemySwingsPerSec: REF_ENEMY_SWINGS_PER_SEC,
  fightSec: REF_FIGHT_SEC,
});

/** Slider weights record -> fractions summing 1 (defensive - the persisted goal already sums 100). */
function weightFractions(weights) {
  const d = Math.max(0, Number(weights?.damage) || 0);
  const m = Math.max(0, Number(weights?.mitigation) || 0);
  const s = Math.max(0, Number(weights?.survivability) || 0);
  const sum = d + m + s;
  if (sum <= 0) return { damage: 1 / 3, mitigation: 1 / 3, survivability: 1 / 3 };
  return { damage: d / sum, mitigation: m / sum, survivability: s / sum };
}

/**
 * The three factor metrics for one set of (already-capped) display totals.
 * `sigilActiveDps` defaults to 0 - the optimizer objective passes the
 * sigil-aware increment; totals-only callers (tests, future stat weights)
 * get the swing-only damage factor.
 * Returns { maxDamage, mitigation, survivability, landedFraction, selfHps }.
 */
export function pvpFactorMetrics(totals, { sigilActiveDps = 0, refs = null } = {}) {
  const r = refs ? { ...REF_DEFAULTS, ...refs } : REF_DEFAULTS;

  // --- Maximum Damage ---
  // Penetration Rework: pierced damage now crits like any other hit, so the
  // blocked share is simply scaled by penetration. It used to be divided by
  // critFactor to strip the crit that computeDps() had already baked in,
  // because the pierced portion could not crit.
  const blockPenFactor = (1 - r.block) + r.block * ((totals.penetration || 0) / 100);
  const pvpAttackFactor = 1 + pvpEffect(totals.pvp_attack || 0) / 100;
  // Bound to a name because the Survivability factor below reuses it.
  const swingDamage = pvpAttackFactor * blockPenFactor * computeDps(totals);
  const maxDamage = swingDamage + pvpAttackFactor * sigilActiveDps;

  // --- Damage Mitigation ---
  const landedHitsPerSec = ((Number(totals.speed) || 0) / 100) * (1 - r.miss);
  const blindedFraction = Math.min(
    0.9,
    (landedHitsPerSec * ((totals.blind_chance || 0) / 100)) / r.enemySwingsPerSec
  );
  const paralyzeUptime = 1 - Math.exp(-landedHitsPerSec * ((totals.paralyze_chance || 0) / 100) * PARALYZE_SEC);
  const drFactor = 1 - Math.min(100, totals.dmg_reduction || 0) / 100;
  const pvpDefFactor = 1 - pvpEffect(totals.pvp_defense || 0) / 100;
  const swingLanded =
    (1 - (totals.miss_chance || 0) / 100) *
    (1 - blindedFraction) *
    (1 - paralyzeUptime) *
    (1 - ((totals.block_chance || 0) / 100) * (1 - r.pen)) *
    drFactor *
    pvpDefFactor;
  const spellLanded = (1 - Math.min(100, totals.spell_resist || 0) / 100) * drFactor * pvpDefFactor;
  const landedFraction = Math.max(
    (1 - r.spellShare) * swingLanded + r.spellShare * spellLanded,
    1e-6
  );
  const mitigation = 1 / landedFraction;

  // --- Survivability ---
  // Deliberately NOT computeHps: lifesteal leeches off `swingDamage`, and
  // sigilActiveDps is excluded. Both are load-bearing - see combat-model.md
  // §8 Factor 3.
  const selfHps =
    (totals.health || 0) * ((totals.hp_regen || 0) / 100) +
    swingDamage * ((totals.lifesteal || 0) / 100);
  const survivability = PVP_HEALTH_MULTIPLIER * (totals.health || 0) + selfHps * r.fightSec;

  return { maxDamage, mitigation, survivability, landedFraction, selfHps };
}

/**
 * The geometric three-factor blend for one set of (already-capped) display
 * totals. Shared by createPvpGoalObjective (optimizer) and any future
 * closed-form PVP scorer (Drop Check, linking simulation).
 */
export function pvpGoalScoreFromTotals(totals, weights, { sigilActiveDps = 0, refs = null } = {}) {
  const w = weightFractions(weights);
  const { maxDamage, mitigation, survivability } = pvpFactorMetrics(totals, { sigilActiveDps, refs });
  return (
    Math.pow(1 + maxDamage, w.damage) *
    Math.pow(1 + mitigation, w.mitigation) *
    Math.pow(1 + survivability, w.survivability)
  );
}

/**
 * Objective factory for optimize(): scores a candidate build by the blend
 * above, with the Maximum Damage factor upgraded to the full sigil-aware
 * DPS (the same closed-form the PVE objective uses) so Spell Damage and
 * equipped sigils keep their value under a PVP/Custom goal search.
 */
export function createPvpGoalObjective({ weights } = {}) {
  return (candidateCharacter, candidatePreset) => {
    const totals = computePresetTotals(candidateCharacter, candidatePreset);
    const sigilActiveDps =
      sigilAwareDpsFromTotals(totals, candidateCharacter, candidatePreset) - computeDps(totals);
    return pvpGoalScoreFromTotals(totals, weights, { sigilActiveDps });
  };
}
