// L1 catalogue: Pet Cores (Pets V2, client 2.9.1). Lookups only; the stat maths is engine/sources/petCore.js.
// Sources: Game/pet-cores.md; data/pet-cores.json.
import coresJson from '../../data/game/pet-cores.json';
import { SECONDARY_STAT_POOL, secondaryPoolFor, secondaryStatCeiling } from './gear.js';

/** Upper-case rarity enums, Common..Oblivion. */
export const CORE_RARITIES = coresJson.rarities;
export const CORE_BASE_STATS = coresJson.baseStats;
export const CORE_BASE_STAT_SPREAD = coresJson.baseStatSpread;
export const CORE_SECONDARY_COUNT = coresJson.secondaryCount;
export const CORE_SECONDARY_ITEM_LEVEL = coresJson.secondaryItemLevel;
export const CORE_STAT_GROWTH = coresJson.statGrowthPerLevel;
export const CORE_SECONDARY_GROWTH = coresJson.secondaryGrowthPerLevel;
export const CORE_MAX_ALTAR_LEVEL = coresJson.maxAltarLevel;
export const CORE_TIER_STAT_MULT = coresJson.tierStatMult;
export const CORE_ALTAR_TIER_XP_MULT = coresJson.altarTierXpMult;
export const CORE_SACRIFICE_XP = coresJson.sacrificeXp;
export const CORE_RARITY_UNLOCK_TIER = coresJson.rarityUnlockTier;
export const CORE_MAX_OWNED = coresJson.maxOwned;
export const CORE_POWER = coresJson.power;

export const isCoreRarity = (r) => CORE_RARITIES.includes(r);

/** Secondary slots a core of `rarity` carries (0 for an unknown rarity). */
export const coreSecondaryCount = (rarity) => CORE_SECONDARY_COUNT[rarity] ?? 0;

/** The rolled base band of a rarity, pet-cores.md §5: base x (1 +- spread), rounded as rollBaseStat does. */
export function coreBaseBand(rarity) {
  const b = CORE_BASE_STATS[rarity];
  if (!b) return null;
  const at = (v, k) => Math.round(v * (1 + k * CORE_BASE_STAT_SPREAD));
  return {
    attack: { min: at(b.attack, -1), mid: b.attack, max: at(b.attack, 1) },
    hp: { min: at(b.hp, -1), mid: b.hp, max: at(b.hp, 1) },
  };
}

const poolByType = new Map(SECONDARY_STAT_POOL.map((d) => [d.type, d]));

/**
 * Roll range of a core secondary in the client's own units, pet-cores.md §5: the gear roll at item
 * level 50, so `min .. secondaryStatMaxValue(def, 50)`, the top rounded with toFixed as the roll is.
 * Null for a type outside the pool.
 */
export function coreSecondaryRange(type) {
  const def = poolByType.get(type);
  if (!def) return null;
  const max = parseFloat(secondaryStatCeiling(def, CORE_SECONDARY_ITEM_LEVEL).toFixed(def.decimals));
  return { min: def.minValue, max, decimals: def.decimals };
}

/** Secondary types a core can roll for a class (filterStatDefsForClass over the gear pool). */
export const coreSecondaryTypesFor = (cls) => secondaryPoolFor(cls).map((d) => d.type);

// Tier and altar-XP maths shared by the engine and the model's profile import. It sits here because
// L2 and L3 cannot import each other (same reason as gear.js secondaryStatCeiling).

// port of normalizeCoreTier L1064740: no upper clamp
export const normalizeCoreTier = (t) => (Number.isFinite(t) ? Math.max(1, Math.floor(t)) : 1);

// port of tierTableValue L1064710
export function tierTableValue(table, growth, tier) {
  const t = normalizeCoreTier(tier);
  return t <= table.length ? table[t - 1] : table[table.length - 1] * growth ** (t - table.length);
}

// port of coreAltarTierXpMultiplier L1064988 (current XP table version only)
export const coreAltarTierXpMultiplier = (tier) => tierTableValue(CORE_ALTAR_TIER_XP_MULT.table, CORE_ALTAR_TIER_XP_MULT.growth, tier);

// V1 altarXpRequired(level, tier 1) L1063380, which the core altar scales
function v1TierOneNeed(level) {
  let base = 95 * level + 80;
  if (level >= 45) base *= 1 + (level - 44) * 0.15;
  return Math.floor(base);
}

// port of coreAltarXpRequired L1078716: XP to go from `level` to level + 1
export function coreAltarXpRequired(level, tier) {
  if (level >= CORE_MAX_ALTAR_LEVEL) return Infinity;
  return Math.round(v1TierOneNeed(level) * coreAltarTierXpMultiplier(tier));
}

/**
 * port of getCoreAltarProgress L1078805: level 1..50 from cumulative altar XP at a tier.
 * @returns {{level:number, xp:number, need:number}}
 */
export function coreAltarProgress(totalXp, tier) {
  let xp = Number.isFinite(totalXp) ? Math.max(0, Math.floor(totalXp)) : 0;
  let level = 1;
  while (level < CORE_MAX_ALTAR_LEVEL) {
    const need = coreAltarXpRequired(level, tier);
    if (xp < need) break;
    xp -= need;
    level += 1;
  }
  if (level >= CORE_MAX_ALTAR_LEVEL) xp = 0;
  return { level, xp, need: coreAltarXpRequired(level, tier) };
}
