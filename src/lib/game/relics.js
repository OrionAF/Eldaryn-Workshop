// L1 catalogue: relic definitions by class (4), slot and upgrade cost constants, sentinel migration.
// Lookups only, no game logic. Sources: Game/relics.md §3, §5, §8, §9; data/relics.json.
import relicsData from '../../data/game/relics.json';

// relics.md §3-§5
export const RELIC_CONSTANTS = relicsData.constants;
export const RELIC_BASE_SLOTS = RELIC_CONSTANTS.baseSlots;
export const RELIC_MAX_EXTRA_SLOTS = RELIC_CONSTANTS.maxExtraSlots;

// relics.md §9. Catalogue class labels are capitalised in the JSON; these are the app's class keys.
export const RELIC_CLASSES = ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER'];
export const RELICS = relicsData.relics;

export function relicById(id) {
  return RELICS.find((r) => r.id === id) ?? null;
}
export function relicsForClass(cls) {
  return RELICS.filter((r) => r.class.toUpperCase() === cls);
}

// relics.md §8. Sentinel relic ids renamed in v1 saves.
export const SENTINEL_MIGRATION = relicsData.sentinelMigration;
export function relicIdFromV1(id) {
  return SENTINEL_MIGRATION[id] ?? id;
}
