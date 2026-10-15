// Test-only hand transcription of the 2.7.0 client's minion module (module 3968, L1094190-1095536).
// Statement and floating-point order follow the decompiled bytecode; `Math.random()` is the injected
// `rng()`. Mutates the minion in place, as the client does. Never imported by app code.
import { softCapGainFromSheet, applyCombatCeiling, SOFT_CAPS, COMBAT_CEILINGS } from './caps.client.js';

// transcribed from L1095530 (closure slot1)
export const OPENING_FIRST_SWING_MIN_MS = 400;

// transcribed from L1094193-1094220
export function minionAttackSpeed(a0, a1) {
  const r4 = a0;
  const r5 = a1;
  if (!(r5 > 0)) return r4;
  const r1 = softCapGainFromSheet(r4, r5, SOFT_CAPS.MINION_ATTACK_SPEED);
  return applyCombatCeiling(r4 + r1, COMBAT_CEILINGS.MINION_ATTACK_SPEED);
}

// transcribed from L1094221-1094233
export function summonMinion(a0) {
  a0.hp = a0.maxHp;
  a0.timer = 0;
  a0.alive = true;
  a0.respawnMs = 0;
}

const nz = (v) => (v == null ? 0 : v);

// transcribed from L1094234-1094279
export function minionSwingIntervalMs(a0) {
  const r1 = a0;
  const r2 = r1.frenzy;
  let r6 = r2 == null ? undefined : r2.attackSpeedPercent;
  if (r6 == null) r6 = 0;
  let r3;
  if (!(r6 > 0)) r3 = r1.attackSpeed;
  else r3 = applyCombatCeiling(r1.attackSpeed * (1 + r6 / 100), COMBAT_CEILINGS.MINION_ATTACK_SPEED);
  return Math.round(1000 / r3);
}

// transcribed from L1094280-1094316
export function minionCurrentAttack(a0) {
  const r1 = a0;
  const r2 = r1.frenzy;
  let r5 = r2 == null ? undefined : r2.attackPercent;
  if (r5 == null) r5 = 0;
  if (!(r5 > 0)) return r1.attack;
  return Math.floor(r1.attack * (1 + r5 / 100));
}

// transcribed from L1094317-1094351
export function minionCurrentLifesteal(a0) {
  const r0 = a0;
  const r2 = r0.frenzy;
  let r5 = r2 == null ? undefined : r2.lifesteal;
  if (r5 == null) r5 = 0;
  if (r5 <= 0) return r0.lifesteal;
  return applyCombatCeiling(r0.lifesteal + r5, COMBAT_CEILINGS.MINION_LIFESTEAL);
}

// transcribed from L1094352-1094380
export function currentSoulLink(a0) {
  const r0 = a0;
  const r3 = nz(r0.soulLinkBonus);
  if (r3 <= 0) return r0.soulLink;
  return applyCombatCeiling(r0.soulLink + r3, COMBAT_CEILINGS.SOUL_LINK);
}

// transcribed from L1094381-1094429
export function endMinionEmpower(a0) {
  const r1 = a0;
  const r2 = r1 == null ? undefined : r1.empowerSpell;
  if (r2) delete r1.empowerSpell;
  let r3 = r1 == null ? undefined : r1.empowerBonusHp;
  if (r3 == null) r3 = 0;
  if (!r1) return false;
  if (r3 <= 0) return false;
  r1.maxHp = r1.maxHp - r3;
  r1.empowerBonusHp = 0;
  if (r1.hp > r1.maxHp) r1.hp = r1.maxHp;
  return true;
}

// transcribed from L1094430-1094461
export function endMinionFrenzy(a0) {
  const r0 = a0;
  const r3 = r0 == null ? undefined : r0.frenzySpell;
  if (r3) delete r0.frenzySpell;
  const r1 = r0 == null ? undefined : r0.frenzy;
  if (!r1) return false;
  delete r0.frenzy;
  return true;
}

// transcribed from L1094462-1094499
export function healMinion(a0, a1) {
  const r1 = a0;
  const r7 = a1;
  if (r7 <= 0) return 0;
  if (r1.hp >= r1.maxHp) return 0;
  const before = r1.hp;
  r1.hp = Math.min(r1.maxHp, r1.hp + r7);
  return r1.hp - before;
}

// transcribed from L1094500-1094612
export function createMinion(a0, a1, a2) {
  const r1 = a0;
  const r5 = a1;
  const r4 = a2;
  if (!r1) return null;
  const r6 = nz(r4.totalMinionAttack) / 100;
  const r0 = nz(r4.totalMinionHealth) / 100;
  const maxHp = Math.max(1, Math.floor(r5.maxHp * r1.hpPercent / 100 * (1 + r0)));
  return {
    species: r1.species,
    name: r1.name,
    icon: r1.icon,
    kind: r1.minion,
    attack: Math.max(1, Math.floor(r5.attack * r1.attackPercent / 100 * (1 + r6))),
    maxHp,
    hp: 0,
    attackSpeed: minionAttackSpeed(r5.attackSpeed, nz(r4.totalMinionAttackSpeed)),
    critChance: nz(r4.totalMinionCritChance),
    critDamage: r5.critDamage,
    lifesteal: nz(r4.totalMinionLifesteal),
    soulLink: nz(r4.totalSoulLink),
    timer: 0,
    alive: false,
    respawnCooldownMs: nz(r1.respawnCooldownMs),
    respawnMs: 0,
    summonCastMs: nz(r1.summonCastMs),
  };
}

// transcribed from L1094757-1094789
export function openingSwingTimerStart(a0, a1, a2) {
  const r0 = a2 !== undefined ? a2 : 0;
  if (a1 <= 0) return r0;
  return Math.min(r0, a0 - OPENING_FIRST_SWING_MIN_MS);
}

// transcribed from L1094826-1094856
export function minionMsUntilSwing(a0) {
  const r0 = a0;
  if (!r0.alive) return Infinity;
  if (r0.attackSpeed <= 0) return Infinity;
  return Math.max(0, minionSwingIntervalMs(r0) - r0.timer);
}

// transcribed from L1094857-1094918
export function minionSwing(a0, a1, rng) {
  const r3 = a0;
  if (!r3.alive) return null;
  if (r3.attackSpeed <= 0) return null;
  r3.timer = r3.timer + a1;
  const r5 = minionSwingIntervalMs(r3);
  if (r3.timer < r5) return null;
  r3.timer = r3.timer - r5;
  let r1 = r3.critChance > 0;
  if (r1) r1 = rng() * 100 < r3.critChance;
  const r6 = minionCurrentAttack(r3);
  return { damage: r1 ? Math.round(r6 * r3.critDamage) : r6, isCrit: r1 };
}

// transcribed from L1094919-1094946
export function mitigateMinionHit(a0, a1) {
  const r0 = a0;
  const r2 = a1;
  if (r2 <= 0) return r0;
  if (r0 <= 0) return r0;
  return Math.max(1, Math.round(r0 * (1 - r2 / 100)));
}

// transcribed from L1094947-1094978
export function healMinionLifesteal(a0, a1) {
  const r3 = a0;
  const r6 = a1;
  const r0 = minionCurrentLifesteal(r3);
  if (!r3.alive) return 0;
  if (r0 <= 0) return 0;
  if (r6 <= 0) return 0;
  return healMinion(r3, Math.floor(r6 * r0 / 100));
}

// transcribed from L1094979-1095015
export function soulLinkHeal(a0, a1) {
  const r4 = a0;
  const r7 = a1;
  if (!r4) return 0;
  if (!r4.alive) return 0;
  if (r7 <= 0) return 0;
  const r1 = currentSoulLink(r4);
  if (r1 <= 0) return 0;
  return healMinion(r4, Math.floor(r7 * r1 / 100));
}

// transcribed from L1095425-1095473
export function damageMinion(a0, a1) {
  const r2 = a0;
  const r5 = a1;
  if (!r2.alive) return { dealt: 0, died: false };
  if (r5 <= 0) return { dealt: 0, died: false };
  const r1 = Math.min(r2.hp, r5);
  r2.hp = r2.hp - r1;
  if (!(r2.hp <= 0)) return { dealt: r1, died: false };
  endMinionEmpower(r2);
  endMinionFrenzy(r2);
  r2.hp = 0;
  r2.alive = false;
  r2.respawnMs = r2.respawnCooldownMs;
  return { dealt: r1, died: true };
}

// transcribed from L1095503-1095521
export function minionDeathMeta(a0) {
  if (!(a0.respawnMs > 0)) return {};
  return { minionRespawnMs: a0.respawnMs };
}
