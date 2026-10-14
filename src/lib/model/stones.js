// model/stones.js (B1): the two enchant-stone pools (base realm and Oblivion realm are separate
// lists, as in the client: stones.md §4). Persisted character fields: enchantStones,
// oblivionEnchantStones. Shape: rebuild-plan §3 Stone.
//
//   Stone = { id, type: EnchantStoneType, quality: 1..100|null, amplifyLevel: 0..10,
//             oblivionLevel: 1..5|null (OBLIVION type only), stats: [{type, value}] }
//
// `stats[].value` is the rolled value BEFORE amplify (stones.md §5 applies 1+0.06*L at calculation
// time); `type` is a SecondaryStatType enum name. Attack Speed / Crit Damage / Minion Attack Speed
// are multipliers (0.05 = 5%), the rest percent points, PVP Attack/Defense plain integers.
// Oblivion Power is derived from quality and grade by the engine and is not stored. Pure; L1 only.
import { STONE_TYPES, STONE_STATS, SPECIAL_STONE_STATS, AMPLIFY_TABLE, OBLIVION_GRADES, statPool } from '../game/stones.js';
import { newId } from './character.js';

export const MAX_AMPLIFY_LEVEL = AMPLIFY_TABLE.length; // stones.md §8: 10
export const MAX_OBLIVION_GRADE = OBLIVION_GRADES.length; // stones.md §7: 5
export const STONE_POOLS = ['base', 'oblivion'];

/** Enum name -> {min, max, decimals, key} for every stat a stone may carry. */
export const STONE_STAT_DEFS = new Map(
  [...STONE_STATS, ...SPECIAL_STONE_STATS].map((s) => [s.gameEnum, { key: s.stat, min: s.min, max: s.max, decimals: s.decimals }]),
);

const TYPE_ENUMS = STONE_TYPES.map((t) => t.enum);
export function stoneTypeByEnum(typeEnum) {
  return STONE_TYPES.find((t) => t.enum === typeEnum) ?? null;
}

const toEnum = (camel) => [...STONE_STATS, ...SPECIAL_STONE_STATS].find((s) => s.stat === camel)?.gameEnum ?? null;

/**
 * What a user must enter for a stone type (stones.md §1, data/stones.json `types`):
 *   guaranteed - stats always on the stone (Oblivion Power excluded: derived by the engine)
 *   choice     - Azure's weighted PvP Attack / PvP Defense draw (exactly one), else null
 *   freeCount  - extra stats drawn from `freePool` (no duplicates)
 */
export function stoneRecipe(typeEnum) {
  const t = stoneTypeByEnum(typeEnum);
  if (!t) return null;
  const guaranteed = (t.guaranteed ?? []).map(toEnum).filter((e) => e && e !== 'OBLIVION_POWER');
  const hasPower = (t.guaranteed ?? []).includes('oblivionPower');
  const choice = t.secondaryPool ? t.secondaryPool.map((p) => toEnum(p.stat)) : null;
  const freeCount = t.statCount - (t.guaranteed?.length ?? 0) - (choice ? 1 : 0);
  const freePool = statPool(t.pool).map((s) => s.gameEnum);
  return { type: t.enum, name: t.name, statCount: t.statCount, guaranteed, choice, freeCount, freePool, derivesOblivionPower: hasPower };
}

export function defaultStones() {
  return { enchantStones: [], oblivionEnchantStones: [] };
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/** Any value -> a valid Stone or null (unknown type). `used` is the set of ids already taken in this pool. */
export function normaliseStone(raw, used = new Set()) {
  if (!raw || typeof raw !== 'object' || !TYPE_ENUMS.includes(raw.type)) return null;
  let id = typeof raw.id === 'string' && raw.id ? raw.id : newId('s');
  while (used.has(id)) id = newId('s');
  used.add(id);
  const def = stoneTypeByEnum(raw.type);
  const seen = new Set();
  const stats = [];
  for (const s of Array.isArray(raw.stats) ? raw.stats : []) {
    if (!s || !STONE_STAT_DEFS.has(s.type) || seen.has(s.type)) continue;
    const value = Number(s.value);
    if (!Number.isFinite(value) || value < 0) continue;
    seen.add(s.type);
    stats.push({ type: s.type, value });
  }
  stats.length = Math.min(stats.length, def.statCount);
  return {
    id,
    type: raw.type,
    quality: raw.quality == null || raw.quality === '' ? null : clampInt(raw.quality, 1, 100, null),
    amplifyLevel: clampInt(raw.amplifyLevel, 0, MAX_AMPLIFY_LEVEL, 0),
    oblivionLevel: raw.type === 'OBLIVION' ? clampInt(raw.oblivionLevel, 1, MAX_OBLIVION_GRADE, 1) : null,
    stats,
  };
}

function normalisePool(raw) {
  const used = new Set();
  return (Array.isArray(raw) ? raw : []).map((s) => normaliseStone(s, used)).filter(Boolean);
}

export function normaliseStones(rawCharacter) {
  return {
    enchantStones: normalisePool(rawCharacter?.enchantStones),
    oblivionEnchantStones: normalisePool(rawCharacter?.oblivionEnchantStones),
  };
}

// v1 stone type keys (the v1 stone catalogue) -> EnchantStoneType
const V1_TYPE = { verdant: 'PVE_DEFENSE', crimson: 'PVE_ATTACK', azure: 'PVP', eldaryn: 'ULTIMATE', mythic: 'MYTHIC' };
// v1 stat key -> enum; pct stats are percent points in v1, the three multiplier stats /100
const V1_STAT = {
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
  pvp_attack: 'PVP_ATTACK',
  pvp_defense: 'PVP_DEFENSE',
};
const V1_MULTIPLIER = new Set(['speed', 'crit_mult']);

/** v1 stoneInventory -> enchantStones (ids kept, so equipment.enchantSlots can reuse the v1 socket ids). */
export function migrateStonesFromV1(v1Character) {
  const enchantStones = [];
  for (const s of Array.isArray(v1Character?.stoneInventory) ? v1Character.stoneInventory : []) {
    const type = V1_TYPE[s?.type];
    if (!type) continue;
    const keys = Array.isArray(s.rolledKeys) && s.rolledKeys.length ? s.rolledKeys : Object.keys(s.stats ?? {});
    const stats = [];
    for (const k of keys) {
      const enumName = V1_STAT[k];
      const v = Number(s.stats?.[k]);
      if (!enumName || !(v > 0)) continue;
      stats.push({ type: enumName, value: V1_MULTIPLIER.has(k) ? v / 100 : v });
    }
    enchantStones.push({ id: s.id, type, quality: s.quality > 0 ? s.quality : null, amplifyLevel: 0, oblivionLevel: null, stats });
  }
  return { value: { enchantStones, oblivionEnchantStones: [] }, idMap: {} };
}

// Equipment sockets are repaired in reconcileEquipment (model/equipment.js); nothing here points elsewhere.
// eslint-disable-next-line no-unused-vars
export function reconcileStones(character) {}
