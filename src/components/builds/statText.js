// statText.js (U7): one place that turns a sheet-key value into the text the in-game sheet prints.
// Flat rows are integers shown with "." thousands; percent rows show the printed percent (Attack Speed and
// Crit Damage are stored as multipliers and shown x100). format.js owns the separators.
import { sheetKeyMeta, toDisplay } from '../../lib/engine/pipeline/sheet.js';
import { formatFlat, formatPct } from '../../lib/format.js';

export const isFlatStat = (key) => sheetKeyMeta(key)?.kind === 'integer';

/** Number text without unit; '-' for a missing value. */
export function statNumber(key, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return isFlatStat(key) ? formatFlat(value) : formatPct(toDisplay(key, value));
}

/** Number text with its unit suffix ('%' on percent rows). */
export function statText(key, value) {
  const n = statNumber(key, value);
  return n === '-' || isFlatStat(key) ? n : `${n}%`;
}

/** Signed gap text ("+904", "-3.2%", "0"). */
export function gapText(key, delta) {
  if (typeof delta !== 'number' || !Number.isFinite(delta)) return '-';
  if (delta === 0) return '0';
  return `${delta > 0 ? '+' : '-'}${statText(key, Math.abs(delta))}`;
}
