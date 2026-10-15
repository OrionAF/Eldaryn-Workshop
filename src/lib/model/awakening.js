// model/awakening.js - persisted field `awakening: { path, level }` (rebuild-plan §3).
// path 'SHADOW' | 'RADIANT' | null; level 0..maxPoints (15), forced to 0 without a path
// (awakening.md §3-§4, data/awakening.json).
//
// Domain contract (§3 "Normalisation layout"): partial-character functions, see model/index.js.
import { AWAKENING_PATHS, AWAKENING_CONSTANTS } from '../game/awakening.js';
import { awakeningPointsForLevel } from './legality.js';

export function defaultAwakening() {
  return { awakening: { path: null, level: 0 } };
}

function build(pathRaw, levelRaw, playerLevel) {
  const key = typeof pathRaw === 'string' ? pathRaw.toUpperCase() : null;
  const path = key && AWAKENING_PATHS[key] ? key : null;
  const n = Math.floor(Number(levelRaw));
  const cap = Math.min(AWAKENING_CONSTANTS.maxPoints, awakeningPointsForLevel(playerLevel));
  const level = path && Number.isFinite(n) ? Math.max(0, Math.min(cap, n)) : 0;
  return { awakening: { path, level } };
}

export function normaliseAwakening(rawCharacter, ctx) {
  return build(rawCharacter?.awakening?.path, rawCharacter?.awakening?.level, ctx?.level);
}

/** v1 `awakening{path, points}` -> `awakening{path, level}`. Nothing references it by id. */
export function migrateAwakeningFromV1(v1Character) {
  return { value: build(v1Character?.awakening?.path, v1Character?.awakening?.points, 100), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileAwakening(character) {}

/**
 * Which per-level bundle applies, and why (awakening.json calc.precedence: spec override, then class
 * override, then the path default; an override REPLACES the whole bundle).
 * @returns {{bundle: object, source: 'spec'|'class'|'path', highlights: string[]} | null}
 */
export function awakeningBundle(path, cls, spec) {
  const p = AWAKENING_PATHS[path];
  if (!p) return null;
  const s = spec && p.specOverrides?.[spec];
  if (s) return { bundle: s.bonusPerLevel, source: 'spec', highlights: s.highlights ?? p.highlights };
  const c = cls && p.classOverrides?.[cls];
  if (c) return { bundle: c.bonusPerLevel, source: 'class', highlights: c.highlights ?? p.highlights };
  return { bundle: p.bonusPerLevel, source: 'path', highlights: p.highlights };
}

/** Bonuses at `level` for the non-zero keys of the bundle: parseFloat((perLevel*level).toFixed(d)) (calc.perKey). */
export function awakeningBonuses(path, level, cls, spec) {
  const b = awakeningBundle(path, cls, spec);
  if (!b || !(level > 0)) return {};
  const out = {};
  for (const [k, per] of Object.entries(b.bundle)) {
    if (!per) continue;
    out[k] = parseFloat((per * level).toFixed(k === 'attackSpeedFlat' ? 2 : 1));
  }
  return out;
}
