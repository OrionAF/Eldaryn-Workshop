// sheetText.js (F33): read a pasted block of in-game stat lines ("Attack 48.124", "Crit Chance: 6.2%")
// into sheet values. Numbers go through sheet.js parseSheetInput, which owns the "." thousands (flat) vs
// decimal (percent) rule and the shown-percent multipliers. Labels match the sheet's own labels and the
// class display labels (lib/ui/statOrder.js), ignoring case, spaces and punctuation other than "%".
import { SHEET_KEY_META, sheetKeyMeta, parseSheetInput } from '../engine/pipeline/sheet.js';
import { orderedStatLabel } from '../ui/statOrder.js';

const norm = (label) => String(label).toLowerCase().replace(/[^a-z0-9%]/g, '');

// A label, an optional separator, then a trailing number (with "%" or a leading "-" kept so the parser
// can read or refuse it).
const LINE = /^(.*?[^\d\s:=\t.,+-])[\s:=\t]*([+-]?\d[\d.,\s]*%?)$/;

/** Every label a key answers to for a class: the sheet label and the class display label. */
function labelsFor(key, playerClass) {
  const meta = sheetKeyMeta(key);
  if (!meta) return [];
  return [meta.label, orderedStatLabel(key, meta.label, playerClass)];
}

/**
 * @param {string} text  pasted lines; blank lines are skipped
 * @param {string[]} keys  the sheet keys this sheet shows (class and realm already applied)
 * @param {string|null} [playerClass]
 * @returns {{values: Object<string, number>, rows: {key: string, label: string, value: number}[],
 *   unmatched: {line: string, reason: 'unknown'|'other'|'invalid'}[]}}
 *   `rows` holds one entry per key in paste order (a repeated label: the last one wins); `unmatched`
 *   lists lines with no known label ('unknown'), a label this sheet does not show ('other'), or a number
 *   that does not read ('invalid'). Nothing in `unmatched` is written.
 */
export function parseSheetText(text, keys, playerClass = null) {
  const allowed = new Map();
  for (const k of keys) for (const l of labelsFor(k, playerClass)) allowed.set(norm(l), k);
  const known = new Set(SHEET_KEY_META.map((m) => norm(m.label)));

  const byKey = new Map();
  const unmatched = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = LINE.exec(line);
    if (!m) {
      // No trailing number: a known label followed by junk ("Crit Chance abc") is a bad number.
      const words = line.split(/[\s:=]+/);
      const hit = words.some((_, i) => allowed.has(norm(words.slice(0, i + 1).join(' '))));
      unmatched.push({ line, reason: hit ? 'invalid' : 'unknown' });
      continue;
    }
    const label = m[1].trim();
    const key = allowed.get(norm(label));
    if (!key) {
      unmatched.push({ line, reason: key ? 'invalid' : known.has(norm(label)) ? 'other' : 'unknown' });
      continue;
    }
    const value = parseSheetInput(key, m[2].trim());
    if (value === null) {
      unmatched.push({ line, reason: 'invalid' });
      continue;
    }
    byKey.delete(key); // re-insert so the row sits where its last line was
    byKey.set(key, { key, label: orderedStatLabel(key, sheetKeyMeta(key).label, playerClass), value });
  }
  const rows = [...byKey.values()];
  return { values: Object.fromEntries(rows.map((r) => [r.key, r.value])), rows, unmatched };
}
