/**
 * dps.js - PVE DPS/HPS model and gear-swap comparison.
 *
 * 1:1 port of EldarynTracker/dps.py (the Python reference implementation).
 * Pure functions, no UI deps. EldarynTracker/test_dps.py is the test spec
 * (see dps.test.js).
 *
 * Scope: PVE only. We deliberately ignore enemy defense, block, miss, blind,
 * and penetration (PVP / defensive interactions). PVE damage output depends
 * only on the offensive stats: Attack, Attack %, Speed, Critical %, Crit Mult,
 * Double Hit. Sustain (Health, Health %, HP Regen, Lifesteal) drives HPS.
 * The defensive/PVP fields (block_chance..paralyze_chance, pvp_attack,
 * pvp_defense) are carried on OffensiveStats and through swap math for
 * display/tracking only - see docs/adr/0001-defer-pvp-combat-modeling.md.
 *
 * THE MODEL
 * ---------
 * Base character (nothing equipped): Attack 10, Speed 100%, Crit 0%,
 * Crit Mult 150%, Double Hit 0%.
 *
 * Displayed "Total Attributes" are FINAL totals from every source. The Attack
 * line shows a final value plus "+X%" (total Attack %), already baked in:
 *     finalAttack = flatAttackTotal * (1 + attackPct/100)
 * Verified against a real profile: 35.833 * 1.343 = 48.124.
 *
 * STACKING RULES:
 *  - Attack %, Critical %, Double Hit, HP Regen, Lifesteal, Health %, and the
 *    defensive/PVP-adjacent % fields all have base 0 so they can only be
 *    ADDITIVE.
 *  - Attack/Health (flat) sum, then the summed % multiplies the flat total.
 *  - Speed (base 100%) and Crit Mult (base 150%) have non-zero bases, but
 *    stack additively, same as everything else.
 *  - PVP Attack/Defense are flat "rating" stats (sum additively like Attack)
 *    with a derived, non-stored percentage: see pvpEffect().
 */

import { STAT_FIELDS, SWAP_ADDITIVE_KEYS } from './constants.js';

// --- Game constants ---
export const BASE_ATTACK = 10.0;
export const BASE_SPEED = 100.0; // %
export const BASE_CRIT = 0.0; // %
export const BASE_CRIT_MULT = 150.0; // %
export const BASE_DOUBLE_HIT = 0.0; // %

/**
 * Factory for an OffensiveStats record. Carries every field in STAT_FIELDS
 * (constants.js) - both the DPS/HPS-relevant stats and the defensive/PVP
 * fields that are tracked but not yet computed with - so one object fully
 * describes a loadout's totals OR a single piece's contribution.
 */
export function offensiveStats(overrides = {}) {
  const defaults = {};
  for (const f of STAT_FIELDS) defaults[f.key] = 0.0;
  return { ...defaults, ...overrides };
}

/**
 * PVP Attack/Defense diminishing-returns conversion: rating -> effect.
 * effect = rating / (rating + 200). Rating is the summable "source" value
 * (like flat Attack); the percentage is always derived, never stored.
 * Verified against a real combat example: 303 rating -> 60.2%, 283 -> 58.6%.
 */
export function pvpEffect(rating) {
  const r = Math.max(0, rating || 0);
  return (r / (r + 200)) * 100;
}

/** Combine flat Attack total with total Attack % the way the game displays it. */
export function finalAttack(flatAttackTotal, attackPctTotal) {
  return flatAttackTotal * (1 + attackPctTotal / 100.0);
}

/** Inverse of finalAttack: recover the flat Attack total from the displayed value. */
export function flatAttackFromDisplay(displayedAttack, attackPctTotal) {
  return displayedAttack / (1 + attackPctTotal / 100.0);
}

/**
 * Relative PVE DPS from a set of FINAL totals.
 *  - The MAIN hit can crit: attack * (1 + crit * (critMult - 1)).
 *  - DOUBLE HIT fires a second strike a `double_hit` fraction of the time, but
 *    it deals NORMAL damage and CANNOT crit, contributing attack * double_hit
 *    OUTSIDE the crit multiplier.
 *  - SPEED scales attack rate (232% = 2.32x).
 */
export function computeDps(profile) {
  const c = profile.crit / 100.0;
  const cm = profile.crit_mult / 100.0;
  const dh = profile.double_hit / 100.0;
  const speedFactor = profile.speed / 100.0;

  const mainHit = profile.attack * (1 + c * (cm - 1)); // can crit
  const doubleExtra = profile.attack * dh; // normal damage, cannot crit
  return (mainHit + doubleExtra) * speedFactor;
}

/**
 * Healing per second (PVE):
 *  - HP Regen: flat % of total Health per second -> health * hpRegen/100
 *  - Lifesteal: % of damage dealt -> DPS * lifesteal/100 (inherits crits via DPS)
 * Returns { hps_regen, hps_lifesteal, total_hps }.
 */
export function computeHps(profile) {
  const dps = computeDps(profile);
  const hpsRegen = profile.health * (profile.hp_regen / 100.0);
  const hpsLifesteal = dps * (profile.lifesteal / 100.0);
  return {
    hps_regen: hpsRegen,
    hps_lifesteal: hpsLifesteal,
    total_hps: hpsRegen + hpsLifesteal,
  };
}

/** Additive stacking: drop the old piece's contribution, add the new one's. */
function combineAdditive(total, remove, add) {
  return total - remove + add;
}

/**
 * Given the character's FINAL profile totals, the OLD piece in a slot, and the
 * NEW piece to test, return the new profile totals as they'd display after the
 * swap. profileTotals.attack is the displayed final Attack; old/new .attack are
 * flat Attack contributions.
 *
 * Every field in STAT_FIELDS is carried through: attack/health decompose+
 * recombine via their %, speed/crit_mult stack additively (same as
 * everything else), and everything else (SWAP_ADDITIVE_KEYS - crit, double_hit,
 * hp_regen, lifesteal, the defensive fields, pvp_attack, pvp_defense, ...) is
 * combined additively (base 0, so additive is the only option).
 */
export function applySwap(profileTotals, oldPiece, newPiece) {
  // Attack: decompose to flat total, swap flat + %, recombine.
  const flatTotal = flatAttackFromDisplay(profileTotals.attack, profileTotals.attack_pct);
  const newFlatTotal = combineAdditive(flatTotal, oldPiece.attack, newPiece.attack);
  const newAttackPct = combineAdditive(profileTotals.attack_pct, oldPiece.attack_pct, newPiece.attack_pct);
  const newFinalAttack = finalAttack(newFlatTotal, newAttackPct);

  // Health: same flat * (1 + Health%) structure as Attack.
  const flatHealth = flatAttackFromDisplay(profileTotals.health, profileTotals.health_pct);
  const newFlatHealth = combineAdditive(flatHealth, oldPiece.health, newPiece.health);
  const newHealthPct = combineAdditive(profileTotals.health_pct, oldPiece.health_pct, newPiece.health_pct);
  const newHealth = finalAttack(newFlatHealth, newHealthPct);

  // Speed & Crit Mult: additive, same as every other field.
  const newSpeed = combineAdditive(profileTotals.speed, oldPiece.speed, newPiece.speed);
  const newCritMult = combineAdditive(profileTotals.crit_mult, oldPiece.crit_mult, newPiece.crit_mult);

  // Every other field (base 0): additive.
  const additive = {};
  for (const key of SWAP_ADDITIVE_KEYS) {
    additive[key] = combineAdditive(profileTotals[key], oldPiece[key], newPiece[key]);
  }

  return offensiveStats({
    ...additive,
    attack: newFinalAttack,
    attack_pct: newAttackPct,
    speed: newSpeed,
    crit_mult: newCritMult,
    health: newHealth,
    health_pct: newHealthPct,
  });
}

/**
 * Full comparison. Returns current/new DPS & HPS, deltas, % changes, a verdict,
 * and the before/after profile totals so the UI can show which stats moved.
 */
export function compareSwap(profileTotals, oldPiece, newPiece) {
  const after = applySwap(profileTotals, oldPiece, newPiece);
  const curDps = computeDps(profileTotals);
  const newDps = computeDps(after);
  const curHps = computeHps(profileTotals).total_hps;
  const newHps = computeHps(after).total_hps;
  const pct = curDps ? (newDps / curDps - 1) * 100 : NaN;
  const hpsPct = curHps ? (newHps / curHps - 1) * 100 : NaN;
  return {
    current_dps: curDps,
    new_dps: newDps,
    delta: newDps - curDps,
    pct_change: pct,
    current_hps: curHps,
    new_hps: newHps,
    hps_delta: newHps - curHps,
    hps_pct_change: hpsPct,
    verdict: newDps > curDps ? 'upgrade' : newDps < curDps ? 'downgrade' : 'no change',
    before: profileTotals,
    after,
  };
}
