/**
 * format.js - the number-format gotcha (handoff 9).
 *
 * The game uses "." as a THOUSANDS separator for large flat stat VALUES, but
 * "." as a DECIMAL point for percentages:
 *   flat: "2.664" -> 2664, "48.124" -> 48124
 *   pct:  "6.2"   -> 6.2
 *
 * Parsing per field is chosen by the stat's `kind` in constants.js. Flats are
 * integers; percentages are decimals.
 */

import { FLAT_KEYS } from './constants.js';

/**
 * Parse a flat stat value where "." (and ",") are thousands separators.
 * "2.664" -> 2664, "48.124" -> 48124, "2664" -> 2664. Empty -> 0.
 * Accepts a number unchanged.
 */
export function parseFlat(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  if (input == null) return 0;
  const s = String(input).trim();
  if (s === '') return 0;
  const neg = s.startsWith('-');
  const digits = s.replace(/[^\d]/g, ''); // drop thousands separators and stray chars
  if (digits === '') return 0;
  const n = parseInt(digits, 10);
  return neg ? -n : n;
}

/**
 * Parse a percentage value where "." is a decimal point.
 * "6.2" -> 6.2. Empty / non-numeric -> 0. Accepts a number unchanged.
 * "," is accepted as an alternate decimal separator ("2,3" -> 2.3) - some
 * locales/numeric keyboards produce a comma instead of a period. Without
 * this, the comma would just get stripped by the character filter below,
 * silently concatenating the digits on either side ("2,3" -> "23").
 */
export function parsePct(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  if (input == null) return 0;
  const s = String(input).trim().replace(/,/g, '.').replace(/[^\d.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Parse a value according to its stat key's kind. */
export function parseStat(key, input) {
  return FLAT_KEYS.includes(key) ? parseFlat(input) : parsePct(input);
}

/** Format a flat value for display, grouping thousands with "." (game style). */
export function formatFlat(value) {
  const n = Math.round(Number(value) || 0);
  const neg = n < 0;
  const grouped = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return neg ? '-' + grouped : grouped;
}

/** Format a percentage for display: trim trailing zeros, up to 3 decimals. */
export function formatPct(value) {
  const n = Number(value) || 0;
  return parseFloat(n.toFixed(3)).toString();
}

/** Format a value according to its stat key's kind. */
export function formatStat(key, value) {
  return FLAT_KEYS.includes(key) ? formatFlat(value) : formatPct(value);
}
