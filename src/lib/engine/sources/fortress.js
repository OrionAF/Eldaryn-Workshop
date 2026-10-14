// Clan Fortress combat bonuses (the `a8` source of calculateTotalStats), with the per-class
// BOTTOM remap. See docs/Reference/Game/clan-fortress.md §2. Pure; buff tables come from the L1
// accessor game/fortress.js.
import {
  FORTRESS_BUFFS, FORTRESS_CLASS_REMAP, FORTRESS_STARS, fortressById, remapFortressStat,
} from '../../game/fortress.js';

/** The empty a8 object (L1222819). */
export function emptyFortressBonuses() {
  return {
    attackPercent: 0, hpPercent: 0, attackSpeed: 0, damageReduction: 0, critChance: 0,
    critDamage: 0, hpRegen: 0, lifesteal: 0, blockChance: 0, missChance: 0, blindChance: 0,
    penetration: 0, pvpAttack: 0, pvpDefense: 0,
  };
}

/**
 * port of getFortressBuffCombatForClass L1222835-1222947.
 * For each buff stat the class substitutes (damageReduction / blockChance), a non-zero value is
 * ADDED to the destination stat and the source key is deleted. Returns a copy; classes without a
 * remap (Warrior, unknown) get the input back unchanged.
 * @param {Object<string, number>} combat  FORTRESS_BUFFS[group].combat
 * @param {string} [playerClass]  default 'WARRIOR'
 */
export function getFortressBuffCombatForClass(combat, playerClass = 'WARRIOR') {
  const map = FORTRESS_CLASS_REMAP[playerClass];
  if (!map || Object.keys(map).length === 0) return combat;
  const out = { ...combat };
  for (const src of Object.keys(map)) {
    const v = out[src];
    if (v != null && v !== 0) {
      const dst = remapFortressStat(playerClass, src);
      out[dst] = (out[dst] ?? 0) + v;
      delete out[src];
    }
  }
  return out;
}

/**
 * port of calculateFortressBonuses L1222325-1222567.
 * Each owned group (TOP, BOTTOM, CORE) counts once however many of its fortresses are owned;
 * unknown ids are skipped. The remap runs per group before summing and `healthPercent` lands in
 * `hpPercent`.
 * @param {string[]} ownedFortressIds  e.g. ['TOP_1', 'CORE']
 * @param {string} [playerClass]  default 'WARRIOR'
 * @returns {import('../types.js').FortressBonuses}
 */
export function calculateFortressBonuses(ownedFortressIds, playerClass = 'WARRIOR') {
  const sum = emptyFortressBonuses();
  const seen = new Set();
  for (const id of ownedFortressIds ?? []) {
    const def = fortressById(id);
    if (!def || seen.has(def.group)) continue;
    seen.add(def.group);
    const c = getFortressBuffCombatForClass(FORTRESS_BUFFS[def.group].combat, playerClass);
    sum.attackPercent += c.attackPercent ?? 0;
    sum.hpPercent += c.healthPercent ?? 0;
    sum.attackSpeed += c.attackSpeed ?? 0;
    sum.damageReduction += c.damageReduction ?? 0;
    sum.critChance += c.critChance ?? 0;
    sum.critDamage += c.critDamage ?? 0;
    sum.hpRegen += c.hpRegen ?? 0;
    sum.lifesteal += c.lifesteal ?? 0;
    sum.blockChance += c.blockChance ?? 0;
    sum.missChance += c.missChance ?? 0;
    sum.blindChance += c.blindChance ?? 0;
    sum.penetration += c.penetration ?? 0;
    sum.pvpAttack += c.pvpAttack ?? 0;
    sum.pvpDefense += c.pvpDefense ?? 0;
  }
  return sum;
}

/**
 * port of remapFortressBonusesForClass L1222568-1222660: the same swap applied to an already
 * summed a8 object (Sentinel: DR -> miss, block -> blind; Mystic: DR -> lifesteal, block ->
 * hpRegen; Necromancer: DR -> hpPercent, block -> hpRegen). The source fields are set to 0.
 * Returns the input itself when nothing needs remapping.
 */
export function remapFortressBonusesForClass(bonuses, playerClass) {
  if (playerClass !== 'SENTINEL' && playerClass !== 'MYSTIC' && playerClass !== 'NECROMANCER') return bonuses;
  if (!bonuses.damageReduction && !bonuses.blockChance) return bonuses;
  const out = { ...bonuses };
  if (playerClass === 'NECROMANCER') {
    out.hpPercent = bonuses.hpPercent + bonuses.damageReduction;
    out.hpRegen = bonuses.hpRegen + bonuses.blockChance;
  } else if (playerClass === 'MYSTIC') {
    out.lifesteal = bonuses.lifesteal + bonuses.damageReduction;
    out.hpRegen = bonuses.hpRegen + bonuses.blockChance;
  } else {
    out.missChance = bonuses.missChance + bonuses.damageReduction;
    out.blindChance = bonuses.blindChance + bonuses.blockChance;
  }
  out.damageReduction = 0;
  out.blockChance = 0;
  return out;
}

// port of calculateStarXpBonusPercent L1224454-1224469
export function calculateStarXpBonusPercent(stars) {
  return Math.max(0, Math.floor(stars)) * FORTRESS_STARS.xpPerStar;
}

/**
 * port of calculateFortressNonCombatBonuses L1222661-1222805 (not a stat source; economy bonuses).
 * Star XP counts per owned fortress when `fortressStars` is given; the group bonus once per group.
 * @param {string[]} ownedIds
 * @param {Object<string, number>} [fortressStars]  fortress id -> stars
 */
export function calculateFortressNonCombatBonuses(ownedIds, fortressStars) {
  const out = { xpIncomePercent: 0, bonusCrusadeSeals: 0, bonusRaidKeys: 0 };
  const seen = new Set();
  for (const id of ownedIds ?? []) {
    const def = fortressById(id);
    if (!def) continue;
    if (fortressStars) out.xpIncomePercent += calculateStarXpBonusPercent(fortressStars[id] ?? 0);
    if (seen.has(def.group)) continue;
    seen.add(def.group);
    const n = FORTRESS_BUFFS[def.group].nonCombat;
    out.xpIncomePercent += n.xpIncomePercent ?? 0;
    out.bonusCrusadeSeals += n.bonusCrusadeSeals ?? 0;
    out.bonusRaidKeys += n.bonusRaidKeys ?? 0;
  }
  return out;
}
