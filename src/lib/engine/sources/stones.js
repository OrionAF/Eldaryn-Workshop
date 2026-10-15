// Enchant-stone source (a5): additive sum of the equipped stones' stats. Pure; the caller supplies
// the equipped list. Facts: docs/Reference/Game/stones.md §5, §7, §8.
import { oblivionGrade } from '../../game/stones.js';
import { emptyPetBonuses, secondaryKey } from './pet.js';

/** STAT_BONUS_PER_LEVEL (stones.md §8) */
export const AMPLIFY_STAT_BONUS_PER_LEVEL = 0.06;
/** POWER_GRADE_MULT (stones.md §7) */
const POWER_GRADE_MULT = 1.5;

/** @returns {import('../types.js').StoneBonuses} the pet set plus pvpAttack, pvpDefense, oblivionPower */
export const emptyStoneBonuses = () => ({
  ...emptyPetBonuses(),
  pvpAttack: 0,
  pvpDefense: 0,
  oblivionPower: 0,
});

const isOblivion = (type) => String(type).toUpperCase() === 'OBLIVION';

// port of normalizeOblivionStoneLevel (stones.md §7): clamp(floor(x), 1, 5), non-finite -> 1
export function normalizeOblivionLevel(x) {
  return Number.isFinite(x) ? Math.max(1, Math.min(5, Math.floor(x))) : 1;
}

// port of getOblivionPowerGradeMult (stones.md §7)
export const oblivionPowerGradeMult = (level) => POWER_GRADE_MULT ** (normalizeOblivionLevel(level) - 1);

// port of oblivionPowerForQuality (stones.md §7): round(8 + 22 (clamp(q,1,100) - 1) / 99)
export function oblivionPowerForQuality(quality) {
  const q = Math.max(1, Math.min(100, Number.isFinite(quality) ? quality : 1));
  return Math.round(8 + ((30 - 8) * (q - 1)) / 99);
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
      const key = secondaryKey(stat.type);
      if (!(key in out)) continue;
      out[key] += stoneStatValue(stone, stat);
    }
  }
  return out;
}
