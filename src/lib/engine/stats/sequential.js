// Sequential paired comparator: looks at n0, 2 n0, 4 n0, ... maxN with Bonferroni over the looks,
// stopping as soon as the decision interval resolves. Contract and rationale:
// docs/Reference/simulation.md §Statistics (sequential comparator, verdicts, nNeeded).

import { zQuantile } from './tdist.js';
import { pairedT, pairedProportion, pairedQuantileDiff, meanInterval, censoredQuantile } from './intervals.js';

/** Look sizes n0, 2 n0, 4 n0, ... below maxN, then maxN itself. */
export function lookSchedule(n0, maxN) {
  if (!(n0 >= 1) || !(maxN >= n0)) throw new RangeError(`lookSchedule: need 1 <= n0 <= maxN, got ${n0}, ${maxN}`);
  const looks = [];
  for (let n = n0; n < maxN; n *= 2) looks.push(n);
  looks.push(maxN);
  return looks;
}

/** Per-look two-sided level: alpha (already divided by its family) split evenly over the looks. */
export const perLookAlpha = (alpha, looks) => alpha / looks.length;

/** Indifference zone in the statistic's units: relative zones scale by |reference|. */
export function deltaAbs(delta, deltaKind, ref) {
  if (deltaKind !== 'relative') return delta;
  return Number.isFinite(ref) ? delta * Math.abs(ref) : 0;
}

/**
 * Verdict of an interval for θ(X) - θ(Y): 'better' / 'worse' when it excludes 0 (in the
 * direction of `higherIsBetter`), 'equivalent' when it lies inside (-δ, δ), else null (continue).
 */
export function decide({ lo, hi }, delta, higherIsBetter = true) {
  if (lo == null || hi == null || Number.isNaN(lo) || Number.isNaN(hi)) return null;
  if (lo > 0) return higherIsBetter ? 'better' : 'worse';
  if (hi < 0) return higherIsBetter ? 'worse' : 'better';
  if (delta > 0 && -delta < lo && hi < delta) return 'equivalent';
  return null;
}

/**
 * Fights needed for 80 % power at level alphaAdj to resolve |Δ| (or δ when larger), given the
 * per-fight sd of the paired contrast. Null when sd is unknown or the target is zero.
 */
export function nNeeded({ sd, delta, deltaMin = 0, alpha = 0.05, power = 0.8 }) {
  const target = Math.max(Math.abs(delta ?? 0), deltaMin);
  if (sd == null || !Number.isFinite(sd) || !(target > 0)) return null;
  if (sd === 0) return 2;
  return Math.ceil((((zQuantile(1 - alpha / 2) + zQuantile(power)) * sd) / target) ** 2);
}

/** The objective's own statistic of one sample vector (the reference for relative zones). */
export function statisticOf(xs, { statistic, q }) {
  if (statistic === 'quantile') return censoredQuantile(xs, q);
  return meanInterval(xs).est;
}

/**
 * One paired contrast θ(X) - θ(Y) at level alpha. statistic: 'mean' (paired t), 'proportion'
 * (0/1 outcomes, Tango score), 'quantile' (censored q-quantile, seeded paired bootstrap).
 */
export function contrastAt(x, y, { statistic = 'mean', q = 0.5, alpha = 0.05, seed = 1, B = 2000 } = {}) {
  if (statistic === 'proportion') return pairedProportion(x, y, { alpha });
  if (statistic === 'quantile') return pairedQuantileDiff(x, y, q, { alpha, seed, B });
  if (statistic === 'mean') return pairedT(x, y, { alpha });
  throw new RangeError(`contrastAt: unknown statistic '${statistic}'`);
}

function lookResult(x, y, n, o, alphaLook, final) {
  const xs = x.length === n ? x : x.slice(0, n);
  const ys = y.length === n ? y : y.slice(0, n);
  if (xs.length < n || ys.length < n) throw new RangeError(`compare: sampler returned fewer than ${n} outcomes`);
  // A NaN / infinite outcome would poison every interval silently. Only the quantile statistic
  // takes +Infinity: a lost fight is a censored (never-finished) time there.
  const finiteOutcome = (v) => (typeof v === 'number' && (Number.isFinite(v) || (o.statistic === 'quantile' && v === Infinity)));
  if (!xs.every(finiteOutcome) || !ys.every(finiteOutcome)) throw new RangeError('compare: sampler returned a non-finite outcome');
  const c = contrastAt(xs, ys, { ...o, alpha: alphaLook });
  const ref = statisticOf(ys, o);
  const zone = deltaAbs(o.delta, o.deltaKind, ref);
  const verdict = decide(c, zone, o.higherIsBetter) ?? (final ? 'unresolved' : null);
  if (!verdict) return null;
  return {
    delta: c.delta, lo: c.lo, hi: c.hi,
    pct: Number.isFinite(ref) && ref !== 0 && Number.isFinite(c.delta) ? c.delta / Math.abs(ref) : null,
    n, seed: o.seed, alphaAdj: alphaLook, method: c.method, verdict,
    significant: verdict === 'better' || verdict === 'worse',
    nNeeded: verdict === 'unresolved' ? nNeeded({ sd: c.sd, delta: c.delta, deltaMin: zone, alpha: alphaLook }) : null,
    p: c.p, sd: c.sd, zone,
  };
}

function options(o) {
  const r = {
    statistic: 'mean', q: 0.5, higherIsBetter: true, delta: 0, deltaKind: 'absolute', alpha: 0.05, seed: 1, B: 2000, ...o,
  };
  if (!(r.n0 >= 1) || !(r.maxN >= r.n0)) throw new RangeError('compare: n0 and maxN are required (1 <= n0 <= maxN)');
  return r;
}

/**
 * Sequential paired comparison of X against Y. `getX(n)` / `getY(n)` return the first n per-fight
 * outcomes (prefix-stable: the same fight index always gives the same outcome). Returns a Contrast
 * (docs/Reference/simulation.md) for θ(X) - θ(Y), with the decision interval of the stopping look.
 */
export function compare(getX, getY, opts) {
  const o = options(opts);
  const looks = lookSchedule(o.n0, o.maxN);
  const a = perLookAlpha(o.alpha, looks);
  for (let k = 0; k < looks.length; k++) {
    const r = lookResult(getX(looks[k]), getY(looks[k]), looks[k], o, a, k === looks.length - 1);
    if (r) return { ...r, looks: k + 1 };
  }
  throw new Error('unreachable');
}

/** `compare` for asynchronous samplers (getX / getY may return promises). */
export async function compareAsync(getX, getY, opts) {
  const o = options(opts);
  const looks = lookSchedule(o.n0, o.maxN);
  const a = perLookAlpha(o.alpha, looks);
  for (let k = 0; k < looks.length; k++) {
    const [x, y] = await Promise.all([getX(looks[k]), getY(looks[k])]);
    const r = lookResult(x, y, looks[k], o, a, k === looks.length - 1);
    if (r) return { ...r, looks: k + 1 };
  }
  throw new Error('unreachable');
}
