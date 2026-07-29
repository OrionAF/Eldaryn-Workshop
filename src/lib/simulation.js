/**
 * simulation.js - Monte Carlo 60-second World Boss battle simulator.
 *
 * Where dps.js computes the closed-form EXPECTED damage rate, this module
 * plays the fight out swing by swing on a timeline, rolling the random
 * events per swing, so repeated runs produce a damage DISTRIBUTION
 * (mean/percentiles/best/worst) instead of a point estimate. The engine
 * mean converges to computeDps(stats) * duration - simulation.test.js
 * asserts this, which keeps the two models honest against each other.
 *
 * The model this implements - the tick clock, the target-dummy scope, and the
 * closed-form/simulation convergence contract - is
 * docs/Reference/combat-model.md §5.
 *
 * THE ENGINE
 * ----------
 * A run is a min-heap of timed events on the shared 400-ticks-per-second
 * clock. Swings are recurring events every 40000 / speed ticks (speed 100% =
 * 400 ticks = exactly 1 swing/second, so a 60s fight is exactly 60 swings),
 * first swing on tick 1. Each swing fires on an integer tick, but the NEXT
 * swing time accrues on an exact float accumulator so rounding can neither
 * drift nor bias the attack rate (speed 120 is exactly 72 swings/60s, not
 * 73) - this is stricter than pvpSimulation's per-swing rounding, and the
 * reason this engine can be pinned to computeDps exactly. Speed is re-read as
 * each swing lands, so timed speed buffs shift the next interval. Events
 * strictly before the horizon tick fire; anything at or past it is dropped.
 *
 * The EFFECTS API below stays entirely in SECOND-space: ctx.time is
 * seconds, ctx.schedule takes seconds (converted to the nearest tick
 * internally) - sigilEffects.js knows nothing about ticks.
 *
 * SPEED CLAMP: the game's attack rate can never drop below the 100% base,
 * so speed is clamped to >= 100 before deriving the swing interval.
 *
 * EFFECTS
 * -------
 * The engine core knows nothing about crit or double-hit - all combat
 * mechanics are EffectDefs, objects of optional hooks:
 *
 *   onRunStart(ctx)            init per-run state, schedule timed events
 *   modifySwing(swing, ctx)    mutate swing.critChance/.critMult/
 *                              .doubleHitChance/.baseDamage BEFORE any roll
 *                              (the "increased proc chance" hook)
 *   resolveHit(hit, swing, ctx) transform a pending hit (crit rolls here)
 *   afterSwing(swing, ctx)     emit extra hits (double-hit lives here)
 *   onHit(hit, ctx)            observe every landed hit (DoT application)
 *   speedBonus(ctx)            extra Speed percentage points active right
 *                              now (timed speed buffs); sampled when each
 *                              next swing is scheduled
 *   onRunEnd(ctx)
 *
 * ctx exposes rng()/stats/time plus schedule(atTime, fn) for arbitrary
 * future events (DoT ticks, buff expiry), emitHit() for hits that run the
 * resolveHit/onHit chains, addDamage() for damage not tied to a hit
 * (DoT ticks), a per-effect state Map, and running counters.
 *
 * This shape exists for Sigils (poison/burn DoTs, proc-chance boosts,
 * timed buffs): sigilEffects.js builds one EffectDef per equipped active
 * sigil; the engine core never changes. DEFAULT_EFFECTS registers only
 * critEffect + doubleHitEffect - callers append sigil effects.
 *
 * ENGINE-LOCAL CONTRACT:
 *  - Double-hit rides every swing, so its frequency scales with Speed. The
 *    second strike cannot crit - a settled game rule, see combat-model.md §3.
 *  - The boss is a pure target dummy (model doc §5), so lifesteal and HP
 *    regen are irrelevant to damage output and ignored entirely here.
 *  - `stats` must be the final EFFECTIVE totals (post-curve), with attack as
 *    the displayed final Attack with Attack % already baked in. Passing raw
 *    totals silently overstates every overcapped stat - see model doc §1.
 */

import { computeDps } from './dps.js';

/**
 * The fixed-timestep combat clock: 400 ticks per second (the Speed hard
 * cap). Shared by this engine and pvpSimulation.js.
 */
export const TICKS_PER_SEC = 400;
export const secToTicks = (s) => Math.round(s * TICKS_PER_SEC);

// --- Seedable RNG ------------------------------------------------------

/** Standard mulberry32: 32-bit seeded PRNG, returns () => float in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Decorrelated per-iteration seed derived from one batch seed. */
function iterationSeed(baseSeed, iteration) {
  return (baseSeed + Math.imul(iteration, 0x9e3779b9)) >>> 0;
}

// --- Event min-heap -----------------------------------------------------

function heapPush(heap, event) {
  heap.push(event);
  let i = heap.length - 1;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (compareEvents(heap[i], heap[parent]) >= 0) break;
    [heap[i], heap[parent]] = [heap[parent], heap[i]];
    i = parent;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length > 0) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let smallest = i;
      if (left < heap.length && compareEvents(heap[left], heap[smallest]) < 0) smallest = left;
      if (right < heap.length && compareEvents(heap[right], heap[smallest]) < 0) smallest = right;
      if (smallest === i) break;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
  return top;
}

/** Time-ordered; `seq` (insertion order) breaks ties so runs are stable. */
function compareEvents(a, b) {
  return a.time - b.time || a.seq - b.seq;
}

// --- Built-in effects ---------------------------------------------------

/** The main hit's crit roll: Bernoulli(critChance), damage x critMult on success. */
export const critEffect = {
  id: 'crit',
  resolveHit(hit, swing, ctx) {
    if (!hit.canCrit) return;
    if (ctx.rng() < swing.critChance / 100) {
      hit.damage *= swing.critMult / 100;
      hit.isCrit = true;
    }
  },
};

/** Double Hit: Bernoulli(doubleHitChance) second strike, normal damage, cannot crit. */
export const doubleHitEffect = {
  id: 'double-hit',
  afterSwing(swing, ctx) {
    if (ctx.rng() < swing.doubleHitChance / 100) {
      ctx.emitHit({ damage: swing.baseDamage, canCrit: false, tag: 'double_hit' });
    }
  },
};

export const DEFAULT_EFFECTS = [critEffect, doubleHitEffect];

// --- Single run ---------------------------------------------------------

/**
 * Play one fight: `stats` (final capped totals), a duration, a per-run rng,
 * and the effect list. Returns { totalDamage, swings, crits, doubleHits,
 * damageByTag }.
 */
export function runSingle(stats, { durationSeconds = 60, rng, effects = DEFAULT_EFFECTS } = {}) {
  const durationTicks = secToTicks(durationSeconds);
  const heap = [];
  let seq = 0;

  const counters = { swings: 0, crits: 0, doubleHits: 0, damageByTag: {} };
  let totalDamage = 0;
  let currentSwing = null;

  const ctx = {
    rng,
    stats,
    time: 0, // seconds (tick / TICKS_PER_SEC) - the effects API is second-space
    state: new Map(),
    counters,
    schedule(atTime, fn) {
      heapPush(heap, { time: secToTicks(atTime), seq: seq++, fn });
    },
    addDamage(amount, tag = 'other') {
      totalDamage += amount;
      counters.damageByTag[tag] = (counters.damageByTag[tag] || 0) + amount;
    },
    emitHit({ damage, canCrit = false, tag = 'hit' }) {
      const hit = { damage, canCrit, tag, isCrit: false, time: ctx.time };
      for (const e of effects) e.resolveHit?.(hit, currentSwing, ctx);
      for (const e of effects) e.onHit?.(hit, ctx);
      if (hit.isCrit) counters.crits += 1;
      if (tag === 'double_hit') counters.doubleHits += 1;
      ctx.addDamage(hit.damage, tag);
      return hit;
    },
  };

  // Speed in force right now: base + any timed speed buffs, floored at 100.
  const speedNow = () => {
    let s = stats.speed || 0;
    for (const e of effects) s += e.speedBonus?.(ctx) || 0;
    return Math.max(100, s);
  };

  // Swings fire on integer ticks, but the NEXT swing time accrues on the
  // exact float tick accumulator `exactTick` (+ 40000/speed per swing), so
  // per-swing rounding never drifts or biases the attack rate. The interval
  // is derived from the speed in force when the current swing lands (a buff
  // expiring mid-interval doesn't retroactively stretch a scheduled swing).
  const scheduleSwing = (exactTick) => {
    heapPush(heap, {
      time: Math.round(exactTick),
      seq: seq++,
      fn: () => {
        counters.swings += 1;
        currentSwing = {
          time: ctx.time,
          baseDamage: stats.attack,
          critChance: stats.crit,
          critMult: stats.crit_mult,
          doubleHitChance: stats.double_hit,
        };
        for (const e of effects) e.modifySwing?.(currentSwing, ctx);
        ctx.emitHit({ damage: currentSwing.baseDamage, canCrit: true, tag: 'swing' });
        for (const e of effects) e.afterSwing?.(currentSwing, ctx);
        currentSwing = null;
        scheduleSwing(exactTick + 40000 / speedNow());
      },
    });
  };

  for (const e of effects) e.onRunStart?.(ctx);
  scheduleSwing(1);

  while (heap.length > 0 && heap[0].time < durationTicks) {
    const event = heapPop(heap);
    ctx.time = event.time / TICKS_PER_SEC;
    event.fn();
  }

  for (const e of effects) e.onRunEnd?.(ctx);

  return { totalDamage, ...counters };
}

// --- Batch + aggregation --------------------------------------------------

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

/**
 * Run `iterations` independent fights and aggregate the damage distribution.
 * Fully reproducible from `seed` (omitted -> random seed, echoed back in the
 * result so any run can be replayed).
 */
export function runSimulation({
  stats,
  durationSeconds = 60,
  iterations = 1000,
  seed,
  effects = DEFAULT_EFFECTS,
} = {}) {
  const baseSeed = (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;

  const totals = new Float64Array(iterations);
  let bestRun = null;
  let worstRun = null;
  let sumSwings = 0;
  let sumCrits = 0;
  let sumDoubleHits = 0;
  const tagSums = {};

  for (let i = 0; i < iterations; i++) {
    const rng = mulberry32(iterationSeed(baseSeed, i));
    const run = runSingle(stats, { durationSeconds, rng, effects });
    totals[i] = run.totalDamage;
    sumSwings += run.swings;
    sumCrits += run.crits;
    sumDoubleHits += run.doubleHits;
    for (const [tag, amount] of Object.entries(run.damageByTag)) {
      tagSums[tag] = (tagSums[tag] || 0) + amount;
    }
    if (!bestRun || run.totalDamage > bestRun.totalDamage) bestRun = run;
    if (!worstRun || run.totalDamage < worstRun.totalDamage) worstRun = run;
  }

  // Mean damage per source tag ('swing', 'double_hit', per-sigil tags…),
  // largest first - the "where does my damage come from" breakdown.
  const damageByTag = Object.fromEntries(
    Object.entries(tagSums)
      .map(([tag, total]) => [tag, iterations > 0 ? total / iterations : 0])
      .sort((a, b) => b[1] - a[1])
  );

  let sum = 0;
  for (let i = 0; i < iterations; i++) sum += totals[i];
  const mean = iterations > 0 ? sum / iterations : 0;
  let sqDiff = 0;
  for (let i = 0; i < iterations; i++) sqDiff += (totals[i] - mean) ** 2;
  const stdDev = iterations > 0 ? Math.sqrt(sqDiff / iterations) : 0;

  const sorted = Float64Array.from(totals).sort();

  // Equal-width bins across [min, max] for the distribution chart. A single
  // repeated value (or an empty batch) collapses to one bin so the shape is
  // always renderable.
  const histogram = (() => {
    if (sorted.length === 0) return { min: 0, max: 0, bins: [] };
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    if (max === min) return { min, max, bins: [sorted.length] };
    const binCount = 24;
    const bins = new Array(binCount).fill(0);
    const width = (max - min) / binCount;
    for (let i = 0; i < sorted.length; i++) {
      bins[Math.min(binCount - 1, Math.floor((sorted[i] - min) / width))] += 1;
    }
    return { min, max, bins };
  })();

  return {
    iterations,
    durationSeconds,
    seed: baseSeed,
    totalDamage: {
      mean,
      stdDev,
      min: sorted.length ? sorted[0] : 0,
      max: sorted.length ? sorted[sorted.length - 1] : 0,
      p5: percentile(sorted, 0.05),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p95: percentile(sorted, 0.95),
    },
    histogram,
    damageByTag,
    meanDps: durationSeconds > 0 ? mean / durationSeconds : 0,
    // Same speed clamp the runs use, so mean and expectation stay comparable.
    expectedDps: computeDps({ ...stats, speed: Math.max(100, stats.speed || 0) }),
    observed: {
      critRate: sumSwings > 0 ? (sumCrits / sumSwings) * 100 : 0,
      doubleHitRate: sumSwings > 0 ? (sumDoubleHits / sumSwings) * 100 : 0,
      meanSwings: iterations > 0 ? sumSwings / iterations : 0,
    },
    bestRun,
    worstRun,
  };
}

/**
 * Head-to-head comparison of two builds under PAIRED common random numbers:
 * iteration i of both sides uses the same rng stream, so the difference is
 * free of between-run luck and its confidence interval is the paired one
 * (much tighter than comparing two independent batches). Returns each side's
 * mean DPS plus the B-minus-A delta with a 95% CI half-width, all in DPS.
 */
export function compareSimulations({
  statsA,
  statsB,
  effectsA = DEFAULT_EFFECTS,
  effectsB = DEFAULT_EFFECTS,
  durationSeconds = 60,
  iterations = 1000,
  seed,
} = {}) {
  const baseSeed = (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
  let sumA = 0;
  let sumB = 0;
  let sumDiff = 0;
  let sumDiffSq = 0;
  for (let i = 0; i < iterations; i++) {
    const s = iterationSeed(baseSeed, i);
    const a = runSingle(statsA, { durationSeconds, rng: mulberry32(s), effects: effectsA });
    const b = runSingle(statsB, { durationSeconds, rng: mulberry32(s), effects: effectsB });
    sumA += a.totalDamage;
    sumB += b.totalDamage;
    const diff = b.totalDamage - a.totalDamage;
    sumDiff += diff;
    sumDiffSq += diff * diff;
  }
  const n = Math.max(1, iterations);
  const meanDiff = sumDiff / n;
  const diffVar = Math.max(0, sumDiffSq / n - meanDiff * meanDiff);
  const ciHalf = 1.96 * Math.sqrt(diffVar / n);
  const toDps = (dmg) => (durationSeconds > 0 ? dmg / durationSeconds : 0);
  return {
    seed: baseSeed,
    iterations,
    durationSeconds,
    a: { meanDps: toDps(sumA / n), meanTotalDamage: sumA / n },
    b: { meanDps: toDps(sumB / n), meanTotalDamage: sumB / n },
    delta: {
      meanDps: toDps(meanDiff),
      ciHalfWidthDps: toDps(ciHalf),
      pct: sumA > 0 ? (meanDiff / (sumA / n)) * 100 : 0,
    },
  };
}
