import { describe, it, expect } from 'vitest';
import {
  meanInterval, wilsonInterval, pairedT, pairedProportion, stratifiedPairedProportion, censoredQuantile,
  quantileInterval, pairedBootstrap, pairedQuantileDiff, isBinary,
} from './intervals.js';
import { zCrit } from './tdist.js';

const range = (n, f = (i) => i) => Array.from({ length: n }, (_, i) => f(i));

describe('mean and proportion intervals', () => {
  it('meanInterval: exact t, null bounds below two samples', () => {
    const r = meanInterval([1, 2, 3]);
    expect(r.est).toBe(2);
    expect(r.hi - 2).toBeCloseTo(4.302652729911275 / Math.sqrt(3), 9);
    expect(r.method).toBe('t');
    expect(meanInterval([5]).lo).toBeNull();
    expect(meanInterval([]).est).toBeNull();
  });
  it('wilsonInterval follows alpha', () => {
    expect(wilsonInterval(50, 100).lo).toBeCloseTo(0.4038, 3);
    expect(wilsonInterval(50, 100, { alpha: 0.01 }).lo).toBeLessThan(0.4038);
  });
  it('pairedT is x - y with a p-value', () => {
    const r = pairedT([3, 4, 5, 7], [1, 2, 3, 4]);
    expect(r.delta).toBe(2.25);
    expect(r.p).toBeLessThan(0.05);
    expect(r.method).toBe('paired-t');
  });
});

describe('paired proportions (Tango score)', () => {
  it('no discordant pair at n = 64: z^2 / (n + z^2) either side, whatever the concordant split (#101)', () => {
    const z2 = zCrit() ** 2;
    for (const ones of [0, 32, 64]) {
      const a = range(64, (i) => (i < ones ? 1 : 0));
      const r = pairedProportion(a, [...a]);
      expect(r.delta).toBe(0);
      expect(r.hi).toBeCloseTo(z2 / (64 + z2), 9);
      expect(r.lo).toBeCloseTo(-z2 / (64 + z2), 9);
      expect(r.p).toBe(1);
    }
  });
  it('excludes 0 exactly when McNemar rejects (the score test at 0)', () => {
    // b discordant favouring x, c favouring y, the rest concordant, n = 100
    const make = (b, c) => {
      const x = [];
      const y = [];
      for (let i = 0; i < b; i++) { x.push(1); y.push(0); }
      for (let i = 0; i < c; i++) { x.push(0); y.push(1); }
      while (x.length < 100) { x.push(x.length % 2); y.push(y.length % 2); }
      return [x, y];
    };
    for (const [b, c] of [[10, 2], [8, 2], [7, 2], [3, 0], [4, 0], [0, 6]]) {
      const r = pairedProportion(...make(b, c));
      expect(r.delta).toBeCloseTo((b - c) / 100, 12);
      expect(r.lo).toBeLessThanOrEqual(r.delta);
      expect(r.hi).toBeGreaterThanOrEqual(r.delta);
      const mcnemar = Math.abs(b - c) / Math.sqrt(b + c) > zCrit();
      expect(r.lo > 0 || r.hi < 0).toBe(mcnemar);
    }
  });
  it('all pairs discordant one way reaches the boundary', () => {
    const r = pairedProportion(range(20, () => 1), range(20, () => 0));
    expect(r.delta).toBe(1);
    expect(r.hi).toBe(1);
    expect(r.lo).toBeGreaterThan(0.5);
  });
  it('stratified: one stratum equals the plain interval; equal weights average the strata', () => {
    const x = range(50, (i) => (i < 30 ? 1 : 0));
    const y = range(50, (i) => (i < 20 ? 1 : 0));
    const one = stratifiedPairedProportion([[x, y]]);
    const plain = pairedProportion(x, y);
    expect(one.delta).toBeCloseTo(plain.delta, 12);
    expect(one.lo).toBeCloseTo(plain.lo, 12);
    expect(one.hi).toBeCloseTo(plain.hi, 12);
    const two = stratifiedPairedProportion([[x, y], [y, y]]);
    expect(two.delta).toBeCloseTo(0.1, 12);
    expect(two.hi - two.lo).toBeLessThan(plain.hi - plain.lo);
  });
  it('isBinary', () => {
    expect(isBinary([0, 1, 1])).toBe(true);
    expect(isBinary([0, 2])).toBe(false);
  });
});

describe('censored quantiles', () => {
  it('inverse empirical CDF with losses as +Infinity', () => {
    expect(censoredQuantile([3, 1, Infinity, Infinity], 0.5)).toBe(3);
    expect(censoredQuantile([3, 1, Infinity, Infinity], 0.6)).toBe(Infinity);
    expect(censoredQuantile([], 0.5)).toBeNull();
  });
  it('order-statistic interval: median of 1..100 is [x(40), x(61)]', () => {
    const r = quantileInterval(range(100, (i) => i + 1), 0.5);
    expect(r).toMatchObject({ est: 50, lo: 40, hi: 61, method: 'order-stat' });
  });
  it('order-statistic interval is unbounded where the sample cannot reach', () => {
    const r = quantileInterval([5, 6, 7, 8], 0.9);
    expect(r.hi).toBe(Infinity);
    const wins = quantileInterval([...range(10, (i) => i + 1), ...range(90, () => Infinity)], 0.5);
    expect(wins.est).toBe(Infinity);
    expect(wins.lo).toBe(Infinity);
  });
});

describe('paired bootstrap', () => {
  const x = range(200, (i) => ((i * 37) % 101) + 10);
  it('is deterministic for a seed and pairs by fight index', () => {
    const a = pairedQuantileDiff(x, x.map((v) => v + 5), 0.5, { seed: 3 });
    expect(a).toEqual(pairedQuantileDiff(x, x.map((v) => v + 5), 0.5, { seed: 3 }));
    // a constant shift survives every resample exactly
    expect(a.delta).toBe(-5);
    expect(a.lo).toBe(-5);
    expect(a.hi).toBe(-5);
    expect(a.method).toBe('paired-bootstrap');
  });
  it('two infinite quantiles differ by 0, not NaN', () => {
    const inf = range(50, () => Infinity);
    const r = pairedQuantileDiff(inf, inf, 0.5, { B: 200 });
    expect(r.delta).toBe(0);
    expect(r.lo).toBe(0);
    expect(r.hi).toBe(0);
  });
  it('covers a noisy zero difference', () => {
    const y = x.map((v, i) => v + ((i * 13) % 7) - 3);
    const r = pairedBootstrap(x, y, (s) => s.reduce((p, v) => p + v, 0) / s.length, { seed: 1 });
    expect(r.lo).toBeLessThan(r.delta);
    expect(r.hi).toBeGreaterThan(r.delta);
  });
});
