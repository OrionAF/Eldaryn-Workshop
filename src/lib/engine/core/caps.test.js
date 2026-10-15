import { describe, it, expect } from 'vitest';
import {
  applySoftCap, rawFromSoftCapped, applyCombatCeiling, softCapGainFromSheet,
  softCapEfficiency, pvpRatingToPercent, capConfig, ceilingFor,
} from './caps.js';

const crit = { soft: 50, hard: 90 };

describe('caps', () => {
  it('applySoftCap: identity below soft (L1080181)', () => {
    expect(applySoftCap(30, crit)).toBe(30);
    expect(applySoftCap(50, crit)).toBe(50);
  });
  it('applySoftCap: hand-traced values (L1080181-1080222)', () => {
    // K=40, s=80. raw 90: 50+40*(1-(80/120)^2)=50+40*5/9
    expect(applySoftCap(90, crit)).toBeCloseTo(50 + (40 * 5) / 9, 10);
    // raw 130: 50+40*(1-(80/160)^2)=80
    expect(applySoftCap(130, crit)).toBeCloseTo(80, 10);
    expect(applySoftCap(1e9, crit)).toBeLessThan(90);
  });
  it('applySoftCap: degenerate hard<=soft clamps to hard', () => {
    expect(applySoftCap(10, { soft: 5, hard: 5 })).toBe(5);
  });
  it('rawFromSoftCapped round trip (L1080224-1080265)', () => {
    for (const c of [51, 60, 75, 80, 89.9]) {
      expect(applySoftCap(rawFromSoftCapped(c, crit), crit)).toBeCloseTo(c, 8);
    }
    expect(rawFromSoftCapped(80, crit)).toBeCloseTo(130, 8);
    expect(rawFromSoftCapped(40, crit)).toBe(40);
    expect(rawFromSoftCapped(90, crit)).toBe(Infinity);
  });
  it('applyCombatCeiling (L1080297-1080308)', () => {
    expect(applyCombatCeiling(97, 95)).toBe(95);
    expect(applyCombatCeiling(60, 95)).toBe(60);
  });
  it('softCapGainFromSheet (L1080334-1080366)', () => {
    expect(softCapGainFromSheet(80, 0, crit)).toBe(0);
    expect(softCapGainFromSheet(80, -5, crit)).toBe(0);
    expect(softCapGainFromSheet(90, 10, crit)).toBe(0);
    expect(softCapGainFromSheet(30, 10, crit)).toBeCloseTo(10, 10);
    expect(softCapGainFromSheet(80, 30, crit)).toBeCloseTo(50 + 40 * (1 - (80 / 190) ** 2) - 80, 8);
  });
  it('softCapEfficiency (L1080367-1080400)', () => {
    expect(softCapEfficiency(40, crit)).toBe(1);
    expect(softCapEfficiency(130, crit)).toBeCloseTo(0.125, 10);
    expect(softCapEfficiency(70, { soft: 5, hard: 5 })).toBe(0);
  });
  it('pvpRatingToPercent: r/(r+200) (L1080412-1080429)', () => {
    expect(pvpRatingToPercent(0)).toBe(0);
    expect(pvpRatingToPercent(-5)).toBe(0);
    expect(pvpRatingToPercent(200)).toBeCloseTo(50, 10);
    expect(pvpRatingToPercent(600)).toBeCloseTo(75, 10);
  });
  it('catalogue: cap table matches the client; miss hard cap is 85', () => {
    expect(capConfig('MISS_CHANCE')).toEqual({ soft: 50, hard: 85 });
    expect(capConfig('totalCritChance')).toEqual({ soft: 50, hard: 90 });
    expect(capConfig('ATTACK_SPEED')).toEqual({ soft: 2, hard: 4 });
    expect(capConfig('totalHp')).toBeNull();
    expect(ceilingFor('CRIT_CHANCE')).toBe(95);
    expect(ceilingFor('ATTACK_SPEED')).toBe(4.5);
  });
});
