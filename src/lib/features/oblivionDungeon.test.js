import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from '../build/fixtures.js';
import {
  highestFreeFloor, oblivionFighter, oblivionPowerOf, strainRows, maxFloorAtThreshold, runFloorScan,
} from './oblivionDungeon.js';
import { oblivionFloorMob, oblivionEffectiveInstability } from '../engine/pve/enemies.js';

describe('highestFreeFloor', () => {
  it('with no power, the floor after the result is not free', () => {
    const f = highestFreeFloor(0);
    expect(oblivionEffectiveInstability(oblivionFloorMob(f + 1).instability, 0)).toBeGreaterThan(0);
  });
  it('rises with power and never exceeds the `to` bound', () => {
    expect(highestFreeFloor(1e9)).toBe(60);
    expect(highestFreeFloor(1e9, 10)).toBe(10);
    expect(highestFreeFloor(5000)).toBeGreaterThanOrEqual(highestFreeFloor(0));
  });
});

describe('static helpers', () => {
  it('strainRows spans the range and maxFloorAtThreshold picks the best passing floor', () => {
    expect(strainRows(0, 2, 4).map((r) => r.floor)).toEqual([2, 3, 4]);
    expect(maxFloorAtThreshold([{ floor: 1, p: 1 }, { floor: 2, p: 0.5 }, { floor: 3, p: 0.95 }])).toBe(3);
    expect(maxFloorAtThreshold([{ floor: 1, p: null }])).toBeNull();
  });
  it('oblivionPowerOf rounds and tolerates a missing fighter', () => {
    expect(oblivionPowerOf({ stats: { totalOblivionPower: 12.6 } })).toBe(13);
    expect(oblivionPowerOf(null)).toBe(0);
  });
});

describe('oblivionFighter / runFloorScan', () => {
  it('builds the Oblivion-realm fighter', () => {
    expect(oblivionFighter(fixtureCharacter('WARRIOR'), 'p1').realm).toBe('oblivion');
  });
  it('runs a scan through the task facade and forwards maxMs / applyOutputCut', async () => {
    const scan = runFloorScan(fixtureCharacter('WARRIOR'), { presetId: 'p1', from: 1, to: 1, n: 2, maxMs: 300000, applyOutputCut: true });
    expect(scan.fighter.realm).toBe('oblivion');
    const r = await scan.promise;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].n).toBe(2);
    expect(r.assumptions.find((a) => a.key === 'fight-cap').text).toContain('5 minutes');
    expect(r.assumptions.map((a) => a.key)).toContain('output-cut-applied');
    expect(typeof scan.cancel).toBe('function');
  });
});
