// Timed stat buffs applied on top of an entity. The Attack % buff is multiplicative on the entity's
// Attack (floored); every other buff is additive and clamped by the combat ceiling.
import { applyCombatCeiling, ceilingFor } from './caps.js';

/**
 * Buff set (all fields optional, missing = 0; the client reads them unguarded).
 * @typedef {Object} BuffSet
 * @property {number} [attackPercent]  multiplicative: attack = floor(attack * (1 + p/100))
 * @property {number} [attackSpeed]    multiplier delta, ceiling ATTACK_SPEED
 * @property {number} [lifesteal]
 * @property {number} [blockChance]
 * @property {number} [missChance]
 * @property {number} [blindChance]
 * @property {number} [critChance]
 * @property {number} [damageReduction]
 * @property {number} [hpRegen]
 * @property {number} [penetration]    the eight fields above: percent points, each ceilinged
 * @property {number} [critDamage]     percent points, added as /100, no ceiling
 * @property {number} [spellResist]    additive, no ceiling
 * @property {number} [hpPercent]      max-HP buff, applied by getBuffedMaxHp (not by applyBuffsToEntity)
 */

const n = (v) => (v == null ? 0 : v);
// the ceilings are catalogue constants: read once, not per buffed tick
const C_ATTACK_SPEED = ceilingFor('ATTACK_SPEED');
const C_LIFESTEAL = ceilingFor('LIFESTEAL');
const C_BLOCK = ceilingFor('BLOCK_CHANCE');
const C_MISS = ceilingFor('MISS_CHANCE');
const C_BLIND = ceilingFor('BLIND_CHANCE');
const C_CRIT = ceilingFor('CRIT_CHANCE');
const C_DR = ceilingFor('DAMAGE_REDUCTION');
const C_REGEN = ceilingFor('HP_REGEN');
const C_PEN = ceilingFor('PENETRATION');

// port of applyBuffsToEntity L1085543-1085695
/**
 * Returns a copy of `entity` with `buff` applied. Does not touch HP or max HP.
 * @param {import('./entity.js').Entity} entity
 * @param {BuffSet} buff
 * @returns {import('./entity.js').Entity}
 */
export function applyBuffsToEntity(entity, buff) {
  const e = entity;
  const b = buff;
  const out = { ...e };
  out.attack = n(b.attackPercent) > 0 ? Math.floor(e.attack * (1 + b.attackPercent / 100)) : e.attack;
  out.attackSpeed = applyCombatCeiling(e.attackSpeed + n(b.attackSpeed), C_ATTACK_SPEED);
  out.lifesteal = applyCombatCeiling(e.lifesteal + n(b.lifesteal), C_LIFESTEAL);
  out.blockChance = applyCombatCeiling(e.blockChance + n(b.blockChance), C_BLOCK);
  out.missChance = applyCombatCeiling(e.missChance + n(b.missChance), C_MISS);
  out.blindChance = applyCombatCeiling(e.blindChance + n(b.blindChance), C_BLIND);
  out.critChance = applyCombatCeiling(e.critChance + n(b.critChance), C_CRIT);
  out.critDamage = n(b.critDamage) > 0 ? e.critDamage + b.critDamage / 100 : e.critDamage;
  out.damageReduction = applyCombatCeiling(e.damageReduction + n(b.damageReduction), C_DR);
  out.hpRegen = applyCombatCeiling(e.hpRegen + n(b.hpRegen), C_REGEN);
  out.penetration = applyCombatCeiling(e.penetration + n(b.penetration), C_PEN);
  out.spellResist = e.spellResist + n(b.spellResist);
  return out;
}

// port of hasActiveBuffs L1085696-1085766
/** True when any of the 13 buff fields the client checks is above 0 (hpPercent included). */
export function hasActiveBuffs(buff) {
  return (
    n(buff.attackPercent) > 0 || n(buff.attackSpeed) > 0 || n(buff.lifesteal) > 0 ||
    n(buff.blockChance) > 0 || n(buff.missChance) > 0 || n(buff.blindChance) > 0 ||
    n(buff.critChance) > 0 || n(buff.critDamage) > 0 || n(buff.damageReduction) > 0 ||
    n(buff.hpRegen) > 0 || n(buff.hpPercent) > 0 || n(buff.penetration) > 0 || n(buff.spellResist) > 0
  );
}

// port of getBuffedMaxHp L1085767-1085789
/** floor(baseMaxHp * (1 + hpPercent/100)) when hpPercent > 0, else baseMaxHp. */
export function getBuffedMaxHp(baseMaxHp, hpPercent) {
  return hpPercent > 0 ? Math.floor(baseMaxHp * (1 + hpPercent / 100)) : baseMaxHp;
}
