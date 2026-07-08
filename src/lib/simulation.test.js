/**
 * Tests simulation.js - the Monte Carlo battle simulator.
 *
 * The load-bearing invariant: the sim's mean total damage must converge to
 * computeDps(stats) * duration (dps.js is the closed-form expectation of
 * this engine's v1 effects). All stochastic assertions use fixed seeds so
 * they can never flake.
 */
import { describe, it, expect } from 'vitest';
import * as dps from './dps.js';
import * as sim from './simulation.js';

const S = dps.offensiveStats;

// Match the Python approx(): abs(a-b) <= tol * max(1, abs(b)).
function approx(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

const FLAT = { attack: 100, speed: 100, crit: 0, crit_mult: 150, double_hit: 0 };

// --- Determinism ---
it('same seed and inputs produce identical results', () => {
  const opts = { stats: S({ attack: 80, speed: 130, crit: 40, crit_mult: 220, double_hit: 25 }), iterations: 200, seed: 42 };
  const a = sim.runSimulation(opts);
  const b = sim.runSimulation(opts);
  expect(a).toEqual(b);
});

it('the seed is echoed back so an unseeded run can be replayed', () => {
  const result = sim.runSimulation({ stats: S(FLAT), iterations: 10 });
  const replay = sim.runSimulation({ stats: S(FLAT), iterations: 10, seed: result.seed });
  expect(replay).toEqual(result);
});

// --- Degenerate exactness ---
it('no crit/double-hit at base speed: every run is exactly attack * 60', () => {
  const result = sim.runSimulation({ stats: S(FLAT), iterations: 50, seed: 1 });
  expect(result.totalDamage.min).toBe(6000);
  expect(result.totalDamage.max).toBe(6000);
  expect(result.totalDamage.stdDev).toBe(0);
  expect(result.observed.meanSwings).toBe(60);
});

it('100% crit: every hit crits, total is exactly attack * critMult * 60', () => {
  const stats = S({ attack: 100, speed: 100, crit: 100, crit_mult: 200, double_hit: 0 });
  const result = sim.runSimulation({ stats, iterations: 20, seed: 2 });
  expect(result.totalDamage.min).toBe(12000);
  expect(result.totalDamage.max).toBe(12000);
  expect(approx(result.observed.critRate, 100)).toBe(true);
});

// --- Speed clamp + swing quantization ---
it('speed below 100 is clamped: speed 80 behaves exactly like speed 100', () => {
  const at80 = sim.runSimulation({ stats: S({ ...FLAT, speed: 80 }), iterations: 100, seed: 3 });
  const at100 = sim.runSimulation({ stats: S({ ...FLAT, speed: 100 }), iterations: 100, seed: 3 });
  expect(at80).toEqual(at100);
});

it('swing counts quantize exactly: speed 150 -> 90 swings, 120 -> 72, 100 -> 60', () => {
  for (const [speed, expected] of [[150, 90], [120, 72], [100, 60]]) {
    const run = sim.runSingle(S({ ...FLAT, speed }), { rng: sim.mulberry32(7) });
    expect(run.swings).toBe(expected);
  }
});

// --- Convergence to the closed-form expectation ---
it('sim mean converges to computeDps * 60 within 1% (mixed crit/double-hit profiles)', () => {
  const profiles = [
    S({ attack: 100, speed: 100, crit: 50, crit_mult: 200, double_hit: 0 }),
    S({ attack: 50, speed: 150, crit: 30, crit_mult: 250, double_hit: 20 }),
    S({ attack: 200, speed: 120, crit: 80, crit_mult: 180, double_hit: 40 }),
  ];
  for (const stats of profiles) {
    const result = sim.runSimulation({ stats, iterations: 10000, seed: 1234 });
    const expected = dps.computeDps(stats) * 60;
    expect(approx(result.totalDamage.mean, expected, 0.01)).toBe(true);
    expect(approx(result.meanDps * 60, result.totalDamage.mean)).toBe(true);
    expect(approx(result.expectedDps, dps.computeDps(stats))).toBe(true);
  }
});

it('observed crit and double-hit rates track the sheet values', () => {
  const stats = S({ attack: 100, speed: 100, crit: 60, crit_mult: 200, double_hit: 30 });
  const result = sim.runSimulation({ stats, iterations: 5000, seed: 99 });
  expect(approx(result.observed.critRate, 60, 0.03)).toBe(true);
  expect(approx(result.observed.doubleHitRate, 30, 0.03)).toBe(true);
});

// --- Percentile sanity ---
it('percentiles are ordered: min <= p5 <= p25 <= p50 <= p75 <= p95 <= max', () => {
  const stats = S({ attack: 100, speed: 100, crit: 50, crit_mult: 300, double_hit: 30 });
  const t = sim.runSimulation({ stats, iterations: 2000, seed: 5 }).totalDamage;
  expect(t.min).toBeLessThanOrEqual(t.p5);
  expect(t.p5).toBeLessThanOrEqual(t.p25);
  expect(t.p25).toBeLessThanOrEqual(t.p50);
  expect(t.p50).toBeLessThanOrEqual(t.p75);
  expect(t.p75).toBeLessThanOrEqual(t.p95);
  expect(t.p95).toBeLessThanOrEqual(t.max);
  expect(t.min).toBeLessThan(t.max); // this profile genuinely varies
});

// --- Effect extensibility (the future-Sigil contract) ---
it('a custom DoT effect schedules ticks on the timeline and drops ticks past the horizon', () => {
  // Sigil-shaped effect: every primary hit applies 3 poison ticks of 10 at +1/+2/+3s.
  const poison = {
    id: 'test-poison',
    onHit(hit, ctx) {
      if (hit.tag !== 'swing') return;
      for (const dt of [1, 2, 3]) {
        ctx.schedule(hit.time + dt, () => ctx.addDamage(10, 'poison'));
      }
    },
  };
  const run = sim.runSingle(S(FLAT), {
    rng: sim.mulberry32(11),
    effects: [...sim.DEFAULT_EFFECTS, poison],
  });
  // Swings at t=0..59. Ticks land at t+1..t+3 but only strictly before 60s:
  // swings 0..56 get 3 ticks (171), swing 57 gets 2, swing 58 gets 1, swing 59 gets 0.
  const expectedTicks = 171 + 2 + 1;
  expect(run.damageByTag.poison).toBe(expectedTicks * 10);
  expect(run.totalDamage).toBe(6000 + expectedTicks * 10);
});

it('a proc-chance modifier effect raises double-hit to 100% via modifySwing', () => {
  const procBoost = {
    id: 'test-proc-boost',
    modifySwing(swing) {
      swing.doubleHitChance = 100;
    },
  };
  const run = sim.runSingle(S(FLAT), {
    rng: sim.mulberry32(13),
    effects: [...sim.DEFAULT_EFFECTS, procBoost],
  });
  expect(run.doubleHits).toBe(run.swings);
  expect(run.totalDamage).toBe(6000 * 2); // every swing doubled at normal damage
});

it('run lifecycle hooks fire once per run', () => {
  let starts = 0;
  let ends = 0;
  const probe = { id: 'probe', onRunStart: () => { starts += 1; }, onRunEnd: () => { ends += 1; } };
  sim.runSingle(S(FLAT), { rng: sim.mulberry32(17), effects: [probe] });
  expect(starts).toBe(1);
  expect(ends).toBe(1);
});
