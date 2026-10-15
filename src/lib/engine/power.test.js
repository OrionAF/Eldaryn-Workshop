import { describe, it, expect } from 'vitest';
import { calculatePowerBreakdown, calculateTotalPower, calculateStatQuality, calculateItemQuality, ascensionEffectiveLevel, POWER_TERMS } from './power.js';

const empty = { level: 0, equipment: [], sigils: [], sigilAltarTier: 1, enchants: [], transcendenceNodeCount: 0, pet: null, mount: null, relics: [], talentPointsSpent: 0, awakeningPoints: 0 };
const only = (patch) => calculatePowerBreakdown({ ...empty, ...patch });

describe('calculatePowerBreakdown terms (stats.md §8)', () => {
  it('an empty input is zero in every term', () => {
    const p = only({});
    expect(p.power).toBe(0);
    expect(Object.keys(p.terms)).toEqual(POWER_TERMS);
  });

  it('equipment: rarity x (1 + 0.6 effLevel/100) x (1 + 0.35 quality/100); a null quality counts 0', () => {
    expect(only({ equipment: [{ rarity: 'EPIC', itemLevel: 100, quality: 100 }] }).exact.equipment).toBeCloseTo(65 * 1.6 * 1.35, 9);
    expect(only({ equipment: [{ rarity: 'EPIC', itemLevel: 50, quality: null }, null] }).exact.equipment).toBeCloseTo(65 * 1.3, 9);
    // above 100 the level counts at 40%; an Oblivion-realm item at half its level
    expect(only({ equipment: [{ rarity: 'ETERNAL', itemLevel: 200, quality: 0 }] }).exact.equipment).toBeCloseTo(3400 * (1 + 0.6 * 1.4), 9);
    expect(only({ equipment: [{ rarity: 'OBLIVION', itemLevel: 200, quality: 0, realm: 'OBLIVION' }] }).exact.equipment).toBeCloseTo(7000 * 1.6, 9);
    expect(only({ equipment: [{ rarity: 'NOPE', itemLevel: 100, quality: 0 }] }).exact.equipment).toBe(0);
  });

  it('sigils: rarity x min(level,30)/30 x 3^(altarTier-1), COMMON 150 and ANCIENT 1000', () => {
    expect(only({ sigils: [{ rarity: 'COMMON', level: 30 }], sigilAltarTier: 1 }).exact.sigils).toBe(150);
    expect(only({ sigils: [{ rarity: 'ANCIENT', level: 40 }], sigilAltarTier: 1 }).exact.sigils).toBe(1000);
    expect(only({ sigils: [{ rarity: 'LEGENDARY', level: 15 }], sigilAltarTier: 3 }).exact.sigils).toBe(2900 * 0.5 * 9);
  });

  it('enchants: 600 x (0.4 + 0.6 q/100) x (1 + 0.06 amplify)', () => {
    expect(only({ enchants: [{ quality: 100, amplifyLevel: 0 }, { quality: 0, amplifyLevel: 10 }] }).exact.enchants).toBeCloseTo(600 + 600 * 0.4 * 1.6, 9);
  });

  it('pet, mount, relics and the flat terms', () => {
    expect(only({ pet: { rarity: 'ANCIENT', altarLevel: 60, tier: 2 } }).exact.pet).toBe(7200 * 3);
    expect(only({ mount: { rarity: 'EPIC', stars: 3 } }).exact.mount).toBeCloseTo(3000 * 1.2, 9);
    expect(only({ relics: [{ tier: 'GOLD', level: 5, maxLevel: 10 }, { tier: 'BRONZE', level: 3, maxLevel: 0 }] }).exact.relics).toBe(900);
    const flat = only({ transcendenceNodeCount: 7, talentPointsSpent: 10, awakeningPoints: 2, level: 50 });
    expect([flat.exact.transcendence, flat.exact.talents, flat.exact.awakening, flat.exact.level]).toEqual([700, 1500, 700, 2000]);
  });

  it('power rounds the sum of the unrounded terms, not the sum of the rounded ones', () => {
    // two 0.4 terms: rounded each they sum to 0, together they round to 1
    const p = only({ transcendenceNodeCount: 0.004, talentPointsSpent: 0.4 / 150 });
    expect(p.terms.transcendence + p.terms.talents).toBe(0);
    expect(p.power).toBe(1);
    expect(calculateTotalPower({ ...empty, level: 10 })).toBe(400);
  });
});

describe('gear quality (gear.md §5)', () => {
  it('a roll at the level ceiling is 100, at the floor 1; a type outside the pool is 1', () => {
    expect(calculateStatQuality('ATTACK_SPEED', 0.2, 100)).toBe(100);
    expect(calculateStatQuality('ATTACK_SPEED', 0.03, 100)).toBe(1);
    expect(calculateStatQuality('PVP_ATTACK', 5, 100)).toBe(1);
    expect(ascensionEffectiveLevel(240)).toBe(156);
  });

  it('item quality is the rounded mean, null with no secondaries', () => {
    expect(calculateItemQuality({ itemLevel: 100, secondaryStats: [] })).toBeNull();
    expect(calculateItemQuality({ itemLevel: 100, secondaryStats: [{ type: 'ATTACK_SPEED', value: 0.2 }, { type: 'ATTACK_SPEED', value: 0.03 }] })).toBe(51);
  });
});
