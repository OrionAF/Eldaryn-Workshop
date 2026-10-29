import { describe, it, expect } from 'vitest';
import { defaultStones, normaliseStones, normaliseStone, migrateStonesFromV1, stoneRecipe, statRollFraction, stoneRollGrade } from './stones.js';
import { newCharacter, normaliseCharacter } from './index.js';

describe('roll grading (stones.md §2 ranges)', () => {
  it('statRollFraction: position in [min, max], clamped; unknown stat -> null', () => {
    expect(statRollFraction('PVP_ATTACK', 5)).toBe(0);
    expect(statRollFraction('PVP_ATTACK', 25)).toBe(1);
    expect(statRollFraction('PVP_ATTACK', 15)).toBe(0.5);
    expect(statRollFraction('PVP_DEFENSE', 20)).toBe(1);
    expect(statRollFraction('CRIT_CHANCE', 1.5)).toBeCloseTo(0.5);
    expect(statRollFraction('PVP_ATTACK', 99)).toBe(1);
    expect(statRollFraction('NOPE', 1)).toBeNull();
  });

  it('stoneRollGrade: mean of the rows, with a letter', () => {
    const maxed = { stats: [{ type: 'PVP_ATTACK', value: 25 }, { type: 'PVP_DEFENSE', value: 20 }, { type: 'CRIT_CHANCE', value: 2.5 }, { type: 'BLOCK_CHANCE', value: 99 }] };
    expect(stoneRollGrade(maxed)).toEqual({ fraction: 1, grade: 'S' });
    const g = stoneRollGrade({ stats: [{ type: 'PVP_ATTACK', value: 25 }, { type: 'PVP_DEFENSE', value: 5 }] });
    expect(g).toEqual({ fraction: 0.5, grade: 'B' });
    expect(stoneRollGrade({ stats: [{ type: 'PVP_ATTACK', value: 5 }] }).grade).toBe('D');
    expect(stoneRollGrade({ stats: [] })).toBeNull();
  });
});

describe('stoneRecipe (stones.md §1)', () => {
  it('PVE stones: 2 free stats from their own pool, nothing guaranteed', () => {
    const atk = stoneRecipe('PVE_ATTACK');
    expect(atk).toMatchObject({ guaranteed: [], choice: null, freeCount: 2 });
    expect(atk.freePool).toHaveLength(14);
    expect(atk.freePool).toContain('PENETRATION');
    const def = stoneRecipe('PVE_DEFENSE');
    expect(def.freePool).toHaveLength(11);
  });

  it('Azure: one PvP stat from a weighted pair plus one free stat from the full pool of 24', () => {
    const r = stoneRecipe('PVP');
    expect(r.choice).toEqual(['PVP_ATTACK', 'PVP_DEFENSE']);
    expect(r.freeCount).toBe(1);
    expect(r.freePool).toHaveLength(24);
    expect(r.freePool).not.toContain('PENETRATION');
  });

  it('Eldaryn / Mythic: both PvP stats guaranteed, 1 / 2 free', () => {
    expect(stoneRecipe('ULTIMATE')).toMatchObject({ guaranteed: ['PVP_ATTACK', 'PVP_DEFENSE'], freeCount: 1 });
    expect(stoneRecipe('MYTHIC')).toMatchObject({ guaranteed: ['PVP_ATTACK', 'PVP_DEFENSE'], freeCount: 2 });
  });

  it('Oblivion: 2 free stats; Oblivion Power is derived, not entered', () => {
    const r = stoneRecipe('OBLIVION');
    expect(r.guaranteed).toEqual(['PVP_ATTACK', 'PVP_DEFENSE']);
    expect(r.derivesOblivionPower).toBe(true);
    expect(r.freeCount).toBe(2);
  });

  it('unknown type -> null', () => {
    expect(stoneRecipe('NOPE')).toBeNull();
  });
});

describe('normaliseStone', () => {
  const base = { id: 's1', type: 'MYTHIC', quality: 70, amplifyLevel: 4, stats: [{ type: 'PVP_ATTACK', value: 12 }, { type: 'CRIT_CHANCE', value: 1.4 }] };

  it('keeps a valid stone as-is (idempotent)', () => {
    const once = normaliseStone(base);
    expect(once).toEqual({ ...base, activated: true, oblivionLevel: null });
    expect(normaliseStone(once)).toEqual(once);
  });

  it('clamps amplify to 0..10 and the Oblivion grade to 1..5 (Oblivion type only)', () => {
    expect(normaliseStone({ ...base, amplifyLevel: 99 }).amplifyLevel).toBe(10);
    expect(normaliseStone({ ...base, amplifyLevel: -3 }).amplifyLevel).toBe(0);
    expect(normaliseStone({ ...base, oblivionLevel: 4 }).oblivionLevel).toBeNull();
    expect(normaliseStone({ ...base, type: 'OBLIVION', oblivionLevel: 9 }).oblivionLevel).toBe(5);
    expect(normaliseStone({ ...base, type: 'OBLIVION' }).oblivionLevel).toBe(1);
  });

  it('drops unknown types, unknown or duplicate stats, and caps the stat count at the type count', () => {
    expect(normaliseStone({ ...base, type: 'NOPE' })).toBeNull();
    const s = normaliseStone({ ...base, type: 'PVE_ATTACK', stats: [{ type: 'CRIT_CHANCE', value: 1 }, { type: 'CRIT_CHANCE', value: 2 }, { type: 'DOUBLE_HIT', value: 1 }, { type: 'LIFESTEAL', value: 1 }, { type: 'WAT', value: 1 }] });
    expect(s.stats.map((x) => x.type)).toEqual(['CRIT_CHANCE', 'DOUBLE_HIT']);
  });

  it('assigns fresh ids to missing or duplicate ids within a pool', () => {
    const pool = normaliseStones({ enchantStones: [{ ...base }, { ...base }, { ...base, id: undefined }] }).enchantStones;
    expect(new Set(pool.map((s) => s.id)).size).toBe(3);
  });
});

describe('stone legality (M2 #119)', () => {
  it('drops a PvP stat on a Crimson stone and stats outside the type pool', () => {
    const s = normaliseStone({ id: 'c', type: 'PVE_ATTACK', stats: [{ type: 'PVP_ATTACK', value: 10 }, { type: 'HEALTH_PERCENT', value: 5 }, { type: 'CRIT_CHANCE', value: 1 }] });
    expect(s.stats).toEqual([{ type: 'CRIT_CHANCE', value: 1 }]);
  });

  it('keeps a guaranteed stat listed last, ordering guaranteed first', () => {
    const s = normaliseStone({ id: 'm', type: 'MYTHIC', stats: [{ type: 'CRIT_CHANCE', value: 1 }, { type: 'BLOCK_CHANCE', value: 1 }, { type: 'LIFESTEAL', value: 1 }, { type: 'PVP_DEFENSE', value: 10 }, { type: 'PVP_ATTACK', value: 10 }] });
    expect(s.stats.map((x) => x.type)).toEqual(['PVP_ATTACK', 'PVP_DEFENSE', 'CRIT_CHANCE', 'BLOCK_CHANCE']);
  });

  it('clamps values to the stat range and decimals; Azure takes one PvP stat only', () => {
    const s = normaliseStone({ id: 'a', type: 'PVP', stats: [{ type: 'PVP_ATTACK', value: 99 }, { type: 'PVP_DEFENSE', value: 10 }, { type: 'CRIT_CHANCE', value: 7.77 }] });
    expect(s.stats).toEqual([{ type: 'PVP_ATTACK', value: 25 }, { type: 'CRIT_CHANCE', value: 2.5 }]);
  });

  it('separates the realms: Oblivion stones only in the Oblivion pool and vice versa', () => {
    const got = normaliseStones({
      enchantStones: [{ id: 'a', type: 'OBLIVION', stats: [] }, { id: 'b', type: 'PVE_ATTACK', stats: [] }],
      oblivionEnchantStones: [{ id: 'c', type: 'MYTHIC', stats: [] }, { id: 'd', type: 'OBLIVION', stats: [] }],
    });
    expect(got.enchantStones.map((s) => s.id)).toEqual(['b']);
    expect(got.oblivionEnchantStones.map((s) => s.id)).toEqual(['d']);
  });

  it('persists activated (default on for old saves)', () => {
    expect(normaliseStone({ id: 'u', type: 'PVE_ATTACK', activated: false, stats: [] }).activated).toBe(false);
    expect(normaliseStone({ id: 'v', type: 'PVE_ATTACK', stats: [] }).activated).toBe(true);
    // the client skips any falsy flag (L1205747); only a missing flag defaults on
    for (const falsy of [null, 0, '', false]) expect(normaliseStone({ id: 'w', type: 'PVE_ATTACK', activated: falsy, stats: [] }).activated).toBe(false);
    expect(normaliseStone({ id: 'x', type: 'PVE_ATTACK', activated: 1, stats: [] }).activated).toBe(true);
  });
});

describe('pools', () => {
  it('base and Oblivion pools are separate lists; the same id may exist in both', () => {
    const got = normaliseStones({
      enchantStones: [{ id: 'a', type: 'PVE_ATTACK', stats: [] }],
      oblivionEnchantStones: [{ id: 'a', type: 'OBLIVION', oblivionLevel: 3, stats: [] }],
    });
    expect(got.enchantStones).toHaveLength(1);
    expect(got.oblivionEnchantStones[0]).toMatchObject({ id: 'a', oblivionLevel: 3 });
    expect(normaliseStones(null)).toEqual(defaultStones());
  });

  it('a stone can be socketed in set1 and set2 while the Oblivion pool stays separate', () => {
    const c = newCharacter('A', 'WARRIOR');
    c.enchantStones = [normaliseStone({ id: 'x', type: 'PVE_ATTACK', stats: [] })];
    c.oblivionEnchantStones = [normaliseStone({ id: 'y', type: 'OBLIVION', stats: [] })];
    c.equipment.set1.enchantSlots.HEAD = 'x';
    c.equipment.set2.enchantSlots.RING = 'x';
    c.equipment.oblivion.enchantSlots.HEAD = 'y';
    const n = normaliseCharacter(JSON.parse(JSON.stringify(c)));
    expect(n.equipment.set1.enchantSlots.HEAD).toBe('x');
    expect(n.equipment.set2.enchantSlots.RING).toBe('x');
    expect(n.equipment.oblivion.enchantSlots.HEAD).toBe('y');
  });
});

describe('v1 migration', () => {
  it('maps stone types and stat keys, keeps ids, /100 for multiplier stats', () => {
    const { value, idMap } = migrateStonesFromV1({
      stoneInventory: [
        { id: 'a', type: 'verdant', quality: 33, rolledKeys: ['block_chance', 'health_pct'], stats: { block_chance: 1.2, health_pct: 4 } },
        { id: 'b', type: 'eldaryn', quality: 0, rolledKeys: ['pvp_attack', 'pvp_defense', 'speed'], stats: { pvp_attack: 10, pvp_defense: 8, speed: 5 } },
        { id: 'c', type: 'bogus' },
      ],
    });
    expect(idMap).toEqual({});
    expect(value.oblivionEnchantStones).toEqual([]);
    expect(value.enchantStones).toHaveLength(2);
    expect(value.enchantStones[0]).toMatchObject({ id: 'a', type: 'PVE_DEFENSE', quality: 33 });
    const b = value.enchantStones[1];
    expect(b).toMatchObject({ type: 'ULTIMATE', quality: null });
    expect(b.stats.find((s) => s.type === 'ATTACK_SPEED').value).toBeCloseTo(0.05);
    expect(b.stats.find((s) => s.type === 'PVP_ATTACK').value).toBe(10);
  });
});
