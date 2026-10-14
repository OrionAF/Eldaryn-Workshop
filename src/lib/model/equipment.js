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
} from '../game/gear.js';

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

// gear.md §6: base item-level cap is the top Ascension step (100/130/160/190/240; the base table is
// not in gear.json, so 240 is stated here once); Oblivion's is the top of ASCENSION_MAX_ITEM_LEVELS.
const BASE_ASCENSION_TOP = 240;
export function maxItemLevel(realm) {
  return realm === 'oblivion' ? Math.max(...OBLIVION_PRESTIGE.ASCENSION_MAX_ITEM_LEVELS) : BASE_ASCENSION_TOP;
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

/** Whether an item of this rarity may carry a Conduit in this realm (gear.md §7). */
export function conduitAllowed(rarity, realm) {
  if (rarity == null) return true; // unknown rarity (migrated): do not discard user data
  if (isRarityAtLeast(rarity, 'ETERNAL')) return true;
  return realm === 'oblivion' && isRarityAtLeast(rarity, OBLIVION_PRESTIGE.DARK_CONDUIT_MIN_RARITY);
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
 * a null class applies no class gating. Idempotent.
 */
export function normaliseItem(raw, { cls = null, realm = 'base' } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const rarity = RARITY_IDS.includes(raw.rarity) ? raw.rarity : null;
  const pool = new Set((cls ? secondaryPoolFor(cls) : SECONDARY_STAT_POOL).map((s) => s.type));
  const seen = new Set();
  const secondaryStats = [];
  for (const s of Array.isArray(raw.secondaryStats) ? raw.secondaryStats : []) {
    if (!s || !pool.has(s.type) || seen.has(s.type)) continue;
    const value = Number(s.value);
    if (!Number.isFinite(value) || value < 0) continue;
    seen.add(s.type);
    secondaryStats.push({ type: s.type, value });
  }
  secondaryStats.length = Math.min(secondaryStats.length, secondarySlots(rarity));
  let conduit = null;
  const c = raw.conduit;
  if (c && CONDUIT.types.includes(c.type) && conduitAllowed(rarity, realm)) {
    const value = Number(c.value);
    if (Number.isFinite(value) && value >= 0) conduit = { type: c.type, value };
  }
  return {
    rarity,
    itemLevel: intIn(raw.itemLevel, 1, maxItemLevel(realm)),
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

function normaliseEquip(raw, realm, cls) {
  const out = emptyEquip(realm);
  for (const slot of Object.keys(out.items)) out.items[slot] = normaliseItem(raw?.items?.[slot], { cls, realm });
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
  for (const { key, realm } of EQUIP_SETS) equipment[key] = normaliseEquip(raw?.[key], realm, ctx?.class ?? null);
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
