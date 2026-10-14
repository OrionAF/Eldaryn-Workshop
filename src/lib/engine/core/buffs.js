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
const capped = (value, id) => applyCombatCeiling(value, ceilingFor(id));

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
  out.attackSpeed = capped(e.attackSpeed + n(b.attackSpeed), 'ATTACK_SPEED');
  out.lifesteal = capped(e.lifesteal + n(b.lifesteal), 'LIFESTEAL');
  out.blockChance = capped(e.blockChance + n(b.blockChance), 'BLOCK_CHANCE');
  out.missChance = capped(e.missChance + n(b.missChance), 'MISS_CHANCE');
  out.blindChance = capped(e.blindChance + n(b.blindChance), 'BLIND_CHANCE');
  out.critChance = capped(e.critChance + n(b.critChance), 'CRIT_CHANCE');
  out.critDamage = n(b.critDamage) > 0 ? e.critDamage + b.critDamage / 100 : e.critDamage;
  out.damageReduction = capped(e.damageReduction + n(b.damageReduction), 'DAMAGE_REDUCTION');
  out.hpRegen = capped(e.hpRegen + n(b.hpRegen), 'HP_REGEN');
  out.penetration = capped(e.penetration + n(b.penetration), 'PENETRATION');
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
