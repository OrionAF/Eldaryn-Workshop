// model/equipment.js (B1): the three equipment sets (set1, set2, oblivion) and their stone sockets.
// Persisted character field: equipment. Shape: rebuild-plan §3 Equip/Item.
//
//   Equip = { items: Record<Slot, Item|null>, enchantSlots: Record<BaseSlot, stoneId|null> }
//   Item  = { rarity: RarityId|null, itemLevel: int|null, quality: 1..100|null,
//             primaryStats: {attack, hp}, secondaryStats: [{type, value}], conduit: {type, value}|null }
//
// set1/set2 hold the 9 base slots, `oblivion` the 12 Oblivion-realm slots (gear.md §1); every set
// has the 9 base sockets (stones.md §4). `rarity` may be null only for migrated v1 gear, where it
// was never recorded. Secondary values use the engine's units (stats.md §1.3): Attack Speed, Crit
// Damage and Minion Attack Speed are multipliers (0.12 = 12%), everything else percent points.
// Pure; imports L1 only.
import {
  RARITY_IDS,
  isRarityAtLeast,
  secondaryStatCount,
  slotsForRealm,
  BASE_SLOTS,
  SECONDARY_STAT_POOL,
  secondaryPoolFor,
  CONDUIT,
  OBLIVION_PRESTIGE,
  MAX_ITEM_LEVEL_BY_ASCENSION,
  itemStatLevel,
  secondaryStatCeiling,
} from '../game/gear.js';

export { itemStatLevel };

/** The three persisted sets and the realm each one belongs to. */
export const EQUIP_SETS = [
  { key: 'set1', realm: 'base', label: 'Set 1' },
  { key: 'set2', realm: 'base', label: 'Set 2' },
  { key: 'oblivion', realm: 'oblivion', label: 'Oblivion' },
];
export const EQUIP_SET_KEYS = EQUIP_SETS.map((s) => s.key);

export function realmOfSet(setKey) {
  return EQUIP_SETS.find((s) => s.key === setKey)?.realm ?? null;
}

// gear.md §6: the item-level cap is the Ascension skill's step (gear.json maxItemLevelByAscension,
// indexed by max(1, ascension) - 1). `maxItemLevel(realm)` with no ascension is the TOP step, the
// bound for stored items (an owned item may predate a respec); drops use the character's step.
export function maxItemLevel(realm, ascension = null) {
  const table = MAX_ITEM_LEVEL_BY_ASCENSION[realm === 'oblivion' ? 'oblivion' : 'regular'];
  if (ascension == null) return Math.max(...table);
  const i = Math.min(table.length, Math.max(1, Math.floor(Number(ascension)) || 1)) - 1;
  return table[i];
}

/** Warnings (not clamps) for an owned item: its level above what the character's Ascension step drops. */
export function itemWarnings(item, { realm = 'base', ascension = null } = {}) {
  const out = [];
  if (item?.itemLevel != null && ascension != null && item.itemLevel > maxItemLevel(realm, ascension)) {
    out.push({ kind: 'itemLevelAboveAscension', itemLevel: item.itemLevel, cap: maxItemLevel(realm, ascension) });
  }
  return out;
}


/**
 * Highest value a secondary can roll at an item stat level (gear.md §4 secondaryStatMaxValue, rounded
 * to the stat's decimals like calculateStatQuality's cmax). Null for a type outside the pool.
 */
export function secondaryStatMaxValue(type, statLevel) {
  const def = SECONDARY_STAT_POOL.find((s) => s.type === type);
  if (!def) return null;
  return parseFloat(secondaryStatCeiling(def, statLevel).toFixed(def.decimals));
}

// stats.md §1.3: stored as multipliers, shown as percent
const MULTIPLIER_STATS = new Set(['ATTACK_SPEED', 'CRIT_DAMAGE', 'MINION_ATTACK_SPEED']);
export function isMultiplierStat(type) {
  return MULTIPLIER_STATS.has(type);
}

const UNKNOWN_RARITY_SECONDARY_CAP = 3; // gear.md §2 maximum

function nonNeg(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function intIn(v, lo, hi) {
  if (v == null || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
}

/**
 * Conduit types an item of this rarity can carry in this realm (gear.md §7 rollConduitForRarity,
 * L677825-677900): Oblivion realm and rarity >= DARK_CONDUIT_MIN_RARITY -> DARK; otherwise ETERNAL ->
 * FLAME/EARTHEN; OBLIVION rarity -> DARK; any other rarity none. Unknown rarity (migrated) is permissive.
 */
export function conduitTypesFor(rarity, realm) {
  if (rarity == null) return [...CONDUIT.types];
  if (realm === 'oblivion' && isRarityAtLeast(rarity, OBLIVION_PRESTIGE.DARK_CONDUIT_MIN_RARITY)) return ['DARK'];
  if (rarity === 'ETERNAL') return ['FLAME', 'EARTHEN'];
  if (rarity === 'OBLIVION') return ['DARK'];
  return [];
}

/** Whether an item of this rarity may carry a Conduit in this realm. */
export function conduitAllowed(rarity, realm) {
  return conduitTypesFor(rarity, realm).length > 0;
}

/** How many secondary rows an item of this rarity can hold. */
export function secondarySlots(rarity) {
  return rarity == null ? UNKNOWN_RARITY_SECONDARY_CAP : secondaryStatCount(rarity);
}

export function emptyItem() {
  return { rarity: null, itemLevel: null, quality: null, primaryStats: { attack: 0, hp: 0 }, secondaryStats: [], conduit: null };
}

/**
 * Any value -> a valid Item or null. `cls` gates the secondary pool (game/classes available());
 * a null class applies no class gating. Idempotent. Secondary values above the item-level ceiling are
 * clamped and illegal conduits dropped; `ascension` (Drop Check callers) caps the item level at the
 * character's own step, owned gear leaves it null (top step, see itemWarnings); both push an entry to `report` (an array) when given.
 */
export function normaliseItem(raw, { cls = null, realm = 'base', report = null, slot = null, ascension = null } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const rarity = RARITY_IDS.includes(raw.rarity) ? raw.rarity : null;
  const itemLevel = intIn(raw.itemLevel, 1, maxItemLevel(realm, ascension));
  const pool = new Set((cls ? secondaryPoolFor(cls) : SECONDARY_STAT_POOL).map((s) => s.type));
  const seen = new Set();
  const secondaryStats = [];
  for (const s of Array.isArray(raw.secondaryStats) ? raw.secondaryStats : []) {
    if (!s || !pool.has(s.type) || seen.has(s.type)) continue;
    let value = Number(s.value);
    if (!Number.isFinite(value) || value < 0) continue;
    const ceiling = secondaryStatMaxValue(s.type, itemStatLevel(itemLevel ?? maxItemLevel(realm), realm));
    if (ceiling != null && value > ceiling) {
      report?.push({ kind: 'secondaryClamped', realm, slot, type: s.type, from: value, to: ceiling });
      value = ceiling;
    }
    seen.add(s.type);
    secondaryStats.push({ type: s.type, value });
  }
  secondaryStats.length = Math.min(secondaryStats.length, secondarySlots(rarity));
  let conduit = null;
  const c = raw.conduit;
  if (c && CONDUIT.types.includes(c.type)) {
    if (!conduitTypesFor(rarity, realm).includes(c.type)) {
      report?.push({ kind: 'conduitDropped', realm, slot, rarity, type: c.type });
    } else {
      const value = Number(c.value);
      if (Number.isFinite(value) && value >= 0) conduit = { type: c.type, value };
    }
  }
  return {
    rarity,
    itemLevel,
    quality: intIn(raw.quality, 1, 100),
    primaryStats: { attack: nonNeg(raw.primaryStats?.attack), hp: nonNeg(raw.primaryStats?.hp) },
    secondaryStats,
    conduit,
  };
}

export function emptyEquip(realm = 'base') {
  const items = {};
  for (const slot of slotsForRealm(realm)) items[slot] = null;
  const enchantSlots = {};
  for (const slot of BASE_SLOTS) enchantSlots[slot] = null;
  return { items, enchantSlots };
}

function normaliseEquip(raw, realm, cls, report) {
  const out = emptyEquip(realm);
  for (const slot of Object.keys(out.items)) out.items[slot] = normaliseItem(raw?.items?.[slot], { cls, realm, report, slot });
  for (const slot of BASE_SLOTS) {
    const id = raw?.enchantSlots?.[slot];
    out.enchantSlots[slot] = typeof id === 'string' && id ? id : null;
  }
  return out;
}

export function defaultEquipment() {
  return { equipment: { set1: emptyEquip('base'), set2: emptyEquip('base'), oblivion: emptyEquip('oblivion') } };
}

export function normaliseEquipment(rawCharacter, ctx) {
  const raw = rawCharacter?.equipment;
  const equipment = {};
  for (const { key, realm } of EQUIP_SETS) equipment[key] = normaliseEquip(raw?.[key], realm, ctx?.class ?? null, ctx?.report ?? null);
  return { equipment };
}

// v1 OffensiveStats key -> SecondaryStatType (the v1 STAT_FIELDS). v1 holds percent points
// for every pct key, so the three multiplier stats are divided by 100 on the way in.
// pvp_attack / pvp_defense were never gear stats and attack / health become primaryStats.
export const V1_STAT_TO_SECONDARY = {
  attack_pct: 'ATTACK_PERCENT',
  health_pct: 'HEALTH_PERCENT',
  speed: 'ATTACK_SPEED',
  crit: 'CRIT_CHANCE',
  crit_mult: 'CRIT_DAMAGE',
  double_hit: 'DOUBLE_HIT',
  spell_damage: 'SPELL_DAMAGE',
  lifesteal: 'LIFESTEAL',
  hp_regen: 'HP_REGEN',
  miss_chance: 'MISS_CHANCE',
  blind_chance: 'BLIND_CHANCE',
  paralyze_chance: 'PARALYZE_CHANCE',
  dmg_reduction: 'DAMAGE_REDUCTION',
  spell_resist: 'SPELL_RESIST',
  block_chance: 'BLOCK_CHANCE',
  penetration: 'PENETRATION',
};
const V1_SLOT = Object.fromEntries(
  ['Head', 'Shoulders', 'Chest', 'Leggings', 'Boots', 'Weapon', 'Offhand', 'Ring', 'Trinket'].map((n) => [n, n.toUpperCase()]),
);

function itemFromV1(gear) {
  if (!gear || typeof gear !== 'object') return null;
  const secondaryStats = [];
  for (const [k, type] of Object.entries(V1_STAT_TO_SECONDARY)) {
    const v = Number(gear[k]);
    if (Number.isFinite(v) && v > 0) secondaryStats.push({ type, value: isMultiplierStat(type) ? v / 100 : v });
  }
  const attack = nonNeg(gear.attack);
  const hp = nonNeg(gear.health);
  if (!secondaryStats.length && !attack && !hp) return null;
  return { rarity: null, itemLevel: null, quality: null, primaryStats: { attack, hp }, secondaryStats, conduit: null };
}

export function migrateEquipmentFromV1(v1Character) {
  const value = defaultEquipment();
  const loadouts = Array.isArray(v1Character?.loadouts) ? v1Character.loadouts : [];
  ['set1', 'set2'].forEach((key, i) => {
    const l = loadouts[i];
    if (!l) return;
    for (const [v1Slot, slot] of Object.entries(V1_SLOT)) {
      value.equipment[key].items[slot] = itemFromV1(l.gear?.[v1Slot]);
      const stoneId = l.socketedStones?.[v1Slot];
      if (typeof stoneId === 'string' && stoneId) value.equipment[key].enchantSlots[slot] = stoneId;
    }
  });
  return { value, idMap: {} };
}

/** Sockets must point at a stone in the set's own pool, and one stone fills one slot per set. */
export function reconcileEquipment(character) {
  const eq = character?.equipment;
  if (!eq) return;
  for (const { key } of EQUIP_SETS) {
    const set = eq[key];
    if (!set) continue;
    const stones = (key === 'oblivion' ? character.oblivionEnchantStones : character.enchantStones) ?? [];
    const pool = new Set(stones.map((s) => s.id));
    const used = new Set();
    for (const slot of BASE_SLOTS) {
      const id = set.enchantSlots[slot];
      if (id == null) continue;
      if (!pool.has(id) || used.has(id)) set.enchantSlots[slot] = null;
      else used.add(id);
    }
  }
}
