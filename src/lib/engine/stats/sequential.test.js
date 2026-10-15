import { describe, it, expect } from 'vitest';
import { lookSchedule, perLookAlpha, decide, nNeeded, compare, compareAsync, deltaAbs } from './sequential.js';
import { zQuantile } from './tdist.js';

const range = (n, f) => Array.from({ length: n }, (_, i) => f(i));

describe('sequential comparator', () => {
  it('looks double from n0 and end at maxN', () => {
    expect(lookSchedule(16, 128)).toEqual([16, 32, 64, 128]);
    expect(lookSchedule(16, 100)).toEqual([16, 32, 64, 100]);
    expect(lookSchedule(8, 8)).toEqual([8]);
    expect(perLookAlpha(0.05, [16, 32, 64, 100])).toBe(0.0125);
    expect(() => lookSchedule(0, 10)).toThrow();
  });
  it('decide: sign first, then the indifference zone', () => {
    expect(decide({ lo: 0.1, hi: 2 }, 1)).toBe('better');
    expect(decide({ lo: -2, hi: -0.1 }, 1)).toBe('worse');
    expect(decide({ lo: 0.1, hi: 2 }, 1, false)).toBe('worse');
    expect(decide({ lo: -0.5, hi: 0.5 }, 1)).toBe('equivalent');
    expect(decide({ lo: -0.5, hi: 1.5 }, 1)).toBeNull();
    expect(decide({ lo: -0.5, hi: 0.5 }, 0)).toBeNull();
    expect(decide({ lo: null, hi: null }, 1)).toBeNull();
  });
  it('relative zones scale by the reference', () => {
    expect(deltaAbs(0.01, 'relative', 2000)).toBe(20);
    expect(deltaAbs(0.03, 'absolute', 2000)).toBe(0.03);
    expect(deltaAbs(0.01, 'relative', Infinity)).toBe(0);
  });
  it('nNeeded = ((z(1 - a/2) + z(0.8)) sd / max(|D|, d))^2', () => {
    const z = zQuantile(0.975) + zQuantile(0.8);
    expect(nNeeded({ sd: 10, delta: 1, alpha: 0.05 })).toBe(Math.ceil((z * 10) ** 2));
    expect(nNeeded({ sd: 10, delta: 0.1, deltaMin: 2, alpha: 0.05 })).toBe(Math.ceil(((z * 10) / 2) ** 2));
    expect(nNeeded({ sd: null, delta: 1 })).toBeNull();
  });
  it('a clear paired improvement stops at the first look', () => {
    const y = range(1024, (i) => (i * 7919) % 100);
    const x = y.map((v, i) => v + 5 + (i % 3));
    const r = compare((n) => x.slice(0, n), (n) => y.slice(0, n), { n0: 16, maxN: 1024, delta: 0.01, deltaKind: 'relative' });
    expect(r).toMatchObject({ verdict: 'better', significant: true, n: 16, looks: 1, method: 'paired-t', nNeeded: null });
    expect(r.alphaAdj).toBeCloseTo(0.05 / 7, 12);
    expect(r.delta).toBeGreaterThan(0);
  });
  it('identical builds resolve equivalent; a noisy tiny effect ends unresolved with nNeeded', () => {
    const y = range(256, (i) => (i * 7919) % 100);
    const same = compare((n) => y.slice(0, n), (n) => y.slice(0, n), { n0: 16, maxN: 256, delta: 1 });
    expect(same.verdict).toBe('equivalent');
    const x = y.map((v, i) => v + (i % 2 ? 40 : -39.5));
    const r = compare((n) => x.slice(0, n), (n) => y.slice(0, n), { n0: 16, maxN: 64, delta: 1 });
    expect(r.verdict).toBe('unresolved');
    expect(r.n).toBe(64);
    expect(r.significant).toBe(false);
    expect(r.nNeeded).toBeGreaterThan(64);
  });
  it('proportion and quantile statistics; lower-is-better flips the verdict', () => {
    const y = range(512, (i) => (i % 2));
    const x = y.map((v, i) => (i % 5 === 0 ? 1 : v));
    const p = compare((n) => x.slice(0, n), (n) => y.slice(0, n), { statistic: 'proportion', n0: 64, maxN: 512, delta: 0.02 });
    expect(p.method).toBe('tango');
    expect(p.verdict).toBe('better');
    const t = range(256, (i) => 1000 + ((i * 37) % 200));
    const slower = t.map((v) => v + 50);
    const q = compare((n) => slower.slice(0, n), (n) => t.slice(0, n),
      { statistic: 'quantile', q: 0.5, higherIsBetter: false, n0: 32, maxN: 256, delta: 0.01, deltaKind: 'relative', B: 500 });
    expect(q.method).toBe('paired-bootstrap');
    expect(q.verdict).toBe('worse');
  });
  it('compareAsync matches compare', async () => {
    const y = range(256, (i) => (i * 7919) % 100);
    const x = y.map((v, i) => v + (i % 4));
    const o = { n0: 16, maxN: 256, delta: 0.5 };
    const sync = compare((n) => x.slice(0, n), (n) => y.slice(0, n), o);
    const as = await compareAsync(async (n) => x.slice(0, n), async (n) => y.slice(0, n), o);
    expect(as).toEqual(sync);
  });
  it('rejects a non-finite sampler outcome instead of returning a poisoned interval', () => {
    const ok = (n) => range(n, (i) => i % 3);
    const bad = (n) => range(n, (i) => (i === 2 ? NaN : i % 3));
    const inf = (n) => range(n, (i) => (i === 2 ? -Infinity : i % 3));
    const o = { n0: 8, maxN: 16 };
    expect(() => compare(bad, ok, o)).toThrow(RangeError);
    expect(() => compare(ok, inf, o)).toThrow(/non-finite/);
    // +Infinity is a censored loss, which only the quantile statistic understands
    const lost = (n) => range(n, (i) => (i % 2 ? Infinity : i));
    expect(() => compare(lost, ok, { ...o, statistic: 'mean' })).toThrow(RangeError);
    expect(() => compare(lost, ok, { ...o, statistic: 'quantile' })).not.toThrow();
  });
});
