// ui/statsFormat.js - display of the A.9 Estimate / Contrast shapes. Units come from the objective
// ('dps' | 'ms' | 'p'). Every signed figure, including both CI bounds, keeps its sign (#77).
import { formatFlat } from '../format.js';

const MINUS = '−';

const sec = (ms) => `${(ms / 1000).toFixed(2)} s`;
const pct1 = (x) => `${(x * 100).toFixed(1)}%`;

const finite = (v) => v != null && Number.isFinite(v);

/** Thousands-grouped count for fight totals (UI numbers, not game stats). */
export function fmtCount(n) {
  return finite(n) ? Math.round(n).toLocaleString('en-US') : 'n/a';
}

/** An unsigned value in the objective's unit; null means no reliable number. */
export function fmtScalar(unit, v) {
  if (!finite(v)) return 'n/a';
  if (unit === 'ms') return sec(v);
  if (unit === 'p') return pct1(v);
  return formatFlat(v);
}

function body(unit, abs) {
  if (unit === 'ms') return sec(abs);
  if (unit === 'p') return `${(abs * 100).toFixed(1)} pts`;
  return formatFlat(abs).replace(/^-/, '');
}

const withSign = (s, x) => (x > 0 ? `+${s}` : x < 0 ? `${MINUS}${s}` : s);

/** A difference in score space (positive = better) with an explicit sign. */
export function fmtSigned(unit, x) {
  if (!finite(x)) return 'n/a';
  return withSign(body(unit, Math.abs(x)), x);
}

/** "value (lo to hi)" for an Estimate. */
export function fmtEstimate(unit, e) {
  if (!e || !finite(e.est)) return 'n/a';
  const main = fmtScalar(unit, e.est);
  if (!finite(e.lo) || !finite(e.hi)) return main;
  return `${main} (${fmtScalar(unit, e.lo)} to ${fmtScalar(unit, e.hi)})`;
}

/** The headline delta of a Contrast; DPS prints the relative figure when there is one. */
export function fmtContrast(unit, c) {
  if (!c || !finite(c.delta)) return '';
  if (unit === 'dps' && finite(c.pct)) return withSign(`${(Math.abs(c.pct) * 100).toFixed(2)}%`, c.pct);
  return fmtSigned(unit, c.delta);
}

/** "95% CI lo to hi", signed in every unit. */
export function fmtContrastCi(unit, c) {
  if (!c || !finite(c.lo) || !finite(c.hi)) return '';
  return `95% CI ${fmtSigned(unit, c.lo)} to ${fmtSigned(unit, c.hi)}`;
}

/** Plain-words verdict; an unresolved comparison names the N it stopped at. */
export function verdictText(c) {
  if (!c) return '';
  if (c.verdict === 'better') return 'Better';
  if (c.verdict === 'worse') return 'Worse';
  if (c.verdict === 'equivalent') return 'Equivalent';
  return `Too close to call at ${fmtCount(c.n)}`;
}

/** How many fights the comparator estimates it needs, or ''. */
export function nNeededText(c) {
  return c && finite(c.nNeeded) ? `about ${fmtCount(c.nNeeded)} fights needed` : '';
}

/** Colour tone: only a significant verdict takes up/down; everything else is neutral. */
export function verdictTone(c) {
  if (c?.verdict === 'better') return 'up';
  if (c?.verdict === 'worse') return 'down';
  return 'side';
}
