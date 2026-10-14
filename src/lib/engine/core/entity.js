// Combat entities: the mutable per-fight state of one combatant (player or mob).
// Field names are the client's (stats.md §1.3 units: attackSpeed and critDamage are multipliers,
// every chance/percent field is percent points). Pure; no rng.

/**
 * @typedef {Object} Entity
 * @property {number} maxHp        current max HP (buffs may raise it via getBuffedMaxHp)
 * @property {number} rawMaxHp     unbuffed max HP (player: pvpBaseHp when given, else totalHp)
 * @property {number} hp
 * @property {number} attack
 * @property {number} attackSpeed  multiplier
 * @property {number} doubleHit    percent
 * @property {number} critChance   percent
 * @property {number} critDamage   multiplier (mob: 1)
 * @property {number} lifesteal
 * @property {number} hpRegen
 * @property {number} damageReduction
 * @property {number} blockChance
 * @property {number} missChance
 * @property {number} blindChance
 * @property {number} paralyzeChance
 * @property {number} penetration
 * @property {number} disruptionChance
 * @property {string} disruptionEffect  'SILENCE' | 'STAGGER' | 'FEAR' (default 'SILENCE')
 * @property {number} pvpAttack
 * @property {number} pvpDefense
 * @property {number} spellDamage
 * @property {number} spellResist
 * @property {number} spellCritChance
 * @property {number} spellVamp
 * @property {number} shieldHp
 * @property {number} shieldMax
 */

const orZero = (v) => (v == null ? 0 : v);

// port of createPlayerEntity L1087500-1087588
/**
 * Entity from a ComputedStats-shaped sheet (`total*` keys). Optional `pvpBaseHp` (pre-x8 HP) feeds
 * `rawMaxHp`; `disruptionEffect` defaults to 'SILENCE'; the four spell fields and
 * `disruptionChance` default to 0. Everything else is copied as given (no defaults, as in the client).
 * @param {Object} stats
 * @returns {Entity}
 */
export function createPlayerEntity(stats) {
  const s = stats;
  return {
    maxHp: s.totalHp,
    rawMaxHp: s.pvpBaseHp == null ? s.totalHp : s.pvpBaseHp,
    hp: s.totalHp,
    attack: s.totalAttack,
    attackSpeed: s.totalAttackSpeed,
    doubleHit: s.totalDoubleHit,
    critChance: s.totalCritChance,
    critDamage: s.totalCritDamage,
    lifesteal: s.totalLifesteal,
    hpRegen: s.totalHpRegen,
    damageReduction: s.totalDamageReduction,
    blockChance: s.totalBlockChance,
    missChance: s.totalMissChance,
    blindChance: s.totalBlindChance,
    paralyzeChance: s.totalParalyzeChance,
    penetration: s.totalPenetration,
    disruptionChance: orZero(s.totalDisruptionChance),
    disruptionEffect: s.disruptionEffect == null ? 'SILENCE' : s.disruptionEffect,
    pvpAttack: s.totalPvpAttack,
    pvpDefense: s.totalPvpDefense,
    spellDamage: orZero(s.totalSpellDamage),
    spellResist: orZero(s.totalSpellResist),
    spellCritChance: orZero(s.totalSpellCritChance),
    spellVamp: orZero(s.totalSpellVamp),
    shieldHp: 0,
    shieldMax: 0,
  };
}

// port of createMobEntity L1087589-1087646
/**
 * Entity from a MobSpec ({hp, attack, attackSpeed, damageReduction?, blockChance?, penetration?}).
 * A mob has crit multiplier 1 and no crit, double hit, lifesteal, regen, avoid, spell or PVP stats.
 * @param {Object} mob
 * @returns {Entity}
 */
export function createMobEntity(mob) {
  return {
    maxHp: mob.hp,
    rawMaxHp: mob.hp,
    hp: mob.hp,
    attack: mob.attack,
    attackSpeed: mob.attackSpeed,
    doubleHit: 0,
    critChance: 0,
    critDamage: 1,
    lifesteal: 0,
    hpRegen: 0,
    damageReduction: orZero(mob.damageReduction),
    blockChance: orZero(mob.blockChance),
    missChance: 0,
    blindChance: 0,
    paralyzeChance: 0,
    penetration: orZero(mob.penetration),
    disruptionChance: 0,
    disruptionEffect: 'SILENCE',
    pvpAttack: 0,
    pvpDefense: 0,
    spellDamage: 0,
    spellResist: 0,
    spellCritChance: 0,
    spellVamp: 0,
    shieldHp: 0,
    shieldMax: 0,
  };
}
