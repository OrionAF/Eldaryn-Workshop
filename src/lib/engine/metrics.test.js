import { describe, it, expect, beforeEach } from 'vitest';
import {
  dpsVsDummy, ttkVs, survival, pvpWinRate, pvpWinRateAsync, wilson, meanCI, quantile, pairedDelta,
  metricKey, clearMetricCache, metricCacheSize,
} from './metrics.js';
import { trainingDummy } from './pve/fight.js';

const stats = (o = {}) => ({
  totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, ...o,
});
const fighter = (o = {}) => ({ stats: stats(o), class: 'WARRIOR', spec: null, sigils: [] });

beforeEach(() => clearMetricCache());

describe('statistics', () => {
  it('wilson: 50/100 centres on 0.5 with the textbook interval', () => {
    const w = wilson(50, 100);
    expect(w.p).toBe(0.5);
    expect(w.lo).toBeCloseTo(0.4038, 3);
    expect(w.hi).toBeCloseTo(0.5962, 3);
  });
  it('wilson keeps 0/n and n/n inside [0, 1]', () => {
    expect(wilson(0, 20).lo).toBe(0);
    expect(wilson(20, 20).hi).toBe(1);
    // float error must never put a bound on the wrong side of p (seen at k = 0 in a cancelled duel run)
    for (let n = 1; n <= 400; n++) {
      for (const k of [0, n]) {
        const w2 = wilson(k, n);
        expect(w2.lo).toBeLessThanOrEqual(w2.p);
        expect(w2.hi).toBeGreaterThanOrEqual(w2.p);
      }
    }
    expect(wilson(0, 0).p).toBeNull();
  });
  it('meanCI uses the t interval: [1,2,3] -> 2 +/- 4.303 * 1 / sqrt(3)', () => {
    const r = meanCI([1, 2, 3]);
    expect(r.mean).toBe(2);
    expect(r.hi - r.mean).toBeCloseTo((4.303 * 1) / Math.sqrt(3), 6);
  });
  it('quantile interpolates', () => {
    expect(quantile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });
  it('pairedDelta of identical arrays plus a constant is exact and significant', () => {
    const a = [1, 2, 3, 4];
    const r = pairedDelta(a, a.map((x) => x + 2));
    expect(r.delta).toBe(2);
    expect(r.sd).toBe(0);
    expect(r.significant).toBe(true);
  });
});

describe('metrics', () => {
  it('dpsVsDummy: a plain fighter is exactly Attack * swings / 60 with a zero-width interval', () => {
    // speed 1 -> 60 swings, no crit/double: 1000 * 60 / 60 = 1000 DPS
    const r = dpsVsDummy(fighter(), { n: 8, seed: 3 });
    expect(r.mean).toBe(1000);
    expect(r.lo).toBe(1000);
    expect(r.hi).toBe(1000);
    expect(r.n).toBe(8);
    expect(r.aborted).toBe(false);
  });

  it('dpsVsDummy: a crit build has a nonzero interval that brackets the closed form', () => {
    const f = fighter({ totalCritChance: 50, totalCritDamage: 2 });
    const r = dpsVsDummy(f, { n: 32, seed: 7 });
    expect(r.hi).toBeGreaterThan(r.lo);
    expect(r.lo).toBeLessThan(1500);
    expect(r.hi).toBeGreaterThan(1500);
  });

  it('is deterministic in the seed and the cache returns the same object', () => {
    const f = fighter({ totalCritChance: 50 });
    const a = dpsVsDummy(f, { n: 8, seed: 1, cache: false });
    const b = dpsVsDummy(f, { n: 8, seed: 1, cache: false });
    expect(a).toEqual(b);
    expect(dpsVsDummy(f, { n: 8, seed: 2 })).not.toEqual(a);
    expect(metricCacheSize()).toBe(1);
    expect(dpsVsDummy(f, { n: 8, seed: 2 })).toBe(dpsVsDummy(f, { n: 8, seed: 2 }));
  });

  it('metricKey is a pure function of the inputs, independent of key order', () => {
    expect(metricKey('x', { a: 1, b: [2, { c: 3, d: 4 }] })).toBe(metricKey('x', { b: [2, { d: 4, c: 3 }], a: 1 }));
    expect(metricKey('x', { a: 1 })).not.toBe(metricKey('x', { a: 2 }));
    expect(metricKey('x', { a: 1 })).not.toBe(metricKey('y', { a: 1 }));
  });

  it('common random numbers: pairedDelta of a +10 % attack swap is tighter than the unpaired spread', () => {
    const base = fighter({ totalCritChance: 30, totalDoubleHit: 20 });
    const up = fighter({ totalCritChance: 30, totalDoubleHit: 20, totalAttack: 1100 });
    const a = dpsVsDummy(base, { n: 32, seed: 5, keepSamples: true });
    const b = dpsVsDummy(up, { n: 32, seed: 5, keepSamples: true });
    const p = pairedDelta(a.samples, b.samples);
    expect(p.significant).toBe(true);
    expect(p.delta).toBeGreaterThan(0);
    expect(p.sd).toBeLessThan(a.sd * 0.2);
  });

  it('ttkVs: a 5000 HP mob falls in exactly 5 swings (5 s) every time', () => {
    const r = ttkVs(fighter(), { id: 'm', hp: 5000, attack: 0, attackSpeed: 0 }, { n: 10, maxMs: 30000 });
    expect(r.p).toBe(1);
    expect(r.wins).toBe(10);
    expect(r.median).toBeGreaterThanOrEqual(5000);
    expect(r.median).toBeLessThanOrEqual(5100);
    expect(r.p90).toBe(r.median);
  });

  it('ttkVs: an unkillable dummy in 10 s is 0 wins with null times', () => {
    const r = ttkVs(fighter(), trainingDummy(), { n: 6, maxMs: 10000 });
    expect(r.wins).toBe(0);
    expect(r.p).toBe(0);
    expect(r.mean).toBeNull();
  });

  it('survival: a harmless mob is 1, a one-shot mob is 0', () => {
    const harmless = survival(fighter(), trainingDummy(), { n: 20, seconds: 10 });
    expect(harmless.p).toBe(1);
    const killer = { id: 'k', hp: 1e12, attack: 1e6, attackSpeed: 1 };
    const dead = survival(fighter(), killer, { n: 20, seconds: 10 });
    expect(dead.p).toBe(0);
    expect(dead.hi).toBeLessThan(0.2);
  });

  it('pvpWinRate: a much stronger attacker wins every duel; mirror duel timeouts are reported', () => {
    const strong = fighter({ totalAttack: 5000 });
    const weak = fighter({ totalAttack: 10 });
    const r = pvpWinRate(strong, weak, { n: 40, seed: 2 });
    expect(r.p).toBe(1);
    expect(r.lo).toBeGreaterThan(0.9);
    expect(r.timeoutShare).toBe(0);
    const t = pvpWinRate(fighter({ totalAttack: 0 }), fighter({ totalAttack: 0 }), { n: 4 });
    expect(t.p).toBe(0);
    expect(t.timeoutShare).toBe(1);
    expect(t.meanMs).toBe(60000);
  });
});

describe('cancel returns best-so-far', () => {
  it('a pre-aborted sync run returns n = 0 with aborted: true and is not cached', () => {
    const ac = new AbortController();
    ac.abort();
    const r = dpsVsDummy(fighter(), { n: 10, signal: ac.signal });
    expect(r).toMatchObject({ n: 0, aborted: true, mean: null });
    expect(metricCacheSize()).toBe(0);
  });

  it('an async run aborted part-way keeps the samples taken', async () => {
    const ac = new AbortController();
    const r = await pvpWinRateAsync(fighter(), fighter(), {
      n: 400, signal: ac.signal, onProgress: ({ done }) => { if (done === 5) ac.abort(); },
    });
    expect(r.aborted).toBe(true);
    expect(r.n).toBe(5);
    expect(metricCacheSize()).toBe(0);
  });
});
