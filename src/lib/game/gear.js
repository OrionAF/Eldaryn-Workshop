// L1 catalogue: gear rarities, slots per realm, secondary pool per class, conduit config.
// Lookups only, no game logic. Sources: Game/gear.md §1, §2, §4, §7; data/gear.json.
import gearData from '../../data/game/gear.json';
import { available } from './classes.js';

export const REALMS = ['base', 'oblivion'];

// gear.md §2 (RARITY_ORDER, lowest first)
export const RARITIES = gearData.rarities;
export const RARITY_IDS = RARITIES.map((r) => r.id);

export function rarityById(id) {
  return RARITIES.find((r) => r.id === id) ?? null;
}
// -1 for an unknown rarity
export function rarityIndex(id) {
  return RARITY_IDS.indexOf(id);
}
export function isRarityAtLeast(a, b) {
  const ia = rarityIndex(a);
  const ib = rarityIndex(b);
  return ia >= 0 && ib >= 0 && ia >= ib;
}
export function secondaryStatCount(id) {
  return rarityById(id)?.secondaryStatCount ?? 0;
}

// gear.md §1. Base slots are the 9 normal-realm slots; Oblivion adds BELT, GLOVES, RIFT_CORE.
export const SLOT_ORDER = gearData.slotOrder;
export const BASE_SLOTS = gearData.equipmentSlots.base;
export const OBLIVION_ONLY_SLOTS = gearData.equipmentSlots.oblivionOnly;
export const SLOTS_BY_REALM = {
  base: BASE_SLOTS,
  oblivion: [...BASE_SLOTS, ...OBLIVION_ONLY_SLOTS],
};
export function slotsForRealm(realm) {
  return SLOTS_BY_REALM[realm] ?? SLOTS_BY_REALM.base;
}
export const SLOT_DISPLAY_NAMES = gearData.slotDisplayNames;
export function slotDisplayName(slot) {
  return SLOT_DISPLAY_NAMES[slot] ?? slot;
}

// gear.md §1: WEAPON and OFFHAND are named per class
export const WEAPON_OFFHAND_NAMES = gearData.weaponOffhandNames;
export function weaponOffhandName(cls, slot) {
  return (WEAPON_OFFHAND_NAMES[cls] ?? WEAPON_OFFHAND_NAMES.default)[slot] ?? null;
}

// gear.md §4. Primary-stat weights by class and slot (exported client table; unused by client math).
export const SLOT_WEIGHTS_BY_CLASS = gearData.slotWeightsByClass;
export function slotWeights(cls, slot) {
  return SLOT_WEIGHTS_BY_CLASS[cls]?.[slot] ?? null;
}

// gear.md §4. Full secondary pool, then filtered per class through classes.js gating.
export const SECONDARY_STAT_POOL = gearData.secondaryStatPool;
export function secondaryPoolFor(cls) {
  return SECONDARY_STAT_POOL.filter((s) => available(s.type, cls));
}

// gear.md §7. Conduit value config (formula lives in the engine).
export const CONDUIT = gearData.conduit;

// gear.md §6, §8, §11 (ascension rate, dual equip, total power weights)
export const ASCENSION_ABOVE_HUNDRED_STAT_RATE = gearData.ascensionAboveHundredStatRate;
// gear.md §6: item-level cap per Ascension step, `regular` and `oblivion`, indexed by ascension - 1
export const MAX_ITEM_LEVEL_BY_ASCENSION = gearData.maxItemLevelByAscension;
export const OBLIVION_PRESTIGE = gearData.oblivionPrestige;
export const TOTAL_POWER_EQUIP = gearData.totalPowerEquip;
export const FEATURE_UNLOCK_LEVELS = gearData.featureUnlockLevels;
export const PRESET_CONSTANTS = gearData.presetConstants;

// Item stat-level maths shared by the engine (Power quality) and the model (roll ceilings). It sits
// here because L2 and L3 cannot import each other; it is a three-line lookup over the constants above.

/** gear.md §6 ascensionEffectiveLevel. */
export const ascensionEffectiveLevel = (L) => (L <= 100 ? L : 100 + (L - 100) * ASCENSION_ABOVE_HUNDRED_STAT_RATE);

/** gear.md §3 itemStatLevel: an Oblivion-realm item counts at ITEM_LEVEL_SCALE of its level (realm in either case). */
export const itemStatLevel = (itemLevel, realm) =>
  (String(realm ?? '').toLowerCase() === 'oblivion' ? itemLevel * OBLIVION_PRESTIGE.ITEM_LEVEL_SCALE : itemLevel);

/** gear.md §4 secondaryStatMaxValue, unrounded, for a pool entry `def`; callers round as the client does. */
export function secondaryStatCeiling(def, statLevel) {
  const frac = Math.min(statLevel, 100) / 100;
  const base = def.minValue + (def.maxValue - def.minValue) * (0.5 + 0.5 * frac);
  return statLevel > 100 ? (base * ascensionEffectiveLevel(statLevel)) / 100 : base;
}

// Quality sits here for the same reason: the engine (Power) and the model (derived item quality) both need it.
const poolByType = new Map(SECONDARY_STAT_POOL.map((d) => [d.type, d]));

/**
 * Where a secondary sits between its minimum and its ceiling at `statLevel` (0..1, unrounded): the
 * fraction calculateStatQuality rounds onto 1..100 (gear.md §5). Null for a type outside the pool or an empty range.
 */
export function secondaryRollFraction(type, value, statLevel) {
  const def = poolByType.get(type);
  if (!def) return null;
  const range = secondaryStatCeiling(def, statLevel) - def.minValue;
  if (range <= 0) return null;
  const p = 10 ** def.decimals;
  const span = Math.round((def.minValue + range) * p) / p - def.minValue;
  if (span <= 0) return null;
  return Math.max(0, Math.min(1, (value - def.minValue) / span));
}

/** gear.md §5 calculateStatQuality: 1..100 (1 for a type outside the pool or an empty range). */
export function calculateStatQuality(type, value, statLevel) {
  const f = secondaryRollFraction(type, value, statLevel);
  return f == null ? 1 : Math.round(f * 99 + 1);
}

/**
 * gear.md §5 calculateItemQuality over {secondaryStats, itemLevel, realm}: null with no secondaries,
 * 100 only when every stat is 100, else the rounded mean capped at 99 (2.9.3 rule, gear.md §5.1).
 */
export function calculateItemQuality(item) {
  const stats = item?.secondaryStats ?? [];
  if (stats.length === 0) return null;
  const L = itemStatLevel(item.itemLevel, item.realm);
  const qs = stats.map((x) => calculateStatQuality(x.type, x.value, L));
  if (qs.every((q) => q >= 100)) return 100;
  return Math.min(Math.round(qs.reduce((s, q) => s + q, 0) / qs.length), 99);
}

// gear.md §1 ITEM_TYPES_BY_RARITY: the cosmetic material an item of a rarity is made of. Uncommon lists
// STEEL twice (Steel and Reinforced share the type), so the list is deduplicated.
/** Distinct item types (e.g. 'SAPPHIRE') a rarity can drop as, first one first. */
export function itemTypesFor(rarity) {
  const types = rarityById(rarity)?.itemTypes ?? [];
  return types.filter((t, i) => types.findIndex((u) => u.type === t.type) === i);
}
