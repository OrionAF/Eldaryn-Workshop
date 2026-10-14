// Monte-Carlo calibration of the sequential comparator on synthetic paired data (no engine):
// the error rates docs/Reference/simulation.md §Statistics promises.
import { describe, it, expect } from 'vitest';
import { compare } from './sequential.js';
import { mulberry32, hashSeed } from '../rng.js';

const REPS = 2000;
// One-sided false 'better' rate is at most alpha / 2; allow three Monte-Carlo standard errors.
const bound = 0.025 + 3 * Math.sqrt((0.025 * 0.975) / REPS);

function normal(rng) {
  const u = 1 - rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Paired normal outcomes, sd 1 each, correlation 0.5 (common random numbers), X shifted by `eff`. */
function meanPair(r, eff) {
  const rng = mulberry32(hashSeed('calibration-mean', eff, r));
  const X = [];
  const Y = [];
  const grow = (n) => {
    while (X.length < n) {
      const c = normal(rng) * Math.SQRT1_2;
      X.push(c + normal(rng) * Math.SQRT1_2 + eff);
      Y.push(c + normal(rng) * Math.SQRT1_2);
    }
  };
  return [(n) => (grow(n), X), (n) => (grow(n), Y)];
}

/** Paired 0/1 outcomes around p = 0.5 sharing their uniform 70 % of the time, X shifted by `eff`. */
function binaryPair(r, eff) {
  const rng = mulberry32(hashSeed('calibration-binary', eff, r));
  const X = [];
  const Y = [];
  const grow = (n) => {
    while (X.length < n) {
      const c = rng();
      X.push((rng() < 0.7 ? c : rng()) < 0.5 + eff ? 1 : 0);
      Y.push((rng() < 0.7 ? c : rng()) < 0.5 ? 1 : 0);
    }
  };
  return [(n) => (grow(n), X), (n) => (grow(n), Y)];
}

function run(make, eff, opts) {
  const counts = { better: 0, worse: 0, equivalent: 0, unresolved: 0 };
  for (let r = 0; r < REPS; r++) {
    const [gx, gy] = make(r, eff);
    counts[compare(gx, gy, opts).verdict]++;
  }
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / REPS]));
}

describe('sequential comparator calibration', () => {
  const MEAN = { statistic: 'mean', delta: 0.25, n0: 32, maxN: 2048 };
  const PROP = { statistic: 'proportion', delta: 0.05, n0: 64, maxN: 4096 };

  it('null paired means: false "better" at most alpha/2 (Monte-Carlo error allowed)', () => {
    const r = run(meanPair, 0, MEAN);
    expect(r.better).toBeLessThanOrEqual(bound);
    expect(r.worse).toBeLessThanOrEqual(bound);
    expect(r.unresolved).toBe(0);
  });

  it('null paired proportions: false "better" at most alpha/2', () => {
    const r = run(binaryPair, 0, PROP);
    expect(r.better).toBeLessThanOrEqual(bound);
    expect(r.worse).toBeLessThanOrEqual(bound);
  });

  it('a true effect of delta/2 resolves (equivalent or better, never wrongly worse)', () => {
    const r = run(meanPair, MEAN.delta / 2, MEAN);
    expect(r.worse).toBeLessThanOrEqual(bound);
    expect(r.unresolved).toBe(0);
    // Inside the indifference zone both verdicts are correct; equivalence must be reached often.
    expect(r.equivalent).toBeGreaterThan(0.3);
  });

  it('a true effect of 2 delta is found better', () => {
    expect(run(meanPair, 2 * MEAN.delta, MEAN).better).toBeGreaterThan(0.99);
  });
});
