import { describe, it, expect } from 'vitest';
import { holmSequential, remainderOf, gainOf } from './minimise.js';
import { compareSets } from './sampler.js';
import { pairedT, meanInterval } from '../engine/stats/index.js';
import { hashSeed, mulberry32 } from '../engine/rng.js';

const set = (xs) => ({ main: [xs], side: {}, n: xs.length });

describe('holmSequential', () => {
  it('runs every test at alpha / m, then the rest at the looser level after each rejection', async () => {
    const seen = [];
    // p-like thresholds: test i is significant when its level is at least `need[i]`
    const need = [0.01, 0.02, 0.2];
    const out = await holmSequential([0, 1, 2], 0.06, async (i, a) => {
      seen.push([i, a]);
      return { significant: a >= need[i], verdict: a >= need[i] ? 'better' : 'unresolved' };
    });
    expect(seen.map(([i, a]) => [i, Number(a.toFixed(4))])).toEqual([[0, 0.02], [1, 0.02], [2, 0.02], [2, 0.06]]);
    expect(out.map((c) => c.verdict)).toEqual(['better', 'better', 'unresolved']);
    expect(out[2].alphaAdj).toBeCloseTo(0.06, 12);
  });

  it('an empty family is empty', async () => {
    expect(await holmSequential([], 0.05, async () => ({}))).toEqual([]);
  });
});

describe('gainOf', () => {
  it('signs a delta in the objective direction', () => {
    expect(gainOf({ delta: 5, higherIsBetter: true })).toBe(5);
    expect(gainOf({ delta: 5, higherIsBetter: false })).toBe(-5);
    expect(gainOf({ delta: Infinity })).toBeNull();
  });
});

describe('remainderOf', () => {
  const meanObj = { statistic: 'mean' };
  const rng = mulberry32(hashSeed('remainder-test'));
  const noise = Array.from({ length: 64 }, () => rng() * 100);
  const B = noise.map((x) => 1000 + x);
  const own1 = B.map((x) => x + 10);
  const own2 = B.map((x) => x + 20);

  it('additive changes leave no remainder', () => {
    const r = remainderOf(meanObj, set(B.map((x) => x + 30)), set(B), [set(own1), set(own2)]);
    expect(r.delta).toBeCloseTo(0, 9);
    expect(r.method).toBe('paired-t');
  });

  it('an interaction shows up as the remainder', () => {
    const r = remainderOf(meanObj, set(B.map((x) => x + 50)), set(B), [set(own1), set(own2)]);
    expect(r.delta).toBeCloseTo(20, 9);
  });

  it('quantile objectives bootstrap the remainder of the quantile differences', () => {
    const q = { statistic: 'censored-quantile', q: 0.5 };
    const r = remainderOf(q, set(B.map((x) => x - 30)), set(B), [set(B.map((x) => x - 10)), set(B.map((x) => x - 20))], { seed: 3 });
    expect(r.method).toBe('bootstrap');
    expect(r.delta).toBeCloseTo(0, 9);
    expect(r.lo).toBeLessThanOrEqual(r.delta);
    expect(r.hi).toBeGreaterThanOrEqual(r.delta);
  });
});

// #74: the best of 11 finalists equal to the baseline used to be flagged significant in ~13 % of runs
// (selected and tested on the same tier-2 samples, unadjusted). The driver confirms rows on their own
// seed with Holm across rows; under the null the top row may be flagged in at most 5 % of runs.
describe('confirm calibration (null finalists)', () => {
  const objective = {
    higherIsBetter: true, deltaKind: 'relative',
    contrast: (x, y, { alpha }) => ({ ...pairedT(x.main[0], y.main[0], { alpha }), ref: meanInterval(y.main[0]).est }),
  };
  function gauss(r) {
    let u = 0;
    while (!u) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }
  it('11 null rows: a row is flagged better in at most 5 % of 400 runs', async () => {
    const RUNS = 400;
    const K = 11;
    const N = 64;
    const rho = 0.16; // CRN correlation measured on the real Warrior (audit null.mjs)
    let flagged = 0;
    for (let t = 0; t < RUNS; t++) {
      const common = Array.from({ length: N }, (_, i) => gauss(mulberry32(hashSeed('c', t, i))));
      const build = (k) => common.map((c, i) => 1e5 + 1e3 * (Math.sqrt(rho) * c + Math.sqrt(1 - rho) * gauss(mulberry32(hashSeed('o', t, k, i)))));
      const base = set(build('base'));
      const rows = Array.from({ length: K }, (_, k) => set(build(k)));
      const res = await holmSequential(rows, 0.05, (x, a) => compareSets(objective, async () => x, async () => base, { alpha: a, delta: 0.005, n0: N, maxN: N }));
      if (res.some((c) => c.verdict === 'better')) flagged++;
    }
    expect(flagged / RUNS).toBeLessThanOrEqual(0.05);
  });
});
