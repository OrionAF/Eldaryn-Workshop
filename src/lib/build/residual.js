// build/residual.js (C1a): the gap between the in-game sheet and the computed stats (rebuild-plan §4).
//
// A residual is a sparse object keyed by ComputedStats total key, in the space the pipeline sums
// in: capped stats are RAW points (before the soft-cap curve; Attack Speed and Crit Damage as
// multiplier deltas), every other stat is a plain difference of totals. It is carried onto
// candidates built from the same preset (applyResidual) or moved into the base stats ("absorb").
import { capConfig, applySoftCap, rawFromSoftCapped } from '../engine/core/caps.js';
import { TOTAL_KEYS, sheetKeyMeta, normaliseSheetValues } from '../engine/pipeline/sheet.js';

const fix = (x, d) => parseFloat(x.toFixed(d));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (isNum(v) ? v : 0);

/** Sheet or bare values -> the strict, known-keys-only values object. */
export function sheetValuesOf(sheet) {
  return normaliseSheetValues(sheet && typeof sheet.values === 'object' ? sheet.values : sheet);
}

// Raw sum of a capped stat held in a stats object: the printed raw key when present (it is only
// printed above the soft cap), else the total (at or below the soft cap raw equals the total),
// else the inverse of the curve. Infinity when the total sits at or above the hard cap.
function rawOf(stats, key, rawKey, cfg) {
  const printed = stats[rawKey];
  if (isNum(printed) && printed > cfg.soft) return printed;
  return rawFromSoftCapped(num(stats[key]), cfg);
}

/**
 * Residual of a sheet against computed stats: for each total key the sheet carries and the class
 * shows, `sheet - computed` (raw space for capped stats). Differences inside the sheet tolerance
 * are noise and are left out; so is Dominion, which is derived and never user-entered.
 * @param {import('../engine/types.js').ComputedStats} computed
 * @param {{values: Object<string, number>}|Object<string, number>|null} sheet
 * @param {{playerClass?: string}} [opts]
 * @returns {Object<string, number>}
 */
export function computeResidual(computed, sheet, { playerClass } = {}) {
  const values = sheetValuesOf(sheet);
  const out = {};
  for (const key of TOTAL_KEYS) {
    if (key === 'totalDominion') continue;
    const meta = sheetKeyMeta(key);
    if (playerClass && !meta.classes.includes(playerClass)) continue;
    const shown = values[key];
    const calc = computed?.[key];
    if (!isNum(shown) || !isNum(calc)) continue;
    let d = shown - calc;
    if (meta.rawKey) {
      const cfg = capConfig(key);
      const rs = rawOf(values, key, meta.rawKey, cfg);
      const rc = rawOf(computed, key, meta.rawKey, cfg);
      if (!Number.isFinite(rs) || !Number.isFinite(rc)) continue; // at the hard cap: raw is not recoverable
      d = rs - rc;
      // Without a printed raw the estimate is only as good as the rounded total: trust the total's tolerance.
      const printed = isNum(values[meta.rawKey]);
      if (printed ? Math.abs(d) <= meta.tolerance : Math.abs(shown - calc) <= meta.tolerance) continue;
    } else if (Math.abs(d) <= meta.tolerance) {
      continue;
    }
    out[key] = fix(d, 4);
  }
  return out;
}

/**
 * Add a residual to computed stats (or to any candidate's stats): capped stats in raw space with
 * the curve applied afterwards, everything else on the total. Returns a new object.
 * @param {import('../engine/types.js').ComputedStats} stats
 * @param {Object<string, number>|null} residual
 * @returns {import('../engine/types.js').ComputedStats}
 */
export function applyResidual(stats, residual) {
  const out = { ...stats };
  for (const [key, d] of Object.entries(residual ?? {})) {
    if (!isNum(d) || d === 0) continue;
    const meta = sheetKeyMeta(key);
    if (!meta || meta.isRaw) continue;
    if (meta.rawKey) {
      const cfg = capConfig(key);
      const raw0 = rawOf(stats, key, meta.rawKey, cfg);
      if (!Number.isFinite(raw0)) continue;
      const raw1 = Math.max(0, raw0 + d);
      out[key] = fix(applySoftCap(raw1, cfg), meta.digits);
      if (raw1 > cfg.soft) out[meta.rawKey] = fix(raw1, meta.digits);
      else delete out[meta.rawKey];
    } else {
      const next = Math.max(0, num(stats[key]) + d);
      out[key] = meta.digits === 0 ? Math.round(next) : fix(next, meta.digits);
    }
  }
  return out;
}

/**
 * "Absorb into base" (rebuild-plan §4): move the Attack, HP, Attack Speed, Crit Chance and Crit
 * Damage residuals into the base stats so the computed totals match the sheet on them. The other
 * residuals stay. Each residual is undone through the same factors calculateTotalStats applies.
 * @param {import('../engine/types.js').BaseStats} base  character.baseResidual
 * @param {import('../engine/types.js').ComputedStats} computed  computed stats (for the % buckets)
 * @param {Object<string, number>} residual
 * @param {{formConfig?: Object|null}} [ctx]
 * @returns {{base: import('../engine/types.js').BaseStats, residual: Object<string, number>}}
 */
export function absorbIntoBase(base, computed, residual, ctx = {}) {
  const fc = ctx.formConfig ?? null;
  const next = { ...base };
  const rest = { ...residual };
  const take = (key) => {
    const v = rest[key];
    delete rest[key];
    return isNum(v) ? v : 0;
  };
  const r4 = (x) => fix(Math.max(0, x), 4);
  next.attack = r4(next.attack + take('totalAttack') / ((1 + num(computed?.totalAttackPercent) / 100) * (fc?.attackMult ?? 1) * (ctx.stanceConfig?.attackMult ?? 1)));
  next.hp = r4(next.hp + take('totalHp') / (1 + num(computed?.totalHealthPercent) / 100));
  next.attackSpeed = r4(next.attackSpeed + take('totalAttackSpeed') / (fc?.attackSpeedMult ?? 1));
  next.critChance = r4(next.critChance + take('totalCritChance'));
  next.critDamage = r4(next.critDamage + take('totalCritDamage'));
  return { base: next, residual: rest };
}
