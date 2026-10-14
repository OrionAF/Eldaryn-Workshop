// Exact distribution functions the statistics need: Student-t and normal quantiles, the regularised
// incomplete beta (also the binomial CDF) and gamma. Pure numerics, no approximation tables
// (see docs/Reference/simulation.md §Statistics).
//
// The continued fraction / series evaluations follow Numerical Recipes (3rd ed., §6.2, §6.4) and
// are accurate to about 1e-10 relative; quantiles are found by bisection on the CDF, so they inherit
// that accuracy.

const EPS = 1e-15;
const FPMIN = 1e-300;

/** ln Γ(x) for x > 0 (Lanczos, g = 7, n = 9). */
export function lnGamma(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function betaCf(a, b, x) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 10000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b), a, b > 0, 0 <= x <= 1. */
export function incBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lbt = lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log1p(-x);
  const bt = Math.exp(lbt);
  return x < (a + 1) / (a + b + 2) ? (bt * betaCf(a, b, x)) / a : 1 - (bt * betaCf(b, a, 1 - x)) / b;
}

/** Regularised upper incomplete gamma Q(a, x). */
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  const gln = lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let sum = del;
    for (let n = 0; n < 10000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return 1 - sum * Math.exp(-x + a * Math.log(x) - gln);
  }
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 10000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

/** Standard normal CDF Φ(z). */
export function normCdf(z) {
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  const tail = 0.5 * gammaQ(0.5, (z * z) / 2); // P(Z > |z|)
  return z >= 0 ? 1 - tail : tail;
}

/** Bisection for f increasing on [lo, hi]; returns x with f(x) = target to double precision. */
function solveIncreasing(f, target, lo, hi) {
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Standard normal quantile Φ⁻¹(p). */
export function zQuantile(p) {
  if (!(p > 0)) return -Infinity;
  if (!(p < 1)) return Infinity;
  if (p === 0.5) return 0;
  if (p < 0.5) return -zQuantile(1 - p);
  // Upper half: solve on the tail 1 - Φ(z) = 1 - p, which keeps precision for p near 1.
  const q = 1 - p;
  return solveIncreasing((z) => -0.5 * gammaQ(0.5, (z * z) / 2), -q, 0, 40);
}

/** Student-t CDF with `df` degrees of freedom (df > 0, may be non-integer; Infinity = normal). */
export function tCdf(t, df) {
  if (df === Infinity) return normCdf(t);
  if (t === Infinity) return 1;
  if (t === -Infinity) return 0;
  const tail = 0.5 * incBeta(df / (df + t * t), df / 2, 0.5); // P(T > |t|)
  return t >= 0 ? 1 - tail : tail;
}

/** Student-t quantile F⁻¹(p) with `df` degrees of freedom. */
export function tQuantile(p, df) {
  if (!(df > 0)) return NaN;
  if (df === Infinity) return zQuantile(p);
  if (!(p > 0)) return -Infinity;
  if (!(p < 1)) return Infinity;
  if (p === 0.5) return 0;
  if (p < 0.5) return -tQuantile(1 - p, df);
  // P(T > t) = I_x(df/2, 1/2) / 2 with x = df / (df + t²): solve for x, then t = sqrt(df (1 - x) / x).
  const target = 2 * (1 - p);
  const x = solveIncreasing((v) => incBeta(v, df / 2, 0.5), target, 0, 1);
  return Math.sqrt((df * (1 - x)) / x);
}

const tCritMemo = new Map();

/** Two-sided critical value: t with P(|T| > t) = alpha. df < 1 gives Infinity (no interval). */
export function tCrit(df, alpha = 0.05) {
  if (!(df >= 1)) return Infinity;
  const key = `${df}|${alpha}`;
  let v = tCritMemo.get(key);
  if (v === undefined) {
    v = tQuantile(1 - alpha / 2, df);
    if (tCritMemo.size > 4096) tCritMemo.clear();
    tCritMemo.set(key, v);
  }
  return v;
}

/** Two-sided normal critical value z with P(|Z| > z) = alpha. */
export const zCrit = (alpha = 0.05) => zQuantile(1 - alpha / 2);

/** Binomial CDF P(B <= k) for B ~ Bin(n, p). */
export function binomCdf(k, n, p) {
  if (k < 0) return 0;
  if (k >= n) return 1;
  if (p <= 0) return 1;
  if (p >= 1) return 0;
  return incBeta(1 - p, n - k, k + 1);
}
