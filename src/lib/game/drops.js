// L1 catalogue: drop rarity odds by player level, rarity unlock levels, Oblivion drop model.
// Lookups only, no game logic. Sources: Game/drops.md §1-§3, §11; data/drops.json.
import dropsData from '../../data/game/drops.json';

// drops.md §2 (lowercase ids; gear.js uses the uppercase gear ids)
export const DROP_RARITY_ORDER = dropsData.rarityOrder;
export const RARITY_UNLOCK_LEVEL = dropsData.rarityUnlockLevel;
export function rarityUnlockLevel(rarity) {
  return RARITY_UNLOCK_LEVEL[rarity] ?? null;
}

// drops.md §2. One row per player level 1..100, percent per rarity.
export const DROP_RATES_BY_LEVEL = dropsData.dropRatesByLevel;
export function dropRatesForLevel(level) {
  const idx = Math.min(Math.max(Math.trunc(level), 1), DROP_RATES_BY_LEVEL.length) - 1;
  return DROP_RATES_BY_LEVEL[idx];
}

// drops.md §3
export const OBLIVION_DROP_MODEL = dropsData.oblivionModel;
