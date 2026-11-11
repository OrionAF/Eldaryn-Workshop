// Enchant-stone source (a5): additive sum of the equipped stones' stats. Pure; the caller supplies
// the equipped list. Facts: docs/Reference/Game/stones.md §5, §7, §8.
import { OBLIVION_GRADES, oblivionGrade } from '../../game/stones.js';
import { emptyPetBonuses, secondaryKey } from './pet.js';

/** STAT_BONUS_PER_LEVEL (stones.md §8) */
export const AMPLIFY_STAT_BONUS_PER_LEVEL = 0.06;

/** @returns {import('../types.js').StoneBonuses} the pet set plus pvpAttack, pvpDefense, oblivionPower */
export const emptyStoneBonuses = () => ({
  ...emptyPetBonuses(),
  pvpAttack: 0,
  pvpDefense: 0,
  oblivionPower: 0,
});

const isOblivion = (type) => String(type).toUpperCase() === 'OBLIVION';

// The SecondaryStatType cases of calculateEnchantStoneBonuses' switch (L1205726-1206148): every
// bonus key but the grade's flatAttack / flatHp. Any other stat type adds nothing.
const STONE_STAT_TYPES = new Set(Object.keys(emptyStoneBonuses())
  .filter((k) => k !== 'flatAttack' && k !== 'flatHp')
  .map((k) => k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()));

// first / last grade level of the client's grade table (stones.md §7: 1 and 7 since 2.9.4)
const OBLIVION_LEVEL_FIRST = OBLIVION_GRADES[0].level;
const OBLIVION_LEVEL_LAST = OBLIVION_GRADES[OBLIVION_GRADES.length - 1].level;

// port of normalizeOblivionStoneLevel (stones.md §7): clamp(floor(x), first, last), non-finite -> first
export function normalizeOblivionLevel(x) {
  return Number.isFinite(x) ? Math.max(OBLIVION_LEVEL_FIRST, Math.min(OBLIVION_LEVEL_LAST, Math.floor(x))) : OBLIVION_LEVEL_FIRST;
}

// port of getOblivionPowerGradeMult (stones.md §7): a per-grade table lookup since 2.9.4
export const oblivionPowerGradeMult = (level) => oblivionGrade(normalizeOblivionLevel(level)).powerGradeMult;

// port of oblivionPowerForQuality L1205241-1205276 (stones.md §7), in the client's operation order.
// A missing quality counts as 1 and +-Infinity clamps as in the client; NaN also counts as 1 (the
// client would return NaN; the engine never does, plan invariant I9).
export function oblivionPowerForQuality(quality) {
  const q = Math.max(1, Math.min(100, quality == null || Number.isNaN(quality) ? 1 : quality));
  return Math.round(8 + (30 - 8) * ((q - 1) / 99));
}

// port of getAmplifyStatMultiplier (stones.md §8)
export const amplifyStatMultiplier = (amplifyLevel) =>
  1 + AMPLIFY_STAT_BONUS_PER_LEVEL * (amplifyLevel || 0);

// port of getEnchantStoneStatValue / getEnchantStoneStatMultiplier (stones.md §5)
export function stoneStatValue(stone, stat) {
  if (isOblivion(stone.type) && stat.type === 'OBLIVION_POWER') {
    return oblivionPowerForQuality(stone.quality) * oblivionPowerGradeMult(stone.oblivionLevel);
  }
  return stat.value * amplifyStatMultiplier(stone.amplifyLevel);
}

/**
 * port of calculateEnchantStoneBonuses L1205726-1206148. Skips stones with a falsy `activated`.
 * Oblivion stones add their grade's base Attack/HP to flatAttack/flatHp.
 * @param {import('../types.js').Stone[]} stones
 * @returns {import('../types.js').StoneBonuses & {flatAttack:number, flatHp:number}}
 */
export function calculateStoneBonuses(stones) {
  const out = emptyStoneBonuses();
  for (const stone of stones ?? []) {
    // L1205747 skips a falsy `activated`; a record with no flag at all (engine-level callers) counts.
    if (!stone || (stone.activated !== undefined && !stone.activated)) continue;
    if (isOblivion(stone.type)) {
      const g = oblivionGrade(normalizeOblivionLevel(stone.oblivionLevel));
      if (g) {
        out.flatAttack += g.baseAttack;
        out.flatHp += g.baseHp;
      }
    }
    for (const stat of stone.stats ?? []) {
      if (!STONE_STAT_TYPES.has(stat.type)) continue;
      out[secondaryKey(stat.type)] += stoneStatValue(stone, stat);
    }
  }
  return out;
}
