import { describe, it, expect } from 'vitest';
import {
  normalizeCoreTier, coreTierStatMultiplier, coreAltarTierXpMultiplier, coreAltarXpRequired,
  coreAltarProgress, calculateCoreBonuses, coreTotalPower,
} from './petCore.js';
import { CORE_BASE_STATS } from '../../game/petCores.js';

const core = (rarity, secondaryStats = []) => ({
  baseAttack: CORE_BASE_STATS[rarity].attack, baseHp: CORE_BASE_STATS[rarity].hp, secondaryStats,
});

describe('Pet Core tiers (pet-cores.md §3)', () => {
  it('normalises without an upper clamp', () => {
    expect([normalizeCoreTier(0), normalizeCoreTier(2.9), normalizeCoreTier(NaN), normalizeCoreTier(12)]).toEqual([1, 2, 1, 12]);
  });
  it('stat multiplier follows the table, then x1.1 per tier', () => {
    expect([1, 2, 3, 4, 5].map(coreTierStatMultiplier)).toEqual([1, 3.3, 17, 24.5, 26.5]);
    expect(coreTierStatMultiplier(6)).toBeCloseTo(29.15, 10);
    expect(coreTierStatMultiplier(8)).toBeCloseTo(35.2715, 10);
  });
  it('altar XP multiplier follows the version 2 table, then x1.1', () => {
    expect([1, 2, 3, 4].map(coreAltarTierXpMultiplier)).toEqual([0.67, 1.4, 6.86, 13.82]);
    expect(coreAltarTierXpMultiplier(5)).toBeCloseTo(15.202, 10);
  });
});

describe('Core Altar (pet-cores.md §4)', () => {
  it('scales the V1 tier-1 need', () => {
    expect(coreAltarXpRequired(1, 1)).toBe(117);
    expect(coreAltarXpRequired(49, 1)).toBe(5552);
    expect(coreAltarXpRequired(50, 1)).toBe(Infinity);
  });
  it('total XP 1 -> 50 matches the derived table', () => {
    const total = (tier) => Array.from({ length: 49 }, (_, i) => coreAltarXpRequired(i + 1, tier)).reduce((a, b) => a + b, 0);
    expect([1, 2, 3, 4, 5].map(total)).toEqual([87545, 182928, 896351, 1805766, 1986340]);
  });
  it('walks levels from cumulative XP', () => {
    expect(coreAltarProgress(0, 1)).toEqual({ level: 1, xp: 0, need: 117 });
    expect(coreAltarProgress(117 + 10, 1).level).toBe(2);
    expect(coreAltarProgress(87545, 1)).toEqual({ level: 50, xp: 0, need: Infinity });
    expect(coreAltarProgress(87544, 1).level).toBe(49);
  });
});

describe('calculateCoreBonuses (pet-cores.md §2)', () => {
  it('no core gives zeros', () => {
    expect(Object.values(calculateCoreBonuses(null, 50, 5)).every((v) => v === 0)).toBe(true);
  });
  it('unrolled bases at altar 50 match the derived table', () => {
    const at = (r, t) => { const b = calculateCoreBonuses(core(r), 50, t); return [b.flatAttack, b.flatHp]; };
    expect(at('COMMON', 1)).toEqual([797, 2347]);
    expect(at('MYTHIC', 1)).toEqual([17055, 43192]);
    expect(at('LEGENDARY', 5)).toEqual([270008, 798285]);
    expect(at('OBLIVION', 5)).toEqual([1678748, 4836674]);
  });
  it('level 1 tier 1 is the raw base', () => {
    const b = calculateCoreBonuses({ baseAttack: 3912, baseHp: 9001 }, 1, 1);
    expect([b.flatAttack, b.flatHp]).toEqual([3912, 9001]);
  });
  it('secondaries scale with altar level only and skip non-pet types', () => {
    const c = core('EPIC', [
      { type: 'ATTACK_PERCENT', value: 10 }, { type: 'ATTACK_SPEED', value: 0.1 },
      { type: 'PVP_ATTACK', value: 5 }, { type: 'NOT_A_STAT', value: 5 },
    ]);
    const lo = calculateCoreBonuses(c, 50, 1);
    const hi = calculateCoreBonuses(c, 50, 7);
    expect(lo.attackPercent).toBe(19.8);
    expect(lo.attackSpeed).toBe(0.2);
    expect(hi.attackPercent).toBe(19.8);
    expect(Object.keys(lo)).not.toContain('pvpAttack');
  });
});

describe('coreTotalPower (pet-cores.md §7)', () => {
  it('tier 1 is linear in level', () => {
    expect(coreTotalPower('ANCIENT', 50, 1)).toBe(7200);
    expect(coreTotalPower('ANCIENT', 25, 1)).toBe(3600);
  });
  it('higher tiers use K and a base-3 level curve', () => {
    expect(coreTotalPower('MYTHIC', 50, 2)).toBeCloseTo(4400 * 7.8, 8);
    expect(coreTotalPower('MYTHIC', 34, 2)).toBeCloseTo((4400 * 7.8) / 3, 8);
    expect(coreTotalPower('OBLIVION', 50, 4)).toBe(21000 * 890);
    expect(coreTotalPower('OBLIVION', 18, 4)).toBeCloseTo((21000 * 890) / 3, 6);
    expect(coreTotalPower('OBLIVION', 50, 5)).toBeCloseTo((21000 * 890 * 26.5) / 24.5, 6);
  });
  it('unknown rarity counts 0', () => {
    expect(coreTotalPower('SHINY', 50, 3)).toBe(0);
  });
});
