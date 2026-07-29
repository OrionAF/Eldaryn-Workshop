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

/** Short labels for summarizeStats() - keeps a stat-roll summary chip to one line. Falls back to the field's full label if a key isn't listed here. */
const SHORT_STAT_LABELS = {
  attack: 'ATK',
  attack_pct: 'ATK',
  health: 'HP',
  health_pct: 'HP',
  speed: 'speed',
  crit: 'crit',
  crit_mult: 'crit mult',
  double_hit: 'double hit',
  lifesteal: 'lifesteal',
  hp_regen: 'HP regen',
};

/**
 * "1.200 ATK · +4% ATK · 1.5% crit" - a compact, capped summary of a stats
 * object's non-zero fields (in `fields` order), for one-line display in a
 * chip/summary row (Pets). `max` caps how many bits are shown.
 */
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

export function summarizeStats(stats, fields, max = 3) {
  const bits = fields
    .filter((f) => (stats[f.key] || 0) !== 0)
    .map((f) => {
      const label = SHORT_STAT_LABELS[f.key] || f.label;
      const value = formatStat(f.key, stats[f.key]);
      return f.kind === 'pct' ? `+${value}% ${label}` : `${value} ${label}`;
    })
    .slice(0, max);
  return bits.length ? bits.join(' · ') : 'no stats yet';
}
