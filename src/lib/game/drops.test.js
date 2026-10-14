import { describe, it, expect } from 'vitest';
import raw from '../../data/game/drops.json';
import { dropRatesForLevel, rarityUnlockLevel, DROP_RATES_BY_LEVEL, DROP_RARITY_ORDER } from './drops.js';

describe('drop rates by level (drops.md §2)', () => {
  it('has one row per level 1..100 whose rarity percents sum to 100', () => {
    expect(DROP_RATES_BY_LEVEL).toHaveLength(100);
    for (const row of DROP_RATES_BY_LEVEL) {
      const total = DROP_RARITY_ORDER.reduce((sum, r) => sum + row[r], 0);
      expect(total).toBeCloseTo(100, 9); // JSON floats, e.g. 100.00000000000001
    }
  });

  it('returns the JSON row for a level and clamps out-of-range levels', () => {
    expect(dropRatesForLevel(1)).toEqual(raw.dropRatesByLevel[0]);
    expect(dropRatesForLevel(50)).toEqual(raw.dropRatesByLevel[49]);
    expect(dropRatesForLevel(0)).toEqual(raw.dropRatesByLevel[0]);
    expect(dropRatesForLevel(500)).toEqual(raw.dropRatesByLevel[99]);
  });
});

describe('rarity unlock levels (drops.md §11)', () => {
  it('reads the unlock level for each rarity', () => {
    for (const [rarity, level] of Object.entries(raw.rarityUnlockLevel)) {
      expect(rarityUnlockLevel(rarity)).toBe(level);
    }
    expect(rarityUnlockLevel('nope')).toBeNull();
  });
});
