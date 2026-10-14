// optimiser/format.js - display helpers for optimiser values. Units come from the objective ('dps' | 'ms' | 'p').
import { formatFlat } from '../../lib/format.js';

const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
const sec = (ms) => `${(ms / 1000).toFixed(2)} s`;

/** A display value in the objective's unit; null means "no reliable number" (fight rarely won). */
export function fmtValue(unit, v) {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  if (unit === 'ms') return sec(v);
  if (unit === 'p') return pct1(v);
  return formatFlat(v);
}

/** "value (lo to hi)" with the 95% interval when present. */
export function fmtWithCi(unit, e) {
  if (!e) return 'n/a';
  const main = fmtValue(unit, e.value);
  if (e.value == null || e.lo == null || e.hi == null) return main;
  return `${main} (${fmtValue(unit, e.lo)} to ${fmtValue(unit, e.hi)})`;
}

const signed = (s, d) => (d > 0 ? `+${s}` : d < 0 ? `-${s}` : s);

/** Paired difference vs the current preset, in score space (positive = better). */
export function fmtDelta(unit, vs) {
  if (!vs) return '';
  const d = vs.delta;
  let body;
  if (unit === 'dps') body = vs.pct != null ? `${(Math.abs(vs.pct) * 100).toFixed(2)}%` : formatFlat(Math.abs(d));
  else if (unit === 'ms') body = sec(Math.abs(d));
  else body = `${(Math.abs(d) * 100).toFixed(1)} pts`;
  return signed(body, d);
}

export function fmtDeltaCi(unit, vs) {
  if (!vs || vs.lo == null || vs.hi == null) return '';
  const f = (x) => (unit === 'dps' ? formatFlat(x) : unit === 'ms' ? signed(sec(Math.abs(x)), x) : `${(x * 100).toFixed(1)} pts`);
  return `95% CI ${f(vs.lo)} to ${f(vs.hi)}`;
}
