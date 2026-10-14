// JSDoc typedefs: the contract between the parallel engine slices (rebuild-plan §2.3, §3).
// No runtime code. Units follow Game/stats.md §1.3: Attack Speed, Crit Damage and Minion Attack
// Speed are multipliers (1.0 = 100%); every other stat is percent points.

/** @typedef {'WARRIOR'|'SENTINEL'|'MYSTIC'|'NECROMANCER'} PlayerClass */

/**
 * SecondaryStatType enum names (stats.md §1.2, L665656-665713).
 * @typedef {'ATTACK_SPEED'|'DOUBLE_HIT'|'CRIT_CHANCE'|'CRIT_DAMAGE'|'HP_REGEN'|'LIFESTEAL'|'HEALTH_PERCENT'|'ATTACK_PERCENT'|'DAMAGE_REDUCTION'|'BLOCK_CHANCE'|'MISS_CHANCE'|'BLIND_CHANCE'|'PARALYZE_CHANCE'|'PENETRATION'|'PVP_ATTACK'|'PVP_DEFENSE'|'SPELL_DAMAGE'|'SPELL_RESIST'|'SPELL_CRIT_CHANCE'|'SPELL_VAMP'|'DISRUPTION_CHANCE'|'FEAR_CHANCE'|'MINION_ATTACK'|'MINION_HEALTH'|'MINION_CRIT_CHANCE'|'MINION_LIFESTEAL'|'SOUL_LINK'|'MINION_ATTACK_SPEED'|'OBLIVION_POWER'} SecondaryStatType
 */

/**
 * @typedef {Object} SecondaryStat
 * @property {SecondaryStatType} type
 * @property {number} value
 */

/**
 * Equipment item (a1). Gear: 9 base slots (Oblivion: 12).
 * @typedef {Object} Item
 * @property {string} [rarity]
 * @property {number|null} [itemLevel]
 * @property {number|null} [quality]
 * @property {{attack: number, hp: number}} primaryStats
 * @property {SecondaryStat[]} secondaryStats
 * @property {{type: 'FLAME'|'EARTHEN'|'DARK', value: number}|null} [conduit]
 */

/**
 * Enchant stone. `stats[].value` is the rolled value before amplify.
 * @typedef {Object} Stone
 * @property {string} id
 * @property {string} type
 * @property {number|string} quality
 * @property {number} amplifyLevel  0..10
 * @property {number|null} oblivionLevel  1..5, or null
 * @property {SecondaryStat[]} stats
 */

/**
 * a0, the base stats (`player.baseStats`).
 * @typedef {Object} BaseStats
 * @property {number} attack
 * @property {number} hp
 * @property {number} attackSpeed  multiplier
 * @property {number} critChance
 * @property {number} critDamage   multiplier
 */

/**
 * a2 talents and a9 transcendence: the `...Flat` / `...Percent` set (L1216223-1216387).
 * Every `...Flat` holds percent points except attackSpeedFlat / minionAttackSpeedFlat
 * (multiplier delta); critDamageFlat is divided by 100 when added.
 * @typedef {Object} TalentBonuses
 * @property {number} attackPercent
 * @property {number} hpPercent
 * @property {number} attackSpeedFlat
 * @property {number} critChanceFlat
 * @property {number} critDamageFlat
 * @property {number} hpRegenFlat
 * @property {number} lifestealFlat
 * @property {number} damageReductionFlat
 * @property {number} blockChanceFlat
 * @property {number} missChanceFlat
 * @property {number} blindChanceFlat
 * @property {number} paralyzeChanceFlat
 * @property {number} penetrationFlat
 * @property {number} spellDamageFlat
 * @property {number} spellResistFlat
 * @property {number} spellCritChanceFlat
 * @property {number} spellVampFlat
 * @property {number} disruptionChanceFlat
 * @property {number} fearChanceFlat
 * @property {number} soulLinkFlat
 * @property {number} minionAttackPercent
 * @property {number} minionHealthPercent
 * @property {number} minionCritChanceFlat
 * @property {number} minionLifestealFlat
 * @property {number} minionAttackSpeedFlat
 * @property {number} dominionFlat
 */
/** @typedef {TalentBonuses} TranscendenceBonuses  (a9, same field set incl. dominionFlat) */

/**
 * a3 pet bonuses (L1221760). Aggregated additively as stored.
 * @typedef {Object} PetBonuses
 * @property {number} flatAttack
 * @property {number} flatHp
 * @property {number} attackSpeed
 * @property {number} doubleHit
 * @property {number} critChance
 * @property {number} critDamage
 * @property {number} hpRegen
 * @property {number} lifesteal
 * @property {number} healthPercent
 * @property {number} attackPercent
 * @property {number} damageReduction
 * @property {number} blockChance
 * @property {number} missChance
 * @property {number} blindChance
 * @property {number} paralyzeChance
 * @property {number} penetration
 * @property {number} spellDamage
 * @property {number} spellResist
 * @property {number} spellCritChance
 * @property {number} spellVamp
 * @property {number} disruptionChance
 * @property {number} fearChance
 * @property {number} minionAttack
 * @property {number} minionHealth
 * @property {number} minionCritChance
 * @property {number} minionLifesteal
 * @property {number} soulLink
 * @property {number} minionAttackSpeed
 */

/**
 * a5 stone bonuses (L1216578-1216670): the pet set plus PVP ratings and Oblivion Power.
 * @typedef {PetBonuses & {pvpAttack: number, pvpDefense: number, oblivionPower: number}} StoneBonuses
 */

/**
 * a4 sigil bonuses (L1216476-1216501).
 * @typedef {Object} SigilBonuses
 * @property {number} flatAttack
 * @property {number} flatHp
 * @property {number} attackPercent
 * @property {number} hpPercent
 * @property {number} attackSpeed
 * @property {number} missChance
 * @property {number} hpRegen
 * @property {number} spellDamage
 */

/**
 * a6 awakening bonuses (L1216503-1216574): `...Flat` set, no minion or dominion fields.
 * Spell fields are nullable in the client and count as 0.
 * @typedef {Object} AwakeningBonuses
 * @property {number} attackPercent
 * @property {number} hpPercent
 * @property {number} attackSpeedFlat
 * @property {number} critChanceFlat
 * @property {number} critDamageFlat
 * @property {number} hpRegenFlat
 * @property {number} lifestealFlat
 * @property {number} damageReductionFlat
 * @property {number} blockChanceFlat
 * @property {number} missChanceFlat
 * @property {number} blindChanceFlat
 * @property {number} paralyzeChanceFlat
 * @property {number} penetrationFlat
 * @property {number|null} spellDamageFlat
 * @property {number|null} spellResistFlat
 * @property {number|null} spellCritChanceFlat
 * @property {number|null} spellVampFlat
 */

/** @typedef {StoneBonuses} UnusedBonuses  (a7: never populated by the client; pass undefined) */

/**
 * a8 fortress bonuses (L1216756-1216799).
 * @typedef {Object} FortressBonuses
 * @property {number} attackPercent
 * @property {number} hpPercent
 * @property {number} attackSpeed
 * @property {number} damageReduction
 * @property {number} critChance
 * @property {number} critDamage
 * @property {number} hpRegen
 * @property {number} lifesteal
 * @property {number} blockChance
 * @property {number} missChance
 * @property {number} blindChance
 * @property {number} penetration
 * @property {number} pvpAttack
 * @property {number} pvpDefense
 */

/**
 * a10 mount bonuses (L1216801-1216883): no flat Attack/HP, no PVP. Both hpPercent and
 * healthPercent feed the HP% bucket.
 * @typedef {Object} MountBonuses
 * @property {number} attackPercent
 * @property {number} hpPercent
 * @property {number} healthPercent
 * @property {number} attackSpeed
 * @property {number} critChance
 * @property {number} critDamage
 * @property {number} hpRegen
 * @property {number} lifesteal
 * @property {number} damageReduction
 * @property {number} blockChance
 * @property {number} missChance
 * @property {number} blindChance
 * @property {number} paralyzeChance
 * @property {number} penetration
 * @property {number} doubleHit
 * @property {number} spellDamage
 * @property {number} spellResist
 * @property {number} spellCritChance
 * @property {number} spellVamp
 * @property {number} disruptionChance
 * @property {number} fearChance
 * @property {number} minionAttack
 * @property {number} minionHealth
 * @property {number} minionCritChance
 * @property {number} minionLifesteal
 * @property {number} minionAttackSpeed
 * @property {number} soulLink
 */

/**
 * Output of calculateTotalStats (stats.md §3.4); keys are the `computedKey` names in stats.json.
 * Attack/HP are floored; Attack Speed / Crit Damage totals are multipliers to 2 dp.
 * `raw*` is present only when the raw value exceeds the soft cap.
 * @typedef {Object} ComputedStats
 * @property {number} totalAttack
 * @property {number} totalHp
 * @property {number} totalAttackSpeed
 * @property {number} totalDoubleHit
 * @property {number} totalCritChance
 * @property {number} totalCritDamage
 * @property {number} totalHpRegen
 * @property {number} totalLifesteal
 * @property {number} totalHealthPercent
 * @property {number} totalAttackPercent
 * @property {number} totalDamageReduction
 * @property {number} totalBlockChance
 * @property {number} totalMissChance
 * @property {number} totalBlindChance
 * @property {number} totalParalyzeChance
 * @property {number} totalPenetration
 * @property {number} totalPvpAttack
 * @property {number} totalPvpDefense
 * @property {number} totalSpellDamage
 * @property {number} totalSpellResist
 * @property {number} totalSpellCritChance
 * @property {number} totalSpellVamp
 * @property {number} totalDisruptionChance
 * @property {string} [disruptionEffect]
 * @property {number} totalMinionAttack
 * @property {number} totalMinionHealth
 * @property {number} totalMinionCritChance
 * @property {number} totalMinionLifesteal
 * @property {number} totalSoulLink
 * @property {number} totalMinionAttackSpeed
 * @property {number} totalDominion
 * @property {number} totalOblivionPower
 * @property {number} totalFlameConduit
 * @property {number} totalEarthenConduit
 * @property {number} totalDarkConduit
 * @property {number} [rawAttackSpeed]
 * @property {number} [rawDoubleHit]
 * @property {number} [rawCritChance]
 * @property {number} [rawCritDamage]
 * @property {number} [rawHpRegen]
 * @property {number} [rawLifesteal]
 * @property {number} [rawDamageReduction]
 * @property {number} [rawBlockChance]
 * @property {number} [rawMissChance]
 * @property {number} [rawBlindChance]
 * @property {number} [rawParalyzeChance]
 * @property {number} [rawPenetration]
 * @property {number} [rawSpellResist]
 * @property {number} [rawSpellCritChance]
 * @property {number} [rawSpellVamp]
 * @property {number} [rawDisruptionChance]
 * @property {number} [rawMinionCritChance]
 * @property {number} [rawMinionLifesteal]
 * @property {number} [rawSoulLink]
 */

/**
 * Engine combatant, built by build/fighter.js (rebuild-plan §2.2).
 * @typedef {Object} Fighter
 * @property {ComputedStats} stats  effective sheet (user sheet, else computed + residual)
 * @property {PlayerClass} class
 * @property {string|null} spec  SpecKey, e.g. 'WARRIOR_TANK'
 * @property {Array<{species: string, level: number}>} sigils  equipped, with level
 * @property {{species: string, level: number}|null} [utility]
 * @property {{species: string, level: number}|null} [ancient]
 * @property {Object<string, string>} [conditions]  species -> conditionId
 * @property {Array<{glyphType: string, rarity: string}>} [glyphMods]  major glyphs on the ridden mount
 * @property {number} [altarTier]
 * @property {number} [level]
 */

/**
 * PVE mob/boss description fed to simulatePve.
 * @typedef {Object} MobSpec
 * @property {string} [id]
 * @property {number} hp
 * @property {number} attack
 * @property {number} attackSpeed  multiplier
 * @property {number} [critChance]
 * @property {number} [critDamage]
 * @property {number} [damageReduction]
 * @property {Object<string, number>} [stats]  any further ComputedStats-style fields
 */

/**
 * @typedef {Object} PveResult
 * @property {boolean} won  player killed the enemy
 * @property {number} timeMs  fight length
 * @property {number} damageDealt
 * @property {number} damageTaken
 * @property {number} hpLeft  player HP at the end
 * @property {number} enemyHpLeft
 * @property {Array<Object>} [log]  event log, only when options.log is true
 */

/**
 * @typedef {Object} DuelResult
 * @property {'attacker'|'defender'|'draw'} winner
 * @property {number} timeMs
 * @property {number} attackerHpLeft
 * @property {number} defenderHpLeft
 * @property {Array<Object>} [log]  event log, only when options.log is true
 */

export {};
