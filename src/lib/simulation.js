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
 * THE ENGINE
 * ----------
 * A run is a min-heap of timed events. Swings are recurring events: swing k
 * lands at (k * 100) / speed seconds (speed 100% = exactly 1 swing/second,
 * so a 60s fight is exactly 60 swings; the k*100/speed form avoids float
 * drift from repeated interval addition). Events strictly before
 * `durationSeconds` fire; anything at or past the horizon is dropped.
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
 * DOMAIN ASSUMPTIONS (handoff doc §10 open questions, decided here):
 *  - Double-hit rides every swing, so its frequency scales with Speed.
 *  - The double-hit second strike deals normal damage and CANNOT crit
 *    (matches dps.js/dps.test.js).
 *  - The boss is a pure target dummy: no defense, no mechanics; lifesteal/
 *    HP regen are irrelevant to damage output and ignored here.
 *  - `stats` are the final capped totals from totals.js (attack is the
 *    displayed final Attack with Attack % already baked in).
 */

import { computeDps } from './dps.js';

const TIME_EPS = 1e-9;

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
  const speed = Math.max(100, stats.speed || 0); // attack rate never drops below base
  const heap = [];
  let seq = 0;

  const counters = { swings: 0, crits: 0, doubleHits: 0, damageByTag: {} };
  let totalDamage = 0;
  let currentSwing = null;

  const ctx = {
    rng,
    stats,
    time: 0,
    state: new Map(),
    counters,
    schedule(atTime, fn) {
      heapPush(heap, { time: atTime, seq: seq++, fn });
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

  // With no timed speed buffs registered, swing k lands at the exact
  // (k*100)/speed - integer swing counts, no float drift. With a speedBonus
  // effect present, the interval to the NEXT swing is derived from the speed
  // in force when the current swing lands (a buff expiring mid-interval
  // doesn't retroactively stretch an already-scheduled swing).
  const dynamicSpeed = effects.some((e) => e.speedBonus);
  const speedNow = () => {
    let s = stats.speed || 0;
    for (const e of effects) s += e.speedBonus?.(ctx) || 0;
    return Math.max(100, s);
  };

  const scheduleSwing = (k, atTime) => {
    ctx.schedule(atTime, () => {
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
      scheduleSwing(k + 1, dynamicSpeed ? ctx.time + 100 / speedNow() : ((k + 1) * 100) / speed);
    });
  };

  for (const e of effects) e.onRunStart?.(ctx);
  scheduleSwing(0, 0);

  while (heap.length > 0 && heap[0].time < durationSeconds - TIME_EPS) {
    const event = heapPop(heap);
    ctx.time = event.time;
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

  for (let i = 0; i < iterations; i++) {
    const rng = mulberry32(iterationSeed(baseSeed, i));
    const run = runSingle(stats, { durationSeconds, rng, effects });
    totals[i] = run.totalDamage;
    sumSwings += run.swings;
    sumCrits += run.crits;
    sumDoubleHits += run.doubleHits;
    if (!bestRun || run.totalDamage > bestRun.totalDamage) bestRun = run;
    if (!worstRun || run.totalDamage < worstRun.totalDamage) worstRun = run;
  }

  let sum = 0;
  for (let i = 0; i < iterations; i++) sum += totals[i];
  const mean = iterations > 0 ? sum / iterations : 0;
  let sqDiff = 0;
  for (let i = 0; i < iterations; i++) sqDiff += (totals[i] - mean) ** 2;
  const stdDev = iterations > 0 ? Math.sqrt(sqDiff / iterations) : 0;

  const sorted = Float64Array.from(totals).sort();

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
