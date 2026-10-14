// Point estimates, intervals and paired contrasts. Every function takes `alpha` (two-sided, already
// divided by its multiplicity family) and returns plain data; methods and their choice per
// objective are in docs/Reference/simulation.md §Statistics.

import { tCrit, zCrit, normCdf, tCdf, binomCdf } from './tdist.js';
import { mulberry32, hashSeed } from '../rng.js';

const mean = (xs) => {
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
};

function sdOf(xs, m) {
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return Math.sqrt(ss / (xs.length - 1));
}

/** Two-sided p-value of a t statistic; sd 0 means the data are exact. */
function tP(est, sd, n) {
  if (sd === 0) return est === 0 ? 1 : 0;
  const t = est / (sd / Math.sqrt(n));
  return 2 * (1 - tCdf(Math.abs(t), n - 1));
}

/** Mean with a Student-t interval. Fewer than two samples give null bounds. */
export function meanInterval(xs, { alpha = 0.05 } = {}) {
  const n = xs.length;
  if (n === 0) return { est: null, sd: null, lo: null, hi: null, n: 0, p: null, alphaAdj: alpha, method: 't' };
  const est = mean(xs);
  if (n === 1) return { est, sd: null, lo: null, hi: null, n, p: null, alphaAdj: alpha, method: 't' };
  const sd = sdOf(xs, est);
  const h = (tCrit(n - 1, alpha) * sd) / Math.sqrt(n);
  return { est, sd, lo: est - h, hi: est + h, n, p: tP(est, sd, n), alphaAdj: alpha, method: 't' };
}

/** Wilson score interval for k successes in n trials at critical value z. */
export function wilsonZ(k, n, z) {
  if (n === 0) return { p: null, lo: null, hi: null, n: 0 };
  const p = k / n;
  const z2 = z * z;
  const d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  // Clamp to [0, p] / [p, 1]: at k = 0 or k = n, float error can put a bound a hair past p.
  return { p, lo: Math.min(p, Math.max(0, c - h)), hi: Math.max(p, Math.min(1, c + h)), n };
}

/** Wilson interval for a proportion. */
export function wilsonInterval(k, n, { alpha = 0.05 } = {}) {
  const w = wilsonZ(k, n, zCrit(alpha));
  return { est: w.p, lo: w.lo, hi: w.hi, n, alphaAdj: alpha, method: 'wilson' };
}

/** Paired t on the differences x[i] - y[i] (shared prefix when lengths differ). */
export function pairedT(x, y, { alpha = 0.05 } = {}) {
  const n = Math.min(x.length, y.length);
  const d = new Array(n);
  for (let i = 0; i < n; i++) d[i] = x[i] - y[i];
  const r = meanInterval(d, { alpha });
  return { delta: r.est, lo: r.lo, hi: r.hi, sd: r.sd, n, p: r.p, alphaAdj: alpha, method: 'paired-t' };
}

/** True when every value is 0 or 1 (win/alive outcomes). */
export const isBinary = (xs) => xs.every((v) => v === 0 || v === 1);

/** Bisection for the root of a decreasing f on [lo, hi]. */
function rootDecreasing(f, lo, hi) {
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Tango's score statistic for paired proportions: Z(Δ) for H: p(x) - p(y) = Δ, given n pairs of
 * which b have x = 1, y = 0 and c have x = 0, y = 1. Decreasing in Δ.
 */
function tangoZ(b, c, n, D) {
  const W = -b - c + (2 * n - b + c) * D;
  const q21 = (Math.sqrt(Math.max(0, W * W + 8 * n * c * D * (1 - D))) - W) / (4 * n);
  const v = n * (2 * q21 + D * (1 - D));
  const num = b - c - n * D;
  if (v <= 0) return num === 0 ? 0 : num > 0 ? Infinity : -Infinity;
  return num / Math.sqrt(v);
}

/** Tango interval from discordant counts. */
function tangoFromCounts(b, c, n, alpha) {
  if (n === 0) return { delta: null, lo: null, hi: null, sd: null, n: 0, p: null };
  const z = zCrit(alpha);
  const delta = (b - c) / n;
  const edge = 1 - 1e-12;
  const lo = delta <= -edge ? -1 : tangoZ(b, c, n, -edge) <= z ? -1 : rootDecreasing((D) => tangoZ(b, c, n, D) - z, -edge, delta);
  const hi = delta >= edge ? 1 : tangoZ(b, c, n, edge) >= -z ? 1 : rootDecreasing((D) => tangoZ(b, c, n, D) + z, delta, edge);
  const p = b + c === 0 ? 1 : 2 * (1 - normCdf(Math.abs(b - c) / Math.sqrt(b + c)));
  const sd = Math.sqrt(Math.max(0, (b + c) / n - delta * delta) * (n / Math.max(1, n - 1)));
  return { delta, lo: Math.min(lo, delta), hi: Math.max(hi, delta), sd, n, p, discordant: b + c };
}

function discordant(x, y, n) {
  let b = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (x[i] === 1 && y[i] === 0) b++;
    else if (x[i] === 0 && y[i] === 1) c++;
  }
  return { b, c };
}

/**
 * Paired difference of proportions p(x) - p(y) over 0/1 outcomes with Tango's score interval: it
 * depends only on the discordant pairs and stays non-degenerate when there are none.
 */
export function pairedProportion(x, y, { alpha = 0.05 } = {}) {
  const n = Math.min(x.length, y.length);
  const { b, c } = discordant(x, y, n);
  return { ...tangoFromCounts(b, c, n, alpha), alphaAdj: alpha, method: 'tango' };
}

/**
 * Equal-weight average of per-stratum paired proportion differences (e.g. one stratum per PVP
 * matchup). Per-stratum Tango limits are combined by MOVER (square-and-add); the p-value is the
 * stratified McNemar z.
 * @param {Array<[number[], number[]]>} strata
 */
export function stratifiedPairedProportion(strata, { alpha = 0.05 } = {}) {
  const parts = strata
    .map(([x, y]) => {
      const n = Math.min(x.length, y.length);
      return { n, ...discordant(x, y, n) };
    })
    .filter((s) => s.n > 0);
  const k = parts.length;
  if (k === 0) return { delta: null, lo: null, hi: null, sd: null, n: 0, p: null, alphaAdj: alpha, method: 'stratified-tango' };
  const w = 1 / k;
  let delta = 0;
  let dl = 0;
  let du = 0;
  let num = 0;
  let varNull = 0;
  let n = 0;
  for (const s of parts) {
    const r = tangoFromCounts(s.b, s.c, s.n, alpha);
    delta += w * r.delta;
    dl += (w * (r.delta - r.lo)) ** 2;
    du += (w * (r.hi - r.delta)) ** 2;
    num += (w * (s.b - s.c)) / s.n;
    varNull += (w * w * (s.b + s.c)) / (s.n * s.n);
    n += s.n;
  }
  const p = varNull === 0 ? 1 : 2 * (1 - normCdf(Math.abs(num) / Math.sqrt(varNull)));
  const sd = Math.sqrt(varNull * n);
  return {
    delta, lo: Math.max(-1, delta - Math.sqrt(dl)), hi: Math.min(1, delta + Math.sqrt(du)), sd, n, p,
    alphaAdj: alpha, method: 'stratified-tango',
  };
}

const sorted = (xs) => Float64Array.from(xs).sort();

/**
 * q-quantile of all fights, losses counted as +Infinity (censored): the inverse empirical CDF,
 * i.e. the ceil(n q)-th smallest value. Infinity when fewer than a q share of fights were won.
 */
export function censoredQuantile(xs, q) {
  if (!xs.length) return null;
  const s = sorted(xs);
  return s[Math.min(s.length, Math.max(1, Math.ceil(s.length * q))) - 1];
}

/** Largest k in [lo, hi] with pred(k) true, pred monotone true -> false; lo - 1 if none. */
function lastTrue(pred, lo, hi) {
  let a = lo - 1;
  let b = hi + 1;
  while (b - a > 1) {
    const m = (a + b) >> 1;
    if (pred(m)) a = m;
    else b = m;
  }
  return a;
}

/**
 * Censored quantile with a distribution-free order-statistic interval: [x(l), x(u)] where
 * B ~ Bin(n, q) has P(B < l) <= alpha/2 and P(B >= u) <= alpha/2. A bound the sample cannot
 * reach is -Infinity / +Infinity.
 */
export function quantileInterval(xs, q, { alpha = 0.05 } = {}) {
  const n = xs.length;
  if (n === 0) return { est: null, lo: null, hi: null, n: 0, alphaAdj: alpha, method: 'order-stat' };
  const s = sorted(xs);
  const est = s[Math.min(n, Math.max(1, Math.ceil(n * q))) - 1];
  const l = lastTrue((k) => binomCdf(k - 1, n, q) <= alpha / 2, 1, n);
  const u = lastTrue((k) => 1 - binomCdf(k - 1, n, q) > alpha / 2, 1, n) + 1;
  return {
    est, lo: l >= 1 ? s[l - 1] : -Infinity, hi: u <= n ? s[u - 1] : Infinity, n, alphaAdj: alpha, method: 'order-stat',
  };
}

/** a - b where equal values (including two infinities) differ by 0. */
const diff = (a, b) => (a === b ? 0 : a - b);

/**
 * Seeded paired bootstrap of stat(x) - stat(y): fights are resampled by index (the same indices on
 * both sides, keeping the common random numbers), B replicates, percentile interval.
 */
export function pairedBootstrap(x, y, stat, { alpha = 0.05, B = 2000, seed = 1 } = {}) {
  const n = Math.min(x.length, y.length);
  if (n === 0) return { delta: null, lo: null, hi: null, sd: null, n: 0, p: null, B, alphaAdj: alpha, method: 'paired-bootstrap' };
  const delta = diff(stat(x.slice(0, n)), stat(y.slice(0, n)));
  const rng = mulberry32(hashSeed('paired-bootstrap', seed, n));
  const reps = new Float64Array(B);
  const xs = new Array(n);
  const ys = new Array(n);
  let le = 0;
  let ge = 0;
  for (let r = 0; r < B; r++) {
    for (let j = 0; j < n; j++) {
      const i = Math.floor(rng() * n);
      xs[j] = x[i];
      ys[j] = y[i];
    }
    const d = diff(stat(xs), stat(ys));
    reps[r] = d;
    if (d <= 0) le++;
    if (d >= 0) ge++;
  }
  reps.sort();
  const lo = reps[Math.min(B - 1, Math.floor((alpha / 2) * B))];
  const hi = reps[Math.max(0, Math.ceil((1 - alpha / 2) * B) - 1)];
  const finite = Array.from(reps).filter(Number.isFinite);
  const sd = finite.length > 1 ? sdOf(finite, mean(finite)) * Math.sqrt(n) : null;
  const p = Math.min(1, (2 * (Math.min(le, ge) + 1)) / (B + 1));
  return { delta, lo, hi, sd, n, p, B, alphaAdj: alpha, method: 'paired-bootstrap' };
}

/** Paired bootstrap of the censored q-quantile difference. */
export const pairedQuantileDiff = (x, y, q, opts = {}) => pairedBootstrap(x, y, (s) => censoredQuantile(s, q), opts);
