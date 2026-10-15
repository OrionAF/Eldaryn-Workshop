import { describe, it, expect } from 'vitest';
import raw from '../../data/game/gear.json';
import statsJson from '../../data/game/stats.json';
import {
  RARITY_IDS,
  rarityIndex,
  isRarityAtLeast,
  secondaryStatCount,
  slotsForRealm,
  BASE_SLOTS,
  OBLIVION_ONLY_SLOTS,
  weaponOffhandName,
  secondaryPoolFor,
  CONDUIT,
} from './gear.js';

describe('gear rarities (gear.md §2)', () => {
  it('orders rarities as the JSON lists them', () => {
    expect(RARITY_IDS).toEqual(raw.rarities.map((r) => r.id));
    expect(rarityIndex('COMMON')).toBe(0);
    expect(rarityIndex('NOPE')).toBe(-1);
  });

  it('compares rarities by index', () => {
    expect(isRarityAtLeast('EPIC', 'RARE')).toBe(true);
    expect(isRarityAtLeast('RARE', 'EPIC')).toBe(false);
    expect(isRarityAtLeast('NOPE', 'RARE')).toBe(false);
  });

  it('reads secondaryStatCount from the JSON', () => {
    for (const r of raw.rarities) expect(secondaryStatCount(r.id)).toBe(r.secondaryStatCount);
    expect(secondaryStatCount('NOPE')).toBe(0);
  });
});

describe('gear slots (gear.md §1)', () => {
  it('gives 9 slots in the base realm and 12 in Oblivion', () => {
    expect(slotsForRealm('base')).toEqual(raw.equipmentSlots.base);
    expect(slotsForRealm('base')).toHaveLength(BASE_SLOTS.length);
    expect(slotsForRealm('oblivion')).toEqual([...BASE_SLOTS, ...OBLIVION_ONLY_SLOTS]);
    expect(slotsForRealm('oblivion')).toHaveLength(BASE_SLOTS.length + OBLIVION_ONLY_SLOTS.length);
  });

  it('names WEAPON and OFFHAND per class with a default', () => {
    expect(weaponOffhandName('SENTINEL', 'WEAPON')).toBe(raw.weaponOffhandNames.SENTINEL.WEAPON);
    expect(weaponOffhandName('WARRIOR', 'OFFHAND')).toBe(raw.weaponOffhandNames.default.OFFHAND);
  });
});

describe('secondary pool per class (gear.md §4, classes.js gating)', () => {
  const { unique, excluded } = statsJson.classStatTables;
  const allTypes = raw.secondaryStatPool.map((s) => s.type);

  // classes.js rule: excluded for the class, or a class-unique stat not on this class's list
  const allUnique = new Set(Object.values(unique).flat());
  const allowed = (t, cls) =>
    !(excluded[cls] ?? []).includes(t) && (!allUnique.has(t) || (unique[cls] ?? []).includes(t));

  it('applies the class exclusions and unique lists (Necromancer)', () => {
    const expected = allTypes.filter((t) => allowed(t, 'NECROMANCER'));
    expect(secondaryPoolFor('NECROMANCER').map((s) => s.type)).toEqual(expected);
    expect(expected).not.toContain('CRIT_CHANCE');
    expect(expected).not.toContain('DOUBLE_HIT');
  });

  it('applies the class unique lists (Warrior)', () => {
    const expected = allTypes.filter((t) => allowed(t, 'WARRIOR'));
    expect(secondaryPoolFor('WARRIOR').map((s) => s.type)).toEqual(expected);
    expect(expected).toContain('DOUBLE_HIT');
  });
});

describe('conduit config (gear.md §7)', () => {
  it('matches the JSON', () => {
    expect(CONDUIT).toEqual(raw.conduit);
    expect(CONDUIT.types).toEqual(['FLAME', 'EARTHEN', 'DARK']);
  });
});

describe('item stat-level maths (shared by engine/power.js and model/equipment.js)', () => {
  it('scales Oblivion items in either realm spelling and leaves base items alone', async () => {
    const { itemStatLevel, OBLIVION_PRESTIGE } = await import('./gear.js');
    expect(itemStatLevel(200, 'base')).toBe(200);
    expect(itemStatLevel(200, 'oblivion')).toBe(200 * OBLIVION_PRESTIGE.ITEM_LEVEL_SCALE);
    expect(itemStatLevel(200, 'OBLIVION')).toBe(200 * OBLIVION_PRESTIGE.ITEM_LEVEL_SCALE);
  });
  it('the ceiling is the pool max at level 100 and grows with the effective level above it', async () => {
    const { secondaryStatCeiling, ascensionEffectiveLevel, SECONDARY_STAT_POOL } = await import('./gear.js');
    const def = SECONDARY_STAT_POOL[0];
    expect(secondaryStatCeiling(def, 100)).toBeCloseTo(def.maxValue, 9);
    expect(secondaryStatCeiling(def, 0)).toBeCloseTo(def.minValue + (def.maxValue - def.minValue) * 0.5, 9);
    expect(secondaryStatCeiling(def, 240)).toBeCloseTo((def.maxValue * ascensionEffectiveLevel(240)) / 100, 9);
  });
});
