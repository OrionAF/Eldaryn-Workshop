import { describe, it, expect } from 'vitest';
import { race } from './race.js';
import { pairedT, meanInterval } from '../engine/stats/index.js';
import { hashSeed, mulberry32 } from '../engine/rng.js';

// A synthetic mean objective: fight i of an arm = common noise of fight i (common random numbers)
// + the arm's own effect + a little own noise. Arms with equal `id` draw equal own noise.
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const objective = {
  higherIsBetter: true,
  deltaKind: 'relative',
  score: (s) => mean(s.main[0]),
  contrast: (x, y, { alpha }) => ({ ...pairedT(x.main[0], y.main[0], { alpha }), ref: meanInterval(y.main[0]).est }),
};
function gauss(rng) {
  let u = 0;
  while (!u) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
const fight = (arm, i) => {
  const common = gauss(mulberry32(hashSeed('common', i)));
  const own = gauss(mulberry32(hashSeed('own', arm.noise ?? arm.key, i)));
  return 1000 + 50 * common + arm.sd * own + arm.effect;
};
function getter() {
  const calls = new Map();
  return {
    calls,
    getSet: async (arm, n) => {
      calls.set(arm.key, Math.max(calls.get(arm.key) ?? 0, n));
      return { main: [Array.from({ length: n }, (_, i) => fight(arm, i))], side: {}, n };
    },
  };
}
const arm = (key, effect, o = {}) => ({ key, effect, sd: 5, dist: 1, ...o });
const effort = (o = {}) => ({ alpha: 0.05, delta: 0.005, deltaKind: 'relative', n0: 8, maxN: 256, ...o });

describe('race', () => {
  it('a clearly better arm wins; clearly worse arms leave at the first look', async () => {
    const g = getter();
    const arms = [arm('x', 0, { dist: 0 }), arm('good', 100), arm('bad1', -100), arm('bad2', -200)];
    const r = await race(arms, { objective, getSet: g.getSet, effort: effort(), seed: 1 });
    expect(r.winner).toBe(1);
    expect(r.leader).toBe(1);
    expect(r.eliminated.map((e) => e.i).sort()).toEqual([0, 2, 3]);
    expect(g.calls.get('bad2')).toBe(8); // eliminated at the first look: never sampled further
    expect(r.unresolved).toEqual([]);
    expect(r.alphaLook).toBeCloseTo(0.05 / 4 / 6, 12); // Bonferroni over 4 arms x 6 looks (8, 16, ..., 256)
  });

  it('arms equal in effect tie, and the tie goes to the arm nearest the baseline', async () => {
    const g = getter();
    const arms = [arm('far', 50, { dist: 3, noise: 'twin' }), arm('near', 50, { dist: 1, noise: 'twin' }), arm('worse', -100)];
    const r = await race(arms, { objective, getSet: g.getSet, effort: effort(), seed: 1 });
    expect(r.winner).toBe(1);
    expect(r.ties).toEqual([0]);
  });

  it('arms too close to call at maxN are reported unresolved, not eliminated', async () => {
    const g = getter();
    const arms = [arm('x', 0, { dist: 0, sd: 40 }), arm('y', 1, { sd: 40 })];
    const r = await race(arms, { objective, getSet: g.getSet, effort: effort({ maxN: 16, delta: 0 }), seed: 1 });
    expect(r.unresolved.map((u) => u.i)).toHaveLength(1);
    expect(r.unresolved[0].contrast.verdict).toBe('unresolved');
    expect(r.n).toBe(16);
  });

  it('a single arm needs no fights', async () => {
    const g = getter();
    const r = await race([arm('x', 0)], { objective, getSet: g.getSet, effort: effort(), seed: 1 });
    expect(r).toMatchObject({ winner: 0, leader: 0, ties: [], looks: 0, n: 0 });
    expect(g.calls.size).toBe(0);
  });

  it('is deterministic', async () => {
    const arms = [arm('x', 0, { dist: 0 }), arm('a', 3, { sd: 20 }), arm('b', 2, { sd: 20 }), arm('c', -1, { sd: 20 })];
    const a = await race(arms, { objective, getSet: getter().getSet, effort: effort({ maxN: 64 }), seed: 1 });
    const b = await race(arms, { objective, getSet: getter().getSet, effort: effort({ maxN: 64 }), seed: 1 });
    expect(b).toEqual(a);
  });
});
