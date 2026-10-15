// Test-only hand transcriptions of the 2.7.0 client's hard classic dungeons (hardVariant) and the
// Oblivion Dungeon floor and instability rules (modules 5850-5851). Statement and floating-point
// order follow the decompiled bytecode; constants are the client's literals. Never imported by app code.

// transcribed from L1062805-1062837 (dungeon module closure slots 1-5)
export const HARD_CONFIGS = [
  { hpScale: 216000, atkScale: 63000, blockChance: 20, penetration: 50, damageReduction: 0 },
  { hpScale: 46500, atkScale: 17800, blockChance: 21, penetration: 52, damageReduction: 0 },
  { hpScale: 16100, atkScale: 4670, blockChance: 22, penetration: 54, damageReduction: 30 },
  { hpScale: 3690, atkScale: 1320, blockChance: 23, penetration: 56, damageReduction: 30 },
  { hpScale: 707, atkScale: 325, blockChance: 24, penetration: 58, damageReduction: 30 },
  { hpScale: 275, atkScale: 625, blockChance: 25, penetration: 60, damageReduction: 30 },
  { hpScale: 308, atkScale: 604, blockChance: 26, penetration: 62, damageReduction: 30 },
];
export const HARD_STEP_MULTIPLIERS = [1, 1.09, 1.19, 1.3, 1.42, 1.55, 1.69, 2.05];
const BOSS_ATK_CAP_MULT = 1.05; // slot3
const SPEED_MULT = 1.25; // slot4
const SHARE = [ // slot5
  { hp: 0.5, atk: 0.85 }, { hp: 0.5, atk: 0.85 }, { hp: 0.5, atk: 0.55 }, { hp: 1, atk: 0.55 }, { hp: 1, atk: 0.65 },
];

// transcribed from L1062174-1062198
export function hardCoinRewards(a0) {
  return Array.from({ length: 8 }, (_, i) => 3010 + (a0 * 8 + i) * 10);
}

// transcribed from L1062199-1062371
export function hardVariant(a0, a1, a2) {
  const r2 = a0;
  const cfg = a1; // _closure2_slot0
  const last = r2.length - 1; // _closure2_slot1
  const prev = r2.slice(Math.max(0, last - 2), last).map((r) => r.baseAtk);
  const cap = !(prev.length > 0) ? Infinity : Math.max(...prev) * BOSS_ATK_CAP_MULT; // _closure2_slot2
  const s = SHARE[a2];
  let hpShare = s == null ? undefined : s.hp;
  if (hpShare == null) hpShare = 1; // _closure2_slot3
  let atkShare = s == null ? undefined : s.atk;
  if (atkShare == null) atkShare = 1; // _closure2_slot4
  const drMult = 1 - cfg.damageReduction / 100; // _closure2_slot5
  return r2.map((r5, r3) => {
    const r7 = r3 !== last ? r5.baseAtk : Math.min(r5.baseAtk, cap);
    const r0 = { ...r5 };
    r0.id = ''.concat(r5.id, '_hard');
    r0.baseHp = Math.round(r5.baseHp * cfg.hpScale * hpShare * drMult);
    r0.baseAtk = Math.round(r7 * cfg.atkScale * atkShare / SPEED_MULT);
    r0.baseSpd = parseFloat((r5.baseSpd * SPEED_MULT).toFixed(3));
    r0.blockChance = cfg.blockChance;
    r0.penetration = r3 !== last ? cfg.penetration : cfg.penetration + 4;
    r0.damageReduction = cfg.damageReduction;
    return r0;
  });
}

// transcribed from L1706694 (OBLIVION_DUNGEON, the fields these functions read)
export const OBLIVION_DUNGEON = {
  INSTABILITY_FREE_FLOORS: 3, INSTABILITY_BASE: 34, INSTABILITY_PER_FLOOR: 21, INSTABILITY_ACCEL_PER_FLOOR: 0.5,
  MOB_BASE_HP: 20000000, MOB_BASE_ATTACK: 34000, MOB_HP_GROWTH_PER_FLOOR: 1.13, MOB_ATTACK_GROWTH_PER_FLOOR: 1.06,
  MOB_ATTACK_SPEED: 1, MOB_ATTACK_HP_PCT: 4, MOB_ATTACK_HP_CAP_MULT: 4, MOB_BLOCK_CHANCE: 20, MOB_PENETRATION: 12,
  INSTABILITY_PULSE_MS: 500, INSTABILITY_TRUE_DAMAGE_PCT_PER_POINT: 0.06, INSTABILITY_MAX_TRUE_DAMAGE_PCT_PER_PULSE: 12,
  INSTABILITY_RAMP_PER_SECOND: 0.04, INSTABILITY_RAMP_MAX_MULT: 2.5, INSTABILITY_BITE_MAX_PCT: 100,
  INSTABILITY_BITE_HALF_POINT: 12, INSTABILITY_BITE_HEALING: 0.98, INSTABILITY_BITE_REGEN: 0.99,
  INSTABILITY_BITE_REGEN_HALF_POINT: 6, INSTABILITY_OUTPUT_CUT_MAX_PCT: 97, INSTABILITY_OUTPUT_CUT_HALF_POINT: 6,
  SUSTAIN_CAP_PCT_PER_SEC: 1.5, RIFT_DR_FLOOR: 35, RIFT_BLOCK_CAP: 15, RIFT_MISS_CAP: 10, RIFT_BLIND_CAP: 8,
  INSTABILITY_MOB_ATTACK_PER_POINT: 0,
};
const D = OBLIVION_DUNGEON;

// transcribed from L1705996-1706008
export function normalizeFloor(a0) {
  return Math.max(1, Math.floor(a0));
}

// transcribed from L1706366-1706406
export function getFloorInstability(a0) {
  const r2 = normalizeFloor(a0);
  const r3 = r2 - D.INSTABILITY_FREE_FLOORS;
  if (r3 <= 0) return 0;
  const r4 = D.INSTABILITY_PER_FLOOR * (r3 - 1);
  let r5 = D.INSTABILITY_ACCEL_PER_FLOOR * (r3 - 1);
  r5 = r5 * r3;
  return Math.round(D.INSTABILITY_BASE + r4 + r5 / 2);
}

// transcribed from L1706630-1706688 (the roster id, name and sprite are left out)
export function getFloorMobStats(a0) {
  const r8 = normalizeFloor(a0) - 1;
  return {
    hp: Math.round(D.MOB_BASE_HP * Math.pow(D.MOB_HP_GROWTH_PER_FLOOR, r8)),
    attack: Math.round(D.MOB_BASE_ATTACK * Math.pow(D.MOB_ATTACK_GROWTH_PER_FLOOR, r8)),
    attackSpeed: D.MOB_ATTACK_SPEED,
    blockChance: D.MOB_BLOCK_CHANCE,
    penetration: D.MOB_PENETRATION,
  };
}

// transcribed from L1706767-1706784
export function getEffectiveInstability(a0, a1) {
  return Math.max(0, Math.round(a0) - Math.round(a1));
}

// transcribed from L1706883-1706896
export function getFloorEffectiveInstability(a0, a1) {
  return getEffectiveInstability(getFloorInstability(a0), a1);
}

// transcribed from L1706796-1706828
export function biteCurve(a0, a1, ...rest) {
  const r1 = rest.length > 0 && rest[0] !== undefined ? rest[0] : D.INSTABILITY_BITE_MAX_PCT;
  if (a0 <= 0) return 0;
  return r1 * a0 / (a0 + a1);
}

// transcribed from L1706829-1706847
export function biteMult(a0, a1) {
  return Math.max(0, Math.min(1, 1 - a0 * a1 / 100));
}

// transcribed from L1706785-1706795
export function getInstabilityBitePercent(a0) {
  return biteCurve(a0, D.INSTABILITY_BITE_HALF_POINT);
}

// transcribed from L1706848-1706882
export function getInstabilityOutputMult(a0) {
  const r4 = biteCurve(Math.max(0, a0), D.INSTABILITY_OUTPUT_CUT_HALF_POINT, D.INSTABILITY_OUTPUT_CUT_MAX_PCT);
  return Math.max(0, 1 - r4 / 100);
}

// transcribed from L1706897-1707000
export function getInstabilityCombatState(a0, a1) {
  const r5 = Math.max(0, a0);
  const r7 = getInstabilityBitePercent(r5);
  const r10 = D.INSTABILITY_TRUE_DAMAGE_PCT_PER_POINT * r5;
  const r3 = Math.round(a1) > 0;
  return {
    pulseMs: D.INSTABILITY_PULSE_MS,
    trueDamagePercentPerPulse: Math.min(D.INSTABILITY_MAX_TRUE_DAMAGE_PCT_PER_PULSE, r10),
    rampPerSecond: D.INSTABILITY_RAMP_PER_SECOND,
    rampMaxMult: D.INSTABILITY_RAMP_MAX_MULT,
    healingMult: biteMult(r7, D.INSTABILITY_BITE_HEALING),
    regenMult: biteMult(biteCurve(r5, D.INSTABILITY_BITE_REGEN_HALF_POINT), D.INSTABILITY_BITE_REGEN),
    playerDamageMult: getInstabilityOutputMult(r5),
    healCapPctPerSec: r3 ? D.SUSTAIN_CAP_PCT_PER_SEC : 0,
    blocksShieldOverflow: r3,
    defenceBand: r3 ? { drFloor: D.RIFT_DR_FLOOR, blockCap: D.RIFT_BLOCK_CAP, missCap: D.RIFT_MISS_CAP, blindCap: D.RIFT_BLIND_CAP } : null,
    mobAttackMult: 1 + r5 * D.INSTABILITY_MOB_ATTACK_PER_POINT,
    mobAttackHpPercent: r3 ? D.MOB_ATTACK_HP_PCT : 0,
    mobAttackHpCapMult: D.MOB_ATTACK_HP_CAP_MULT,
  };
}
