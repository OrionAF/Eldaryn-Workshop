import { describe, it, expect } from 'vitest';
import { mulberry32, sfc32, scripted, hashSeed } from './rng.js';

const take = (r, n) => Array.from({ length: n }, () => r());

describe('rng', () => {
  it('mulberry32: same seed gives the same sequence, in [0,1)', () => {
    const a = take(mulberry32(42), 50);
    expect(take(mulberry32(42), 50)).toEqual(a);
    expect(take(mulberry32(43), 50)).not.toEqual(a);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('mulberry32: reference value for seed 1', () => {
    expect(mulberry32(1)()).toBeCloseTo(0.6270739405881613, 12);
  });
  it('sfc32: deterministic, seed-sensitive, in [0,1)', () => {
    const a = take(sfc32(1, 2, 3, 4), 50);
    expect(take(sfc32(1, 2, 3, 4), 50)).toEqual(a);
    expect(take(sfc32(1, 2, 3, 5), 50)).not.toEqual(a);
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('mean of 10000 draws is near 0.5', () => {
    for (const r of [mulberry32(7), sfc32(7, 8, 9, 10)]) {
      const m = take(r, 10000).reduce((s, v) => s + v, 0) / 10000;
      expect(Math.abs(m - 0.5)).toBeLessThan(0.02);
    }
  });
  it('scripted: returns values in order, counts draws, throws when exhausted', () => {
    const r = scripted([0.1, 0.9]);
    expect(r.draws).toBe(0);
    expect(r()).toBe(0.1);
    expect(r.remaining).toBe(1);
    expect(r()).toBe(0.9);
    expect(r.draws).toBe(2);
    expect(() => r()).toThrow(/exhausted/);
    expect(r.draws).toBe(2);
  });
  it('hashSeed: stable uint32, sensitive to order and part boundaries', () => {
    const h = hashSeed('duel', 'a', 3);
    expect(h).toBe(hashSeed('duel', 'a', 3));
    expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
    expect(hashSeed('a', 'b')).not.toBe(hashSeed('b', 'a'));
    expect(hashSeed('ab', 'c')).not.toBe(hashSeed('a', 'bc'));
    expect(hashSeed()).toBe(hashSeed());
  });
});
