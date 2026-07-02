import { it, expect } from 'vitest';
import { RELICS_BY_CLASS, RELIC_TIER_MAX_LEVEL, relicLevelValue } from './relicsData.js';

it('relicLevelValue returns min at level 1 and max at maxLevel', () => {
  expect(relicLevelValue(3, 12, 1, 10)).toBe(3);
  expect(relicLevelValue(3, 12, 10, 10)).toBe(12);
});

it('relicLevelValue interpolates linearly between min and max', () => {
  // 6 -> 14 over levels 1..15 (14 steps total); level 8 is 7 steps in.
  expect(relicLevelValue(6, 14, 8, 15)).toBeCloseTo(6 + (7 * (14 - 6)) / 14, 10);
  expect(relicLevelValue(6, 14, 8, 15)).toBe(10);
});

it('relicLevelValue clamps out-of-range levels', () => {
  expect(relicLevelValue(3, 12, 0, 10)).toBe(3);
  expect(relicLevelValue(3, 12, 999, 10)).toBe(12);
});

it('every relic has a valid tier, matches its tier max level, and 1-2 stats', () => {
  for (const [className, relics] of Object.entries(RELICS_BY_CLASS)) {
    const ids = new Set();
    for (const r of relics) {
      expect(RELIC_TIER_MAX_LEVEL[r.tier], `${className} ${r.name} tier`).toBeDefined();
      expect(r.maxLevel, `${className} ${r.name} maxLevel`).toBe(RELIC_TIER_MAX_LEVEL[r.tier]);
      expect(r.stats.length, `${className} ${r.name} stat count`).toBeGreaterThanOrEqual(1);
      expect(r.stats.length, `${className} ${r.name} stat count`).toBeLessThanOrEqual(2);
      expect(ids.has(r.id), `${className} duplicate id ${r.id}`).toBe(false);
      ids.add(r.id);
    }
  }
});

it('Bronze relics always have exactly 1 stat; Silver always exactly 2', () => {
  for (const relics of Object.values(RELICS_BY_CLASS)) {
    for (const r of relics.filter((x) => x.tier === 'bronze')) expect(r.stats.length).toBe(1);
    for (const r of relics.filter((x) => x.tier === 'silver')) expect(r.stats.length).toBe(2);
  }
});

it('every stat max is greater than its min', () => {
  for (const relics of Object.values(RELICS_BY_CLASS)) {
    for (const r of relics) {
      for (const s of r.stats) {
        expect(s.max, `${r.name} ${s.statKey}`).toBeGreaterThan(s.min);
      }
    }
  }
});
