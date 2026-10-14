// L1 catalogue: enchant stone types, stat pools, amplify table, Oblivion grades.
// Lookups only, no game logic. Sources: Game/stones.md §1, §2, §7, §8; data/stones.json.
import stonesJson from '../../data/game/stones.json';

export const STONE_WEIGHT_EXPONENT = stonesJson.weightExponent;

// stones.md §1
export const STONE_TYPES = stonesJson.types;
export function stoneType(key) {
  return STONE_TYPES.find((t) => t.key === key) ?? null;
}

// stones.md §2. Pool flags per stat; 'fullPool' is every stat flagged inFullPool.
export const STONE_STATS = stonesJson.stats;
export const SPECIAL_STONE_STATS = stonesJson.specialStats;
const POOL_FLAG = {
  pveAttackPool: 'inPveAttackPool',
  pveDefensePool: 'inPveDefensePool',
  fullPool: 'inFullPool',
};
export function statPool(poolKey) {
  const flag = POOL_FLAG[poolKey];
  return flag ? STONE_STATS.filter((s) => s[flag]) : [];
}
export function stoneStat(stat) {
  return [...STONE_STATS, ...SPECIAL_STONE_STATS].find((s) => s.stat === stat) ?? null;
}

// stones.md §8. Amplify ladder, one row per target level 1..10.
export const AMPLIFY_TABLE = stonesJson.amplifyTable;
export function amplifyStep(targetLevel) {
  return AMPLIFY_TABLE.find((r) => r.targetLevel === targetLevel) ?? null;
}

// stones.md §7. Oblivion grades 1..5.
export const OBLIVION_GRADES = stonesJson.oblivionGrades;
export function oblivionGrade(level) {
  return OBLIVION_GRADES.find((g) => g.level === level) ?? null;
}
