// The in-game stat sheet: the authoritative key list, units, tolerances and text parsing.
// Keys are the ComputedStats keys (engine/types.js). Units: docs/Reference/Game/stats.md §1.3;
// tolerances: rebuild-plan §4 (Attack/HP ±1, percent ±0.1, multipliers ±0.01).
import { STATS } from '../../game/stats.js';

/** @typedef {'integer'|'percent'|'multiplier'} SheetKind */
/**
 * @typedef {Object} SheetKeyMeta
 * @property {string} key  ComputedStats key
 * @property {string} label  sheet label
 * @property {SheetKind} kind  integer (flat/rating), percent (percent points), multiplier (1.0 = 100%)
 * @property {number} digits  decimals the pipeline rounds this value to
 * @property {number} displayMult  the sheet shows value * displayMult (100 for multipliers)
 * @property {number} tolerance  largest |computed - sheet| still counted as explained
 * @property {boolean} isRaw  true for a `raw*` key
 * @property {string|null} rawKey  the raw key of a capped total, else null
 * @property {string|null} totalKey  for a raw key, the total it belongs to
 * @property {string[]} classes  classes whose sheet shows this row
 */

const ALL = ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER'];
const TOL = { integer: 1, percent: 0.1, multiplier: 0.01 };

/** @type {SheetKeyMeta[]} */
const rows = [];
function addRow(key, label, kind, digits, displayMult, rawKey, classes, tolerance = TOL[kind]) {
  rows.push({
    key, label, kind, digits, displayMult, tolerance, isRaw: false, rawKey, totalKey: null, classes,
  });
  if (rawKey) {
    rows.push({
      key: rawKey, label: `${label} (raw)`, kind, digits, displayMult, tolerance, isRaw: true,
      rawKey: null, totalKey: key, classes,
    });
  }
}

addRow('totalAttack', 'Attack', 'integer', 0, 1, null, ALL);
addRow('totalHp', 'Health', 'integer', 0, 1, null, ALL);
for (const s of STATS) {
  if (!s.computedKey) continue; // FEAR_CHANCE folds into totalDisruptionChance
  const dm = s.displayMult ?? 1;
  const digits = s.roundDigits ?? 1;
  const kind = dm === 100 ? 'multiplier' : digits === 0 ? 'integer' : 'percent';
  // The sheet row also shows for a class whose Fear folds into Disruption.
  const classes = s.computedKey === 'totalDisruptionChance'
    ? [...s.classesAvailable, 'NECROMANCER'] : s.classesAvailable;
  addRow(s.computedKey, s.sheetLabel, kind, digits, dm, s.rawKey ?? null, classes);
}
// Dominion is derived, never user-entered (stats.md §3.5): exact match required. Conduits are sums
// of rounded floats, so they keep the integer tolerance.
addRow('totalDominion', 'Dominion', 'integer', 0, 1, null, ['NECROMANCER'], 0);
addRow('totalFlameConduit', 'Flame Conduit', 'integer', 0, 1, null, ALL);
addRow('totalEarthenConduit', 'Earthen Conduit', 'integer', 0, 1, null, ALL);
addRow('totalDarkConduit', 'Dark Conduit', 'integer', 0, 1, null, ALL);

// The pipeline never soft-caps Minion Attack Speed and never emits a raw key for it
// (stats.md §3.4; the catalogue's 2/4 cap is applied nowhere in calculateTotalStats).
const row = rows.find((r) => r.key === 'totalMinionAttackSpeed');
row.rawKey = null;

/** Every key a sheet may carry, in display order (totals then raws interleaved). */
export const SHEET_KEY_META = Object.freeze(rows.map((r) => Object.freeze(r)));
const byKey = new Map(SHEET_KEY_META.map((m) => [m.key, m]));

export const SHEET_KEYS = Object.freeze(SHEET_KEY_META.map((m) => m.key));
export const TOTAL_KEYS = Object.freeze(SHEET_KEY_META.filter((m) => !m.isRaw).map((m) => m.key));
export const RAW_KEYS = Object.freeze(SHEET_KEY_META.filter((m) => m.isRaw).map((m) => m.key));

export const isSheetKey = (key) => byKey.has(key);
export const sheetKeyMeta = (key) => byKey.get(key) ?? null;
/** `rawCritChance` for `totalCritChance`; null for uncapped stats. */
export const rawKeyOf = (totalKey) => byKey.get(totalKey)?.rawKey ?? null;
/** `totalCritChance` for `rawCritChance`; null otherwise. */
export const totalKeyOf = (rawKey) => byKey.get(rawKey)?.totalKey ?? null;
/** Largest |computed - sheet| still counted as explained (0 for unknown keys). */
export const toleranceFor = (key) => byKey.get(key)?.tolerance ?? 0;

/** Total keys (no raw) the sheet shows for a class, in display order. */
export function sheetKeysForClass(playerClass) {
  return SHEET_KEY_META
    .filter((m) => !m.isRaw && m.classes.includes(playerClass))
    .map((m) => m.key);
}

/**
 * Authoritative sheet filter: keeps only known keys holding finite, non-negative numbers.
 * @param {Object} values
 * @returns {Object<string, number>}
 */
export function normaliseSheetValues(values) {
  const out = {};
  if (!values || typeof values !== 'object') return out;
  for (const key of SHEET_KEYS) {
    const v = values[key];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v;
  }
  return out;
}

/** Stat value -> the number the in-game sheet prints (multipliers x100). */
export function toDisplay(key, value) {
  const m = byKey.get(key);
  if (!m || !Number.isFinite(value)) return value;
  return Number((value * m.displayMult).toFixed(4));
}

/** The number typed from the in-game sheet -> stat value (percent -> multiplier for Atk Speed etc.). */
export function fromDisplay(key, shown) {
  const m = byKey.get(key);
  if (!m || !Number.isFinite(shown)) return shown;
  return Number((shown / m.displayMult).toFixed(6));
}

// Flat values use "." (or "," / space) as a THOUSANDS separator; percent values use "." as a DECIMAL
// point (CLAUDE.md number-format gotcha). A lone "," in a percent value is read as a decimal comma.
function parseFlat(text) {
  const digits = text.replace(/[^\d]/g, '');
  return digits === '' ? null : Number(digits);
}
function parseDecimal(text) {
  const t = text.replace(/[^\d.,]/g, '');
  if (t === '' || !/\d/.test(t)) return null;
  const lastDot = t.lastIndexOf('.');
  const lastComma = t.lastIndexOf(',');
  let dec = -1;
  if (lastDot >= 0 && lastComma >= 0) dec = Math.max(lastDot, lastComma);
  else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : null;
    if (sep && t.split(sep).length === 2) dec = t.indexOf(sep); // a single separator is the decimal
  }
  const intPart = (dec >= 0 ? t.slice(0, dec) : t).replace(/[.,]/g, '');
  const frac = dec >= 0 ? t.slice(dec + 1).replace(/[.,]/g, '') : '';
  const n = Number(`${intPart || '0'}${frac ? `.${frac}` : ''}`);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse text typed from the in-game sheet into a stat value in engine units, or null.
 * Integer rows treat every "." "," and space as a thousands separator; percent rows read the
 * separator as a decimal point; multiplier rows (Attack Speed, Crit Damage, Minion Attack Speed)
 * are typed as the shown percent ("250%" or "250" -> 2.5). Negative or empty input is null.
 * @param {string} key  a SHEET_KEYS key
 * @param {string|number} text
 * @returns {number|null}
 */
export function parseSheetInput(key, text) {
  const m = byKey.get(key);
  if (!m) return null;
  if (typeof text === 'number') return Number.isFinite(text) && text >= 0 ? text : null;
  if (typeof text !== 'string' || /-/.test(text)) return null;
  const shown = m.kind === 'integer' ? parseFlat(text) : parseDecimal(text);
  if (shown == null) return null;
  return m.kind === 'multiplier' ? fromDisplay(key, shown) : shown;
}
