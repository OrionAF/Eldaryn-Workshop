/**
 * format.js - the number-format gotcha (handoff 9).
 *
 * The game uses "." as a THOUSANDS separator for large flat stat VALUES, but
 * "." as a DECIMAL point for percentages:
 *   flat: "2.664" -> 2664, "48.124" -> 48124
 *   pct:  "6.2"   -> 6.2
 *
 * Parsing per field is chosen by the key's kind: a stat-sheet key is flat when its row kind is
 * 'integer' (engine/pipeline/sheet.js). Flats are integers; percentages are decimals.
 * Sheet text entry (with the Attack Speed / Crit Damage multiplier handling) is parseSheetInput.
 */

import { sheetKeyMeta } from './engine/pipeline/sheet.js';

/** Does this key hold a flat (thousands-separated) value rather than a percentage? */
export function isFlatKey(key) {
  const meta = sheetKeyMeta(key);
  return meta ? meta.kind === 'integer' : false;
}

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
  return isFlatKey(key) ? parseFlat(input) : parsePct(input);
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
  return isFlatKey(key) ? formatFlat(value) : formatPct(value);
}

/**
 * Where a slider's value sits on its own range, as a 0-100 percentage.
 * Drives the gold fill on `.slider` (see Slider.svelte / app.css). A zero-width
 * range (min === max) reads as full, since the only legal value IS the max.
 */
export function fillPct(value, min, max) {
  const lo = Number(min) || 0;
  const hi = Number(max) || 0;
  if (hi <= lo) return 100;
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
}

/** Display order of the rarity names (lowest first) shared by pets, sigils and mounts. */
export const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ancient', 'Divine', 'Eternal', 'Oblivion'];

/** The app.css class that rebinds the --rarity-* tokens for a tier name; 'rarity-unknown' otherwise. */
export function rarityClass(rarity) {
  return RARITY_ORDER.includes(rarity) ? `rarity-${rarity.toLowerCase()}` : 'rarity-unknown';
}
