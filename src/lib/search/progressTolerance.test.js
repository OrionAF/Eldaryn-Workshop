// The progress tolerance δ_progress (simulation.md §Win rate): progress contrasts between builds that never
// win tie inside √(δ / 2) of the step's HP, so close ones stop at the first look the rate decides.
// Synthetic arms on common random numbers (no engine).
import { describe, it, expect } from 'vitest';
import { makeObjective, resolveTarget } from './objectives.js';
import { compareSets, contrastSets, progressDelta, setOf } from './sampler.js';
import { race } from './race.js';
import { hashSeed, mulberry32 } from '../engine/rng.js';

const target = resolveTarget({ kind: 'custom', mob: { hp: 10, attack: 1, attackSpeed: 1 }, seconds: 10 });
const maxObj = makeObjective({ kind: 'win-chance' }, target);
const tgtObj = makeObjective({ kind: 'win-rate', target: 0.7 }, target);
const STANDARD = { alpha: 0.05, delta: 0.01, deltaKind: 'absolute', n0: 16, maxN: 32768 };

// fight i: one shared uniform decides wins (nested across arms), a shared progress shock, and each arm's own
// noise of width `noise`; a loss scores its reach plus both, kept in [0, 1)
const unif = (...k) => mulberry32(hashSeed('progress-tol-test', ...k))();
function armSet(arm, n, rep) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    if (unif(rep, i, 'u') < (arm.p ?? 0)) out[i] = 1.5;
    else out[i] = Math.min(0.999, Math.max(0, arm.reach + 0.2 * (unif(rep, i, 'shock') - 0.5) + (arm.noise ?? 0.4) * (unif(rep, i, arm.key) - 0.5)));
  }
  return setOf([out]);
}
const getter = (arm, rep, drawn) => async (n) => {
  drawn?.set(arm.key, Math.max(drawn.get(arm.key) ?? 0, n));
  return armSet(arm, n, rep);
};

// the first look at which the rate alone is decided (equivalent): the earliest a progress contrast can stop
async function firstRateLook(o, x, y, rep) {
  const rateOnly = { ...o, contrast: (a, b, opts) => ({ ...o.contrast(a, b, opts), then: null }) };
  return (await compareSets(rateOnly, getter(x, rep), getter(y, rep), { ...STANDARD, seed: 1 })).n;
}

describe('δ_progress', () => {
  it('is √(δ / 2), never finer than δ, and 0 without a δ', () => {
    expect(progressDelta(0.01)).toBeCloseTo(Math.sqrt(0.005), 12);
    expect(progressDelta(0.02)).toBeCloseTo(0.1, 12);
    expect(progressDelta(0.6)).toBe(0.6);
    expect(progressDelta(0)).toBe(0);
  });
});

describe('progress contrasts between builds that never win', () => {
  it('close progress resolves equivalent at the first look that decides the rate', async () => {
    const x = { key: 'x', reach: 0.508 };
    const y = { key: 'y', reach: 0.5 };
    for (const o of [maxObj, tgtObj]) {
      const first = await firstRateLook(o, x, y, 0);
      const c = await compareSets(o, getter(x, 0), getter(y, 0), { ...STANDARD, seed: 1 });
      // before δ_progress the margin took δ (1 point of HP): 'better' at 8 192 fights, not a tie at 1 024
      expect(c).toMatchObject({ verdict: 'equivalent', n: first });
      expect(first).toBeLessThanOrEqual(2048);
    }
  });

  it('a build that clearly progresses further still wins, even by less than δ_progress', async () => {
    for (const [reach, noise] of [[0.6, 0.4], [0.53, 0.05]]) {
      const x = { key: 'x', reach, noise };
      const y = { key: 'y', reach: 0.5, noise };
      for (const o of [maxObj, tgtObj]) {
        const c = await compareSets(o, getter(x, 1), getter(y, 1), { ...STANDARD, seed: 1 });
        expect(c).toMatchObject({ verdict: 'better', basis: 'margin' });
        const w = await compareSets(o, getter(y, 1), getter(x, 1), { ...STANDARD, seed: 1 });
        expect(w).toMatchObject({ verdict: 'worse', basis: 'margin' });
      }
    }
  });

  it('the progress zone is reported on the contrast; a margin between builds with wins keeps δ', () => {
    const x0 = armSet({ key: 'x', reach: 0.6, noise: 0.05 }, 2048, 2);
    const y0 = armSet({ key: 'y', reach: 0.5, noise: 0.05 }, 2048, 2);
    expect(contrastSets(maxObj, x0, y0, { ...STANDARD, alpha: 0.05 / 12 })).toMatchObject({ basis: 'margin', zone: progressDelta(0.01) });
    // both below a 70% target with wins: the margin mixes wins and progress, and its zone stays δ
    const x1 = armSet({ key: 'x', p: 0.2, reach: 0.6, noise: 0.05 }, 2048, 2);
    const y1 = armSet({ key: 'y', p: 0.2, reach: 0.5, noise: 0.05 }, 2048, 2);
    expect(contrastSets(tgtObj, x1, y1, { ...STANDARD, alpha: 0.05 / 12 })).toMatchObject({ basis: 'margin', zone: 0.01 });
  });

  it('a never-win race with close progress ends at the first decisive looks, not at maxN', async () => {
    const arms = [
      { key: 'base', dist: 0, reach: 0.5 },
      { key: 'a', dist: 1, reach: 0.505 },
      { key: 'b', dist: 1, reach: 0.497 },
      { key: 'c', dist: 1, reach: 0.509 },
      { key: 'd', dist: 2, reach: 0.502 },
    ];
    for (const o of [maxObj, tgtObj]) {
      const drawn = new Map();
      const r = await race(arms, { objective: o, getSet: (arm, n) => getter(arm, 3, drawn)(n), effort: STANDARD, seed: 1 });
      const fights = [...drawn.values()].reduce((s, n) => s + n, 0);
      // before δ_progress: 4 096 fights per arm and 13 312 in all (the rule now takes 5 120)
      expect(r.n).toBeLessThanOrEqual(2048);
      expect(fights).toBeLessThanOrEqual(5 * 2048);
      expect(r.unresolved).toEqual([]);
      expect(arms[r.winner].key).toBe('base');
    }
  });
});
