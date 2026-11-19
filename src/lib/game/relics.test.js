import { describe, it, expect } from 'vitest';
import raw from '../../data/game/relics.json';
import {
  RELICS,
  RELIC_CLASSES,
  relicById,
  relicsForClass,
  relicIdFromV1,
  RELIC_BASE_SLOTS,
  RELIC_MAX_EXTRA_SLOTS,
} from './relics.js';

describe('relic catalogue (relics.md §2, §9)', () => {
  it('has every relic from the JSON', () => {
    expect(RELICS).toEqual(raw.relics);
  });

  it('splits the catalogue across the four classes with no leftovers', () => {
    const total = RELIC_CLASSES.reduce((n, cls) => n + relicsForClass(cls).length, 0);
    expect(total).toBe(RELICS.length);
  });

  it('finds a relic by id and returns null for unknown ids', () => {
    expect(relicById('relic_iron_heart')?.name).toBe('Iron Heart');
    expect(relicById('nope')).toBeNull();
  });

  it('2.9.7 adds one gold HP relic each for Warrior, Mystic and Necromancer (relics.md §11)', () => {
    expect(RELICS).toHaveLength(71);
    for (const [id, cls] of [['relic_everbeat_heart', 'WARRIOR'], ['relic_lifebloom_seed', 'MYSTIC'], ['relic_gravebloom_censer', 'NECROMANCER']]) {
      const r = relicById(id);
      expect(r).toMatchObject({ tier: 'gold', cost: 6, maxLevel: 25 });
      expect(r.bonuses).toEqual([{ stat: 'HP_PERCENT', base: 12, max: 45.6 }, { stat: 'HP_REGEN', base: 5, max: 19.4 }]);
      expect(relicsForClass(cls)).toContain(r);
    }
  });
});

describe('relic slots and migration (relics.md §5, §8)', () => {
  it('reads slot constants from the JSON', () => {
    expect(RELIC_BASE_SLOTS).toBe(raw.constants.baseSlots);
    expect(RELIC_MAX_EXTRA_SLOTS).toBe(raw.constants.maxExtraSlots);
  });

  it('maps v1 Sentinel relic ids and passes other ids through', () => {
    const [oldId, newId] = Object.entries(raw.sentinelMigration)[0];
    expect(relicIdFromV1(oldId)).toBe(newId);
    expect(relicIdFromV1('relic_not_in_v1_map')).toBe('relic_not_in_v1_map');
  });
});
