import { describe, it, expect } from 'vitest';
import {
  CORE_RARITIES, coreSecondaryCount, coreBaseBand, coreSecondaryRange, coreSecondaryTypesFor, isCoreRarity,
} from './petCores.js';

describe('game/petCores catalogue', () => {
  it('ten rarities with 1-5 secondary slots', () => {
    expect(CORE_RARITIES).toHaveLength(10);
    expect(CORE_RARITIES.map(coreSecondaryCount)).toEqual([1, 2, 2, 2, 3, 3, 3, 4, 4, 5]);
    expect(isCoreRarity('Mythic')).toBe(false);
    expect(coreSecondaryCount('Mythic')).toBe(0);
  });
  it('base band is +-10% around the rarity base', () => {
    expect(coreBaseBand('MYTHIC')).toEqual({
      attack: { min: 3465, mid: 3850, max: 4235 },
      hp: { min: 8775, mid: 9750, max: 10725 },
    });
    expect(coreBaseBand('nope')).toBeNull();
  });
  it('secondary ranges are the gear roll at item level 50 (pet-cores.md §5)', () => {
    expect(coreSecondaryRange('ATTACK_PERCENT')).toEqual({ min: 1.8, max: 10.9, decimals: 1 });
    expect(coreSecondaryRange('ATTACK_SPEED')).toEqual({ min: 0.03, max: 0.16, decimals: 2 });
    expect(coreSecondaryRange('PVP_ATTACK')).toBeNull();
  });
  it('types follow the class filter', () => {
    const warrior = coreSecondaryTypesFor('WARRIOR');
    expect(warrior).toContain('ATTACK_PERCENT');
    expect(warrior.length).toBeLessThanOrEqual(26);
  });
});
