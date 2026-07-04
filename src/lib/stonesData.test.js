import { it, expect } from 'vitest';
import { STONE_TYPES, stoneTypeDef } from './stonesData.js';

it('every type has a unique key, a color, and a valid total bonus-stat count per the design doc (2/2/2/3/4)', () => {
  const expectedTotals = { verdant: 2, crimson: 2, azure: 2, eldaryn: 3, mythic: 4 };
  const keys = new Set();
  for (const t of STONE_TYPES) {
    expect(keys.has(t.key)).toBe(false);
    keys.add(t.key);
    expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
    const total = t.fixedKeys.length + (t.fixedChoice ? 1 : 0) + t.freeCount;
    expect(total, t.key).toBe(expectedTotals[t.key]);
  }
});

it('only Azure has a fixedChoice; only Eldaryn/Mythic have fixedKeys (PVP Attack + PVP Defense)', () => {
  expect(stoneTypeDef('azure').fixedChoice).toEqual(['pvp_attack', 'pvp_defense']);
  expect(stoneTypeDef('verdant').fixedChoice).toBe(null);
  expect(stoneTypeDef('crimson').fixedChoice).toBe(null);
  expect(stoneTypeDef('eldaryn').fixedChoice).toBe(null);
  expect(stoneTypeDef('mythic').fixedChoice).toBe(null);

  expect(stoneTypeDef('eldaryn').fixedKeys).toEqual(['pvp_attack', 'pvp_defense']);
  expect(stoneTypeDef('mythic').fixedKeys).toEqual(['pvp_attack', 'pvp_defense']);
  expect(stoneTypeDef('verdant').fixedKeys).toEqual([]);
  expect(stoneTypeDef('crimson').fixedKeys).toEqual([]);
  expect(stoneTypeDef('azure').fixedKeys).toEqual([]);
});

it('stoneTypeDef returns null for an unknown type', () => {
  expect(stoneTypeDef('not-a-real-type')).toBe(null);
});
