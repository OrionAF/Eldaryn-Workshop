// S2: the stored speed calibration, its staleness and the run-time estimate text.
import { describe, it, expect } from 'vitest';
import {
  normaliseCalibration, staleReason, calibrationFrom, estimateSeconds, estimateText, durationText,
  optimiserFights, dropFights, duelFights, oblivionFights, APP_VERSION,
} from './calibration.js';
import { normalisePrefs } from './uiState.js';

const cal = (o = {}) => ({ profile: 'balanced', workers: 4, fightsPerSec: { dummy: 400, dungeon: 200, duel: 100 }, measuredAt: 1_700_000_000_000, version: APP_VERSION, ...o });

describe('normaliseCalibration', () => {
  it('keeps a valid calibration and drops junk', () => {
    expect(normaliseCalibration(cal())).toEqual(cal());
    expect(normaliseCalibration(null)).toBeNull();
    expect(normaliseCalibration(cal({ profile: 'turbo' }))).toBeNull();
    expect(normaliseCalibration(cal({ workers: 0 }))).toBeNull();
    expect(normaliseCalibration(cal({ fightsPerSec: { dummy: 400 } }))).toBeNull();
    expect(normaliseCalibration(cal({ fightsPerSec: { dummy: 400, dungeon: -1 } }))).toBeNull();
  });
  it('drops an unusable duel rate but keeps the rest', () => {
    expect(normaliseCalibration(cal({ fightsPerSec: { dummy: 400, dungeon: 200, duel: 'fast' } })).fightsPerSec).toEqual({ dummy: 400, dungeon: 200 });
  });
  it('is part of the per-device prefs and survives their normalisation', () => {
    expect(normalisePrefs({ calibration: cal() }).calibration).toEqual(cal());
    expect(normalisePrefs({ calibration: { profile: 'eco' } }).calibration).toBeNull();
    expect(normalisePrefs({}).calibration).toBeNull();
  });
});

describe('staleReason', () => {
  it('is null when the profile and build match', () => {
    expect(staleReason(cal(), { profile: 'balanced' })).toBeNull();
    expect(staleReason(null, { profile: 'balanced' })).toBeNull();
  });
  it('names a changed profile or build', () => {
    expect(staleReason(cal(), { profile: 'max' })).toBe('profile');
    expect(staleReason(cal({ version: '0.0.1+old' }), { profile: 'balanced' })).toBe('version');
  });
});

describe('calibrationFrom', () => {
  const result = { fightsPerSec: { dummy: 300, dungeon: 150 }, workers: 2, aborted: false };
  it('stamps a finished result with the profile, time and build', () => {
    expect(calibrationFrom(result, { profile: 'eco', now: 5 })).toEqual({ profile: 'eco', workers: 2, fightsPerSec: { dummy: 300, dungeon: 150 }, measuredAt: 5, version: APP_VERSION });
  });
  it('stores nothing for a cancelled or empty result', () => {
    expect(calibrationFrom({ ...result, aborted: true }, { profile: 'eco' })).toBeNull();
    expect(calibrationFrom({ ...result, fightsPerSec: {} }, { profile: 'eco' })).toBeNull();
  });
});

describe('estimates', () => {
  it('sums fights over rates by kind', () => {
    expect(estimateSeconds(cal(), { dummy: 4000, duel: 1000 })).toBeCloseTo(10 + 10);
    expect(estimateSeconds(null, { dummy: 1 })).toBeNull();
    expect(estimateSeconds(cal(), {})).toBeNull();
  });
  it('a kind without a measured rate counts at the slowest one', () => {
    const c = cal({ fightsPerSec: { dummy: 400, dungeon: 200 } });
    expect(estimateSeconds(c, { duel: 1000 })).toBeCloseTo(5);
  });
  it('reads as minutes, labelled as an estimate', () => {
    expect(estimateText(cal(), { dummy: 400 * 180 })).toBe('About 3 min on this device (estimate).');
    expect(estimateText(cal(), { dummy: 400 * 180 }, { bound: 'upper' })).toBe('Up to about 3 min on this device (estimate).');
    expect(estimateText(cal(), { dummy: 100 })).toBe('Takes under a minute on this device (estimate).');
    expect(estimateText(cal(), { dummy: 400 * 180 }, { stale: 'profile' })).toContain('another CPU profile');
  });
  it('formats long runs in hours', () => {
    expect(durationText(80 * 60)).toBe('1 h 20 min');
    expect(durationText(2 * 3600)).toBe('2 h');
  });
});

describe('fight counts', () => {
  it('Optimiser: the two measured points of simulation.md §Cost are reproduced at Quick', () => {
    const quick = { n0: 8 };
    expect(optimiserFights(quick, 2, 'dummy').dummy).toBeGreaterThan(600);
    expect(optimiserFights(quick, 2, 'dummy').dummy).toBeLessThan(1100);
    expect(optimiserFights(quick, 13, 'dummy').dummy).toBeGreaterThan(130_000);
    expect(optimiserFights(quick, 13, 'dummy').dummy).toBeLessThan(150_000);
  });
  it('Optimiser: kind follows the target, and a longer first look costs more', () => {
    expect(Object.keys(optimiserFights({ n0: 16 }, 5, 'pvp', 2))).toEqual(['duel']);
    expect(Object.keys(optimiserFights({ n0: 16 }, 5, 'dungeon'))).toEqual(['dungeon']);
    expect(optimiserFights({ n0: 32 }, 5, 'dummy').dummy).toBe(2 * optimiserFights({ n0: 16 }, 5, 'dummy').dummy);
    expect(optimiserFights({ n0: 16 }, 5, 'pvp', 3).duel).toBeCloseTo(3 * optimiserFights({ n0: 16 }, 5, 'pvp', 1).duel, -1);
  });
  it('Drop Check: a before/after pair up to maxN per item, per metric', () => {
    expect(dropFights({ items: [1, 2], sim: true, enemy: null, opponents: [] }, 100)).toEqual({ dummy: 400 });
    expect(dropFights({ items: [1], sim: true, enemy: { mobs: [] }, opponents: [{}, {}] }, 100)).toEqual({ dummy: 200, dungeon: 200, duel: 400 });
  });
  it('Duel and Oblivion', () => {
    expect(duelFights(800, 2)).toEqual({ duel: 1600 });
    expect(oblivionFights(30, 64)).toEqual({ dungeon: 1920 });
  });
});
