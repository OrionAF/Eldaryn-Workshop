// The four engine metrics (rebuild-plan §2.3, §5): dpsVsDummy, ttkVs, survival, pvpWinRate.
//
// Every metric is a Monte-Carlo sample loop with a 95 % interval (t for means, Wilson for
// proportions; the methods live in ./stats, see docs/Reference/simulation.md §Statistics). Fight i of every call uses rng = mulberry32(hashSeed(seed, i)), so two fighters
// measured with the same seed see the same random stream (common random numbers) and their
// per-sample difference (pairedDelta) has far less variance than the difference of two means.
//
// Each metric exists in a sync form and an `...Async` form. The async form yields to the event loop
// every ~25 ms so a worker can see an 'abort' message; both stop early on `signal.aborted` and
// return the interval over the samples taken so far with `aborted: true`.
// Results of complete runs are memoised on a pure-input key (metricKey); aborted runs never are.

import { mulberry32, hashSeed } from './rng.js';
import { simulatePve, preparePveFighter, trainingDummy } from './pve/fight.js';
import { runDuel, fighterDuelArgs } from './pvp/resolver.js';
import { tCrit, meanInterval, wilsonZ, isBinary, pairedProportion, pairedT } from './stats/index.js';

// ---------------------------------------------------------------------------------------------
// statistics: legacy shapes over engine/stats (docs/Reference/simulation.md §Statistics)

export * from './stats/index.js';

/** Two-sided 95 % Student-t critical value, exact for every df; Infinity below df 1. */
export const tCrit95 = (df) => tCrit(df, 0.05);

/** Mean, sample sd and 95 % t interval. n = 0 gives nulls; n = 1 gives a degenerate interval. */
export function meanCI(xs) {
  const r = meanInterval(xs);
  if (r.n === 1) return { mean: r.est, sd: 0, lo: r.est, hi: r.est, n: 1 };
  return { mean: r.est, sd: r.sd, lo: r.lo, hi: r.hi, n: r.n };
}

/** Wilson 95 % score interval for k successes in n trials. */
export const wilson = (k, n, z = 1.96) => wilsonZ(k, n, z);

/** Linear-interpolated quantile of an unsorted array (null when empty). */
export function quantile(xs, q) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const i = Math.floor(pos);
  return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * (pos - i) : s[i];
}

/**
 * Paired difference b - a of two sample arrays measured with the same seed (common random numbers),
 * over the shared prefix when the lengths differ (an aborted run). 0/1 data (wins, survival) use the
 * paired-proportion score interval, never a t interval (#101); everything else a paired t.
 */
export function pairedDelta(a, b) {
  const m = Math.min(a.length, b.length);
  const x = b.slice(0, m);
  const y = a.slice(0, m);
  const r = isBinary(x) && isBinary(y) ? pairedProportion(x, y) : pairedT(x, y);
  const lo = r.lo ?? r.delta;
  const hi = r.hi ?? r.delta;
  return { delta: r.delta, lo, hi, sd: r.sd ?? 0, n: m, method: r.method, significant: m > 1 && (lo > 0 || hi < 0) };
}

// ---------------------------------------------------------------------------------------------
// cache

/** Stable JSON: object keys sorted, undefined dropped. */
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

/** Pure-input cache key: metric name + a 64-bit hash of the stable JSON of its inputs. */
export function metricKey(kind, ...inputs) {
  const s = stableStringify(inputs);
  return `${kind}:${hashSeed(s).toString(36)}${hashSeed('b', s).toString(36)}:${s.length}`;
}

const CACHE_MAX = 400;
const cache = new Map();
export const clearMetricCache = () => cache.clear();
export const metricCacheSize = () => cache.size;
function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}

// ---------------------------------------------------------------------------------------------
// the sample loop

const YIELD_MS = 25;
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * @param {{n: number, sample: (i: number) => any, summarize: (samples: any[], aborted: boolean) => Object}} spec
 */
function runSync(spec, { signal, onProgress, key, cache: cacheOn } = {}) {
  const out = [];
  let aborted = false;
  for (let i = 0; i < spec.n; i++) {
    if (signal?.aborted) { aborted = true; break; }
    out.push(spec.sample(i));
    onProgress?.({ done: i + 1, n: spec.n });
  }
  return finish(spec, out, aborted, key, cacheOn !== false);
}

async function runAsync(spec, { signal, onProgress, key, cache: cacheOn } = {}) {
  const out = [];
  let aborted = false;
  let last = Date.now();
  for (let i = 0; i < spec.n; i++) {
    if (signal?.aborted) { aborted = true; break; }
    out.push(spec.sample(i));
    onProgress?.({ done: i + 1, n: spec.n });
    if (Date.now() - last >= YIELD_MS) { await tick(); last = Date.now(); }
  }
  return finish(spec, out, aborted, key, cacheOn !== false);
}

function finish(spec, samples, aborted, key, cacheOn = true) {
  const r = spec.summarize(samples, aborted);
  if (key && !aborted && cacheOn) remember(key, r);
  return r;
}

const fightRng = (seed, i) => mulberry32(hashSeed(seed, i));
const lookup = (opts, key) => (opts.cache === false ? null : cache.get(key) ?? null);

function pick(o, ...ks) {
  const r = {};
  for (const k of ks) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

// ---------------------------------------------------------------------------------------------
// specs

function dpsSpec(fighter, { seconds = 60, n = 32, seed = 1, keepSamples = false } = {}) {
  const prepared = preparePveFighter(fighter);
  const enemy = trainingDummy();
  return {
    n,
    sample: (i) => simulatePve({ fighter: prepared, enemy, maxMs: seconds * 1000, rng: fightRng(seed, i) }).damageDealt / seconds,
    summarize: (xs, aborted) => {
      const r = meanCI(xs);
      return { mean: r.mean, lo: r.lo, hi: r.hi, sd: r.sd, n: r.n, aborted, ...(keepSamples ? { samples: xs } : {}) };
    },
  };
}

function ttkSpec(fighter, enemy, { n = 64, seed = 1, maxMs, opts = {}, keepSamples = false } = {}) {
  const prepared = preparePveFighter(fighter);
  return {
    n,
    sample: (i) => {
      const r = simulatePve({ fighter: prepared, enemy, maxMs, rng: fightRng(seed, i), ...opts });
      return { won: r.won, timeMs: r.timeMs };
    },
    summarize: (xs, aborted) => {
      const times = xs.filter((x) => x.won).map((x) => x.timeMs);
      const t = meanCI(times);
      const w = wilson(times.length, xs.length);
      return {
        mean: t.mean, lo: t.lo, hi: t.hi, median: quantile(times, 0.5), p90: quantile(times, 0.9),
        p: w.p, pLo: w.lo, pHi: w.hi, wins: times.length, n: xs.length, aborted,
        ...(keepSamples ? { samples: xs.map((x) => (x.won ? x.timeMs : null)) } : {}),
      };
    },
  };
}

function survivalSpec(fighter, enemy, { seconds = 60, n = 200, seed = 1, opts = {}, keepSamples = false } = {}) {
  const prepared = preparePveFighter(fighter);
  return {
    n,
    sample: (i) => (simulatePve({ fighter: prepared, enemy, maxMs: seconds * 1000, rng: fightRng(seed, i), ...opts }).hpLeft > 0 ? 1 : 0),
    summarize: (xs, aborted) => {
      const w = wilson(xs.reduce((a, b) => a + b, 0), xs.length);
      return { p: w.p, lo: w.lo, hi: w.hi, n: w.n, aborted, ...(keepSamples ? { samples: xs } : {}) };
    },
  };
}

function pvpSpec(a, b, { n = 400, seed = 1, keepSamples = false } = {}) {
  const A = fighterDuelArgs(a);
  const B = fighterDuelArgs(b);
  return {
    n,
    sample: (i) => {
      const r = runDuel({ attacker: A, defender: B, rng: fightRng(seed, i) });
      return { won: r.attackerWon ? 1 : 0, timeMs: r.timeMs, timedOut: r.timedOut };
    },
    summarize: (xs, aborted) => {
      const w = wilson(xs.reduce((s, x) => s + x.won, 0), xs.length);
      const times = xs.map((x) => x.timeMs);
      return {
        p: w.p, lo: w.lo, hi: w.hi, n: w.n,
        meanMs: times.length ? meanCI(times).mean : null, p90Ms: quantile(times, 0.9),
        timeoutShare: xs.length ? xs.filter((x) => x.timedOut).length / xs.length : null,
        aborted, ...(keepSamples ? { samples: xs.map((x) => x.won) } : {}),
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// public API. Options common to all: seed, n, signal, onProgress, keepSamples, cache (false = skip memo).

const DPS_KEYS = ['seconds', 'n', 'seed', 'keepSamples'];
const TTK_KEYS = ['n', 'seed', 'maxMs', 'opts', 'keepSamples'];
const SURV_KEYS = ['seconds', 'n', 'seed', 'opts', 'keepSamples'];
const PVP_KEYS = ['n', 'seed', 'keepSamples'];

/** DPS over `seconds` (default 60) of training dummy: auto-attacks, spells, minion, DoTs. */
export function dpsVsDummy(fighter, o = {}) {
  const key = metricKey('dps', fighter, pick(o, ...DPS_KEYS));
  return lookup(o, key) ?? runSync(dpsSpec(fighter, o), { ...o, key });
}
export async function dpsVsDummyAsync(fighter, o = {}) {
  const key = metricKey('dps', fighter, pick(o, ...DPS_KEYS));
  return lookup(o, key) ?? runAsync(dpsSpec(fighter, o), { ...o, key });
}

/** Time-to-kill (wins only: mean/CI/median/P90 in ms) plus the win rate with a Wilson interval. */
export function ttkVs(fighter, enemy, o = {}) {
  const key = metricKey('ttk', fighter, enemy, pick(o, ...TTK_KEYS));
  return lookup(o, key) ?? runSync(ttkSpec(fighter, enemy, o), { ...o, key });
}
export async function ttkVsAsync(fighter, enemy, o = {}) {
  const key = metricKey('ttk', fighter, enemy, pick(o, ...TTK_KEYS));
  return lookup(o, key) ?? runAsync(ttkSpec(fighter, enemy, o), { ...o, key });
}

/** Probability the fighter is still alive after `seconds` (or has won earlier) against `enemy`. */
export function survival(fighter, enemy, o = {}) {
  const key = metricKey('surv', fighter, enemy, pick(o, ...SURV_KEYS));
  return lookup(o, key) ?? runSync(survivalSpec(fighter, enemy, o), { ...o, key });
}
export async function survivalAsync(fighter, enemy, o = {}) {
  const key = metricKey('surv', fighter, enemy, pick(o, ...SURV_KEYS));
  return lookup(o, key) ?? runAsync(survivalSpec(fighter, enemy, o), { ...o, key });
}

/** Win rate of `a` (the attacker) against `b`, with duration and timeout statistics. */
export function pvpWinRate(a, b, o = {}) {
  const key = metricKey('pvp', a, b, pick(o, ...PVP_KEYS));
  return lookup(o, key) ?? runSync(pvpSpec(a, b, o), { ...o, key });
}
export async function pvpWinRateAsync(a, b, o = {}) {
  const key = metricKey('pvp', a, b, pick(o, ...PVP_KEYS));
  return lookup(o, key) ?? runAsync(pvpSpec(a, b, o), { ...o, key });
}
