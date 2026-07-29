/**
 * dps.js - PVE DPS/HPS model and gear-swap comparison.
 *
 * 1:1 port of EldarynTracker/dps.py (the Python reference implementation).
 * Pure functions, no UI deps. EldarynTracker/test_dps.py is the test spec
 * (see dps.test.js).
 *
 * Scope: THIS MODULE is PVE closed-form only - it ignores enemy defense,
 * block, miss, blind and penetration. PVE damage output here depends only on
 * Attack, Attack %, Speed, Critical %, Crit Mult, Double Hit.
 *
 * That is a scope statement about this file, NOT about the app. The
 * defensive/PVP fields are carried on OffensiveStats and are very much
 * computed with elsewhere: pvpSimulation.js (duel engine), tankObjective.js,
 * pvpGoalObjective.js and the gauntlet all read them. ADR 0001, which said
 * they were display-only, is superseded. The whole picture, including where
 * this closed form sits in the pipeline, is docs/Reference/combat-model.md.
 *
 * SETTLED RULE - the double-hit strike CANNOT crit. Owner ruling 2026-07-28;
 * this is a game fact, not a modelling choice, and the additive form below is
 * correct. It was briefly contested by a reverse-engineered Combat Power
 * formula that implied otherwise; that whole line of work is abandoned (see
 * docs/Archive/) because the game's CP rating is under active rebalancing and
 * a snapshot of it is not evidence about combat resolution. Do not reopen
 * this from a CP argument.
 *
 * ⚠ ONE CAVEAT ON THE FORMULAS BELOW: computeHps is a Phase-0 artifact, not a
 * reliable survivability rate. Its biases, and the one caller that still
 * accepts them, are in combat-model.md §3 "Healing" - read that before using
 * it anywhere new.
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
 * Factory for an OffensiveStats record. Carries EVERY field in STAT_FIELDS
 * (constants.js), not just the ones this module reads, so one object fully
 * describes a loadout's totals OR a single piece's contribution. The
 * defensive/PVP fields are inert *here* and load-bearing elsewhere (duel
 * engine, both goal objectives, the gauntlet) - see the header.
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
 * Displayed Attack after a TIMED BUFF adds flat Attack and/or Attack %.
 *
 * **[RULED] 2026-07-28: Attack % buffs are ADDITIVE into the Attack % total**,
 * not multiplicative on the displayed number. A build at 175% Attack % that
 * activates a +20% sigil is at 195%, not 175% x 1.2.
 *
 * So the buff cannot just scale `displayedAttack` - it has to decompose back
 * to the flat pool, add there, and recombine with the summed percentage:
 *
 *   flatTotal = displayed / (1 + basePct/100)
 *   result    = (flatTotal + flatAdd) * (1 + (basePct + pctAdd)/100)
 *
 * This lives here, and ONLY here, because all three engines
 * (sigilEffects.modifySwing, pvpSimulation.resolveHit,
 * optimizer.sigilAwareDpsFromTotals) previously each multiplied the displayed
 * value instead - three copies of one wrong convention, which is exactly why
 * no test caught it (audit F3). Do not re-inline this.
 *
 * Note the two models AGREE when basePct is 0, and diverge more the higher the
 * build's existing Attack % - so it lands hardest on end-game builds.
 */
export function buffedAttack(displayedAttack, basePct, flatAdd = 0, pctAdd = 0) {
  const displayed = Number(displayedAttack) || 0;
  const base = Number(basePct) || 0;
  // A -100% total would make the flat pool undefined; nothing can reach it
  // (Attack % has base 0 and no negative sources), but guard rather than NaN.
  const flatTotal = base <= -100 ? displayed : displayed / (1 + base / 100);
  const pct = base + (Number(pctAdd) || 0);
  return (flatTotal + (Number(flatAdd) || 0)) * (1 + Math.max(-100, pct) / 100);
}

/**
 * Relative PVE DPS from a set of FINAL totals.
 *  - The MAIN hit can crit: attack * (1 + crit * (critMult - 1)).
 *  - DOUBLE HIT fires a second strike a `double_hit` fraction of the time, but
 *    it deals NORMAL damage and CANNOT crit (settled - see the header),
 *    contributing attack * double_hit OUTSIDE the crit multiplier.
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
 * Full comparison. Returns current/new DPS, the delta, the % change, a verdict,
 * and the before/after profile totals so the UI can show which stats moved.
 *
 * DPS only - the four HPS fields this used to return are gone (see
 * combat-model.md §3 `compareSwap`). Do not add a healing verdict back here.
 */
export function compareSwap(profileTotals, oldPiece, newPiece) {
  const after = applySwap(profileTotals, oldPiece, newPiece);
  const curDps = computeDps(profileTotals);
  const newDps = computeDps(after);
  const pct = curDps ? (newDps / curDps - 1) * 100 : NaN;
  return {
    current_dps: curDps,
    new_dps: newDps,
    delta: newDps - curDps,
    pct_change: pct,
    verdict: newDps > curDps ? 'upgrade' : newDps < curDps ? 'downgrade' : 'no change',
    before: profileTotals,
    after,
  };
}
