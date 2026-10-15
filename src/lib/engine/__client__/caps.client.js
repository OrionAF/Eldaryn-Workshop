// Test-only hand transcription of the 2.7.0 client's soft caps (module 3958). Each function follows
// the decompiled bytecode statement by statement, in its order of floating-point operations, and the
// constants are the client's literals, not the catalogue: clientDiff.test.js checks the engine and the
// catalogue against them. Never imported by app code.

// transcribed from L1080515-1080518 (SOFT_CAP_CURVE_EXPONENT = slot3, PVP_RATING_K = slot4)
export const SOFT_CAP_CURVE_EXPONENT = 2;
export const PVP_RATING_K = 200;

// transcribed from L1080441-1080485 (SOFT_CAPS)
export const SOFT_CAPS = {
  ATTACK_SPEED: { soft: 2, hard: 4 },
  CRIT_CHANCE: { soft: 50, hard: 90 },
  CRIT_DAMAGE: { soft: 3, hard: 7 },
  DOUBLE_HIT: { soft: 60, hard: 90 },
  LIFESTEAL: { soft: 40, hard: 70 },
  HP_REGEN: { soft: 40, hard: 60 },
  DAMAGE_REDUCTION: { soft: 30, hard: 60 },
  BLOCK_CHANCE: { soft: 40, hard: 80 },
  PENETRATION: { soft: 30, hard: 70 },
  MISS_CHANCE: { soft: 50, hard: 85 },
  BLIND_CHANCE: { soft: 30, hard: 50 },
  PARALYZE_CHANCE: { soft: 8, hard: 18 },
  SPELL_CRIT_CHANCE: { soft: 50, hard: 90 },
  SPELL_RESIST: { soft: 30, hard: 60 },
  SPELL_VAMP: { soft: 40, hard: 70 },
  DISRUPTION_CHANCE: { soft: 10, hard: 20 },
  FEAR_CHANCE: { soft: 10, hard: 20 },
  MINION_CRIT_CHANCE: { soft: 50, hard: 90 },
  MINION_LIFESTEAL: { soft: 40, hard: 70 },
  SOUL_LINK: { soft: 40, hard: 70 },
  MINION_ATTACK_SPEED: { soft: 2, hard: 4 },
};

// transcribed from L1080486 (COMBAT_CEILINGS)
export const COMBAT_CEILINGS = {
  MISS_CHANCE: 90, BLIND_CHANCE: 60, DAMAGE_REDUCTION: 75, BLOCK_CHANCE: 85, CRIT_CHANCE: 95,
  LIFESTEAL: 80, ATTACK_SPEED: 4.5, PENETRATION: 80, SPELL_CRIT_CHANCE: 95, SPELL_VAMP: 80,
  HP_REGEN: 70, MINION_CRIT_CHANCE: 95, MINION_LIFESTEAL: 80, SOUL_LINK: 80, MINION_ATTACK_SPEED: 4.5,
};

// transcribed from L1080181-1080223
export function applySoftCap(a0, a1) {
  const r0 = a0;
  const r1 = a1;
  if (r0 <= r1.soft) return r0;
  const r4 = r1.hard - r1.soft;
  if (r4 <= 0) return Math.min(r0, r1.hard);
  let r2 = r0 - r1.soft;
  const r8 = SOFT_CAP_CURVE_EXPONENT * r4;
  r2 = r2 + r8;
  r2 = r8 / r2;
  const r5 = Math.pow(r2, SOFT_CAP_CURVE_EXPONENT);
  return r1.soft + r4 * (1 - r5);
}

// transcribed from L1080224-1080296
export function rawFromSoftCapped(a0, a1) {
  const r0 = a0;
  const r3 = a1;
  if (r0 <= r3.soft) return r0;
  let r4 = r3.hard - r3.soft;
  if (r4 <= 0) return Infinity;
  if (r0 >= r3.hard) return Infinity;
  const r2 = SOFT_CAP_CURVE_EXPONENT * r4;
  r4 = (r0 - r3.soft) / r4;
  r4 = 1 - r4;
  let r1 = Math.pow(r4, 0.5);
  r1 = r2 / r1;
  r1 = r3.soft + r1;
  return r1 - r2;
}

// transcribed from L1080297-1080308
export function applyCombatCeiling(a0, a1) {
  let r0 = a0;
  if (r0 > a1) r0 = a1;
  return r0;
}

// transcribed from L1080334-1080366
export function softCapGainFromSheet(a0, a1, a2) {
  const r4 = a0;
  const r8 = a1;
  const r7 = a2;
  if (r8 <= 0) return 0;
  let r1 = rawFromSoftCapped(r4, r7);
  if (!Number.isFinite(r1)) return 0;
  r1 = r1 + r8;
  r1 = applySoftCap(r1, r7);
  r1 = r1 - r4;
  return Math.max(0, r1);
}

// transcribed from L1080367-1080400
export function softCapEfficiency(a0, a1) {
  const r5 = a0;
  const r1 = a1;
  if (r5 <= r1.soft) return 1;
  const r3 = r1.hard - r1.soft;
  if (r3 <= 0) return 0;
  const r2 = SOFT_CAP_CURVE_EXPONENT * r3;
  let x = r5 - r1.soft;
  x = x + r2;
  return Math.pow(r2 / x, 3);
}

// transcribed from L1080412-1080429
export function pvpRatingToPercent(a0) {
  const r2 = a0;
  if (r2 <= 0) return 0;
  return (r2 / (r2 + PVP_RATING_K)) * 100;
}
