// ui/forestScale.js - the one scale a CI table shares between its axis and every forest mark.

/** A round step (1, 2 or 5 x 10^k) giving about `count` intervals over `range`. */
function niceStep(range, count) {
  const raw = range / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag;
}

/**
 * Domain covering zero and every finite est/lo/hi, widened to whole steps so ticks land on it.
 * @param {Array<{est?: number|null, lo?: number|null, hi?: number|null}|null>} items
 * @returns {{min: number, max: number, step: number}}
 */
export function forestDomain(items, { ticks = 4 } = {}) {
  let lo = 0;
  let hi = 0;
  for (const it of items) {
    if (!it) continue;
    for (const v of [it.est, it.lo, it.hi]) {
      if (v == null || !Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (lo === hi) return { min: -1, max: 1, step: 1 };
  const step = niceStep(hi - lo, ticks);
  return { min: Math.floor(lo / step) * step, max: Math.ceil(hi / step) * step, step };
}

/** Percent position (0-100) of x on the domain, clamped. */
export function forestPos(x, d) {
  const p = ((x - d.min) / (d.max - d.min)) * 100;
  return Math.min(100, Math.max(0, p));
}

/** Tick values, zero always among them. */
export function forestTicks(d) {
  const out = [];
  const n = Math.round((d.max - d.min) / d.step);
  for (let i = 0; i <= n; i += 1) out.push(Math.abs(d.min + i * d.step) < d.step * 1e-9 ? 0 : d.min + i * d.step);
  return out;
}
