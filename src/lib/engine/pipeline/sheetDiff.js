// Tier-3 validation (rebuild-plan §4): compare computed stats with the user's in-game sheet.
import { SHEET_KEYS, sheetKeyMeta } from './sheet.js';

const EPS = 1e-9;

/**
 * @typedef {Object} SheetDiffRow
 * @property {string} key  ComputedStats key
 * @property {number|null} computed  null when the computed stats lack the key
 * @property {number} sheet
 * @property {number|null} delta  sheet - computed (positive: the game shows more than the model)
 * @property {boolean} withinTolerance  |delta| <= sheet.js toleranceFor(key)
 */

/**
 * Per-key comparison of computed stats against a sheet, for every sheet key the sheet carries.
 * A `raw*` key absent from `computed` means raw is at or below the soft cap, so it equals the
 * total. Rows come in SHEET_KEYS order.
 * @param {import('../types.js').ComputedStats} computed
 * @param {{values: Object<string, number>}|Object<string, number>|null} sheet  Sheet or bare values
 * @returns {SheetDiffRow[]}
 */
export function diffSheet(computed, sheet) {
  const values = sheet && typeof sheet.values === 'object' ? sheet.values : sheet;
  if (!values || typeof values !== 'object') return [];
  const rows = [];
  for (const key of SHEET_KEYS) {
    const shown = values[key];
    if (typeof shown !== 'number' || !Number.isFinite(shown)) continue;
    const meta = sheetKeyMeta(key);
    let c = computed?.[key];
    if (c == null && meta.isRaw) c = computed?.[meta.totalKey];
    if (typeof c !== 'number' || !Number.isFinite(c)) {
      rows.push({ key, computed: null, sheet: shown, delta: null, withinTolerance: false });
      continue;
    }
    const delta = shown - c;
    rows.push({ key, computed: c, sheet: shown, delta, withinTolerance: Math.abs(delta) <= meta.tolerance + EPS });
  }
  return rows;
}

/**
 * Count of rows the model explains vs not.
 * @param {SheetDiffRow[]} rows
 */
export function summariseDiff(rows) {
  const explained = rows.filter((r) => r.withinTolerance).length;
  return { total: rows.length, explained, unexplained: rows.length - explained };
}
