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

/**
 * SETTLED GAME RULE (owner ruling 2026-07-28), pinned in all three engines:
 * dps.test.js covers the closed form, pvpSimulation.test.js the duel engine,
 * this covers the PVE sim. Certain crit + certain double hit makes every rng
 * path identical, so the total is exact, not sampled.
 */
it('the double-hit second strike cannot crit', () => {
  const stats = S({ attack: 100, speed: 100, crit: 100, crit_mult: 200, double_hit: 100 });
  const result = sim.runSimulation({ stats, iterations: 20, seed: 3 });
  // Per swing: main hit crits (200) + double hit at normal damage (100) = 300.
  expect(result.totalDamage.min).toBe(300 * 60);
  expect(result.totalDamage.max).toBe(300 * 60);
  // 400 * 60 is what a critting double hit would give.
  expect(result.totalDamage.max).not.toBe(400 * 60);
});

// --- Paired preset comparison ---
it('compareSimulations: identical builds tie exactly (paired RNG), zero CI', () => {
  const stats = S({ attack: 80, speed: 130, crit: 40, crit_mult: 220, double_hit: 25 });
  const result = sim.compareSimulations({ statsA: stats, statsB: stats, iterations: 100, seed: 11 });
  expect(result.delta.meanDps).toBe(0);
  expect(result.delta.ciHalfWidthDps).toBe(0);
  expect(result.a.meanDps).toBe(result.b.meanDps);
});

it('compareSimulations: degenerate no-proc builds give the exact closed-form delta', () => {
  const result = sim.compareSimulations({
    statsA: S(FLAT), // 100 attack -> 6000 total, 100 DPS
    statsB: S({ ...FLAT, attack: 110 }), // -> 6600 total, 110 DPS
    iterations: 50,
    seed: 12,
  });
  expect(result.a.meanDps).toBe(100);
  expect(result.b.meanDps).toBe(110);
  expect(result.delta.meanDps).toBe(10);
  expect(result.delta.ciHalfWidthDps).toBe(0); // no variance in either build
  expect(result.delta.pct).toBeCloseTo(10, 9);
});

it('compareSimulations: same seed reproduces the same comparison', () => {
  const opts = {
    statsA: S({ attack: 80, speed: 130, crit: 40, crit_mult: 220, double_hit: 25 }),
    statsB: S({ attack: 90, speed: 120, crit: 30, crit_mult: 200, double_hit: 10 }),
    iterations: 100,
    seed: 13,
  };
  expect(sim.compareSimulations(opts)).toEqual(sim.compareSimulations(opts));
});

// --- Histogram + damage-by-source aggregation ---
it('histogram: bin counts sum to iterations, span [min, max]; a zero-variance batch collapses to one bin', () => {
  const noisy = sim.runSimulation({
    stats: S({ attack: 80, speed: 130, crit: 40, crit_mult: 220, double_hit: 25 }),
    iterations: 300,
    seed: 5,
  });
  expect(noisy.histogram.bins.reduce((a, b) => a + b, 0)).toBe(300);
  expect(noisy.histogram.min).toBe(noisy.totalDamage.min);
  expect(noisy.histogram.max).toBe(noisy.totalDamage.max);
  expect(noisy.histogram.bins.length).toBe(24);

  const flat = sim.runSimulation({ stats: S(FLAT), iterations: 50, seed: 1 });
  expect(flat.histogram.bins).toEqual([50]);
});

it('damageByTag: mean per source, sorted descending; degenerate profile is 100% swings', () => {
  const flat = sim.runSimulation({ stats: S(FLAT), iterations: 20, seed: 3 });
  expect(flat.damageByTag).toEqual({ swing: 6000 });

  const mixed = sim.runSimulation({
    stats: S({ attack: 100, speed: 100, crit: 0, crit_mult: 150, double_hit: 100 }),
    iterations: 20,
    seed: 4,
  });
  // 100% double hit: every swing adds an equal extra hit, so the two tags tie.
  expect(mixed.damageByTag.swing).toBe(6000);
  expect(mixed.damageByTag.double_hit).toBe(6000);
  const values = Object.values(mixed.damageByTag);
  expect([...values].sort((a, b) => b - a)).toEqual(values);
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
  // The float tick accumulator keeps non-tick-divisible speeds exact:
  // 120% would drift to 73 swings if intervals rounded to whole ticks.
  for (const [speed, expected] of [[150, 90], [120, 72], [100, 60], [315, 189], [400, 240]]) {
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
  // Swings on ticks 1, 401, ... (t ~= 0..59). Poison lands at t+1..t+3 but
  // only strictly before the 60s horizon: swings 0..56 get 3 ticks (171),
  // swing 57 gets 2, swing 58 gets 1, swing 59 gets 0.
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
