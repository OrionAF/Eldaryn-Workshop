// A5: calibration of the race's futility stop on synthetic arms (no engine). Contract:
// docs/Reference/simulation.md §Search (racing). Fight i of an arm = 1000 + common noise of fight i
// (common random numbers) + the arm's effect + its own noise, so δ = 0.5 % is about 5.
import { describe, it, expect } from 'vitest';
import { race } from './race.js';
import { pairedT, meanInterval } from '../engine/stats/index.js';
import { hashSeed, mulberry32 } from '../engine/rng.js';

const ALPHA = 0.05;
const DELTA = 5; // δ in the statistic's units (0.5 % of 1000)
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const objective = {
  higherIsBetter: true,
  deltaKind: 'relative',
  score: (s) => mean(s.main[0]),
  contrast: (x, y, { alpha }) => ({ ...pairedT(x.main[0], y.main[0], { alpha }), ref: meanInterval(y.main[0]).est }),
};
const effort = (o = {}) => ({ alpha: ALPHA, delta: 0.005, deltaKind: 'relative', n0: 8, maxN: 1024, ...o });

function gaussStream(seed) {
  const rng = mulberry32(seed);
  const xs = [];
  return (n) => {
    while (xs.length < n) {
      let u = 0;
      while (!u) u = rng();
      xs.push(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng()));
    }
    return xs;
  };
}

/** One race on its own seed: arms [{effect, dist}], arm 0 the baseline. Returns the result and fights per arm. */
async function runRace(arms, seed, o = {}) {
  const common = gaussStream(hashSeed('cal-common', seed));
  const own = arms.map((_, i) => gaussStream(hashSeed('cal-own', seed, i)));
  const calls = new Array(arms.length).fill(0);
  const list = arms.map((a, i) => ({ key: `a${i}`, dist: a.dist, i }));
  const getSet = async (a, n) => {
    calls[a.i] = Math.max(calls[a.i], n);
    const c = common(n);
    const e = own[a.i](n);
    const xs = new Array(n);
    for (let j = 0; j < n; j++) xs[j] = 1000 + 50 * c[j] + 10 * e[j] + arms[a.i].effect;
    return { main: [xs], side: {}, n };
  };
  const r = await race(list, { objective, getSet, effort: effort(o), seed });
  return { r, calls };
}

const RUNS = 400;
const others = (k, effect) => Array.from({ length: k }, () => ({ effect, dist: 1 }));

describe('race futility calibration (A5)', { timeout: 120000 }, () => {
  it('one arm truly better by 2δ is picked in at least 1 − α of races', async () => {
    let hits = 0;
    for (let s = 1; s <= RUNS; s++) {
      const arms = [{ effect: 0, dist: 0 }, ...others(2, 0), { effect: 2 * DELTA, dist: 1 }, ...others(1, 0)];
      const { r } = await runRace(arms, s);
      if (r.winner === 3) hits += 1;
    }
    expect(hits / RUNS).toBeGreaterThanOrEqual(1 - ALPHA);
  });

  it('with every arm equal, the arm nearest the baseline wins in at least 1 − α of races', async () => {
    let hits = 0;
    for (let s = 1; s <= RUNS; s++) {
      const { r } = await runRace([{ effect: 0, dist: 0 }, ...others(4, 0)], s);
      if (r.winner === 0) hits += 1;
    }
    expect(hits / RUNS).toBeGreaterThanOrEqual(1 - ALPHA);
  });

  it('arms slightly worse (−0.4δ) leave long before maxN: far fewer fights than the old rule', async () => {
    const runs = 100;
    const arms = [{ effect: 0, dist: 0 }, ...others(4, -0.4 * DELTA)];
    let fNew = 0;
    let fOld = 0;
    let wins = 0;
    for (let s = 1; s <= runs; s++) {
      const a = await runRace(arms, s, { maxN: 8192 });
      const b = await runRace(arms, s, { maxN: 8192, futility: false });
      if (a.r.winner === 0) wins += 1;
      fNew += a.calls.slice(1).reduce((x, y) => x + y, 0) / 4;
      fOld += b.calls.slice(1).reduce((x, y) => x + y, 0) / 4;
    }
    const factor = fOld / fNew;
    console.info(`A5 calibration: mean fights per worse arm ${(fOld / runs).toFixed(0)} (old) vs ${(fNew / runs).toFixed(0)} (futility), factor ${factor.toFixed(2)}`);
    expect(wins / runs).toBeGreaterThanOrEqual(1 - ALPHA);
    expect(factor).toBeGreaterThanOrEqual(3);
  });
});
