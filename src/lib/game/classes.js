// L1 catalogue: classes, specs, class stat gating. Lookups only, no game logic.
// Sources: Game/classes.md §1, §5, §6; data/classes.json; data/stats.json classStatTables.
import classesData from '../../data/game/classes.json';
import statsData from '../../data/game/stats.json';

export const CLASSES = ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER'];
export const MAX_PLAYER_LEVEL = 100; // classes.md §3, L670527

// classes.md §1 (spec -> class mapping, L2039513-2040151)
export const SPECS = [
  { key: 'WARRIOR_TANK', class: 'WARRIOR', name: 'Protection', role: 'TANK' },
  { key: 'WARRIOR_DPS', class: 'WARRIOR', name: 'Arms', role: 'DAMAGE' },
  { key: 'SENTINEL_MARKSMANSHIP', class: 'SENTINEL', name: 'Marksmanship', role: 'DAMAGE' },
  { key: 'SENTINEL_DISRUPTION', class: 'SENTINEL', name: 'Disruption', role: 'CONTROL' },
  { key: 'MYSTIC_MAGE', class: 'MYSTIC', name: 'Mage', role: 'ARCANE' },
  { key: 'MYSTIC_DRUID', class: 'MYSTIC', name: 'Druid', role: 'WILD' },
  { key: 'NECROMANCER_DEATHLORD', class: 'NECROMANCER', name: 'Deathlord', role: 'SUMMONER' },
  { key: 'NECROMANCER_DOOMWEAVER', class: 'NECROMANCER', name: 'Doomweaver', role: 'CURSE' },
];

export function specsForClass(cls) {
  return SPECS.filter((s) => s.class === cls);
}
export function classOfSpec(specKey) {
  return SPECS.find((s) => s.key === specKey)?.class ?? null;
}

const { unique, excluded, controlStats } = statsData.classStatTables;
export const CLASS_UNIQUE_SECONDARY_STATS = unique;
export const CLASS_EXCLUDED_SECONDARY_STATS = excluded;
export const CONTROL_SECONDARY_STATS = controlStats;
const ALL_UNIQUE = new Set(Object.values(unique).flat());

// port of isSecondaryStatAvailableForClass, L1213616-1213879 (default class WARRIOR)
export function available(stat, cls = 'WARRIOR') {
  if ((excluded[cls] ?? []).includes(stat)) return false;
  if (!ALL_UNIQUE.has(stat)) return true;
  return (unique[cls] ?? []).includes(stat);
}

// classes.md §5, L668410-668430, L668930-668943 (literals via register reuse, see doc note)
export const CLASS_ATTUNEMENT_BONUS = { WARRIOR: 0, SENTINEL: 0, MYSTIC: 1, NECROMANCER: 1 };
export function attunementBonus(cls) {
  return CLASS_ATTUNEMENT_BONUS[cls] ?? 0;
}

// classes.md §6, L668915-668929 (fallback 25)
export const SIGIL_UNLOCK_LEVEL_BY_CLASS = { WARRIOR: 25, SENTINEL: 25, MYSTIC: 17, NECROMANCER: 17 };
export function sigilUnlockLevel(cls) {
  return SIGIL_UNLOCK_LEVEL_BY_CLASS[cls] ?? 25;
}

export const XP_TABLE = classesData.xpTable;
