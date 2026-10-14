// Character core (M1): identity, class, level, base residual, and the Sheet shape shared by presets
// and the Oblivion realm. Pure; imports L1 only. Shape: rebuild-plan §3 (Character, Sheet) and §4.
import { CLASSES, MAX_PLAYER_LEVEL } from '../game/classes.js';
import { BASE_STATS } from '../game/stats.js';

let idCounter = 0;
/** Short unique id. Not cryptographic; ids only need to be unique within one roster. */
export function newId(prefix = 'c') {
  idCounter += 1;
  const rnd = Math.random().toString(36).slice(2, 7);
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${rnd}`;
}

/** 'WARRIOR' | ... | null. Accepts the v1 spellings ('Warrior') case-insensitively. */
export function normaliseClass(raw) {
  if (typeof raw !== 'string') return null;
  const up = raw.trim().toUpperCase();
  return CLASSES.includes(up) ? up : null;
}

/** 1..MAX_PLAYER_LEVEL. Only a number or a non-empty numeric string counts; anything else is the max level (#122). */
export function normaliseLevel(raw) {
  const usable = typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '');
  const n = usable ? Math.floor(Number(raw)) : NaN;
  if (!Number.isFinite(n)) return MAX_PLAYER_LEVEL;
  return Math.min(MAX_PLAYER_LEVEL, Math.max(1, n));
}

export const RESIDUAL_KEYS = ['attack', 'hp', 'attackSpeed', 'critChance', 'critDamage'];

/** rebuild-plan §4 tier-1 base: the client's baseStats until the user absorbs a sheet residual. */
export function defaultBaseResidual() {
  const out = {};
  for (const k of RESIDUAL_KEYS) out[k] = BASE_STATS[k];
  return out;
}

export function normaliseBaseResidual(raw) {
  const out = defaultBaseResidual();
  if (raw && typeof raw === 'object') {
    for (const k of RESIDUAL_KEYS) {
      const v = Number(raw[k]);
      if (raw[k] != null && Number.isFinite(v) && v >= 0) out[k] = v;
    }
  }
  return out;
}

function isSheetKey(k) {
  return typeof k === 'string' && /^(total|raw)[A-Z]/.test(k);
}

/**
 * Sheet = { values: Partial<ComputedStats>, enteredAt } - the tier-2 in-game sheet (plan §4).
 * Only finite numbers under `total*` / `raw*` keys survive; the authoritative key list is the
 * `engine/pipeline/sheet.js` slice (E3). Returns null when nothing usable is left.
 */
export function normaliseSheet(raw) {
  if (!raw || typeof raw !== 'object' || !raw.values || typeof raw.values !== 'object') return null;
  const values = {};
  for (const [k, v] of Object.entries(raw.values)) {
    if (isSheetKey(k) && typeof v === 'number' && Number.isFinite(v)) values[k] = v;
  }
  if (Object.keys(values).length === 0) return null;
  return { values, enteredAt: typeof raw.enteredAt === 'string' ? raw.enteredAt : null };
}

export function makeSheet(values, enteredAt = new Date().toISOString()) {
  return normaliseSheet({ values, enteredAt });
}

/** The core (non-domain) character fields. `raw` may be anything. */
export function normaliseCore(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  return {
    id: typeof c.id === 'string' && c.id ? c.id : newId(),
    name: typeof c.name === 'string' && c.name.trim() ? c.name.trim() : 'Character',
    class: normaliseClass(c.class),
    level: normaliseLevel(c.level),
    baseResidual: normaliseBaseResidual(c.baseResidual),
  };
}

export function defaultCore(name = 'New Character', cls = null) {
  return {
    id: newId(),
    name: typeof name === 'string' && name.trim() ? name.trim() : 'New Character',
    class: normaliseClass(cls),
    level: MAX_PLAYER_LEVEL,
    baseResidual: defaultBaseResidual(),
  };
}
