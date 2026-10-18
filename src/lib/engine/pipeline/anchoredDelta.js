// Sheet-anchored deltas (rebuild-plan §4): add a raw-space change to a known in-game sheet without
// recomputing the whole build. Mirrors the client's softCapGainFromSheet (L1080334-1080366, see
// stats.md §4.1) for the capped stats; Attack/HP use the flat x percent split of stats.md §3.2.
import { applySoftCap, rawFromSoftCapped, capConfig } from '../core/caps.js';
import { rawKeyOf, sheetKeyMeta } from './sheet.js';

const fix = (x, d) => parseFloat(x.toFixed(d));
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// Stats calculateTotalStats zeroes by class / form / spec (stats.md §3.3); a delta there is inert.
function isInert(key, ctx) {
  const cls = ctx.playerClass;
  if (cls === 'NECROMANCER') {
    return key === 'totalCritChance' || key === 'totalLifesteal' || key === 'totalPenetration';
  }
  if (cls === 'MYSTIC') {
    if ((key === 'totalDamageReduction' || key === 'totalBlockChance') && !ctx.formConfig?.unlocksBlockAndDr) {
      return true;
    }
    if (key === 'totalSpellCritChance' && ctx.activeSpec !== 'MYSTIC_MAGE') return true;
  }
  return false;
}

// Uncapped additive totals: key -> decimals (null = Math.round).
const UNCAPPED = {
  totalSpellDamage: 1, totalMinionAttack: 1, totalMinionHealth: 1, totalMinionAttackSpeed: 2,
  totalPvpAttack: null, totalPvpDefense: null, totalOblivionPower: null,
  totalFlameConduit: null, totalEarthenConduit: null, totalDarkConduit: null,
};

// Attack or HP: total = floor(flat x (1 + percent/100) x mult). With the computed split (`exFlat`,
// `exPct`) and a sheet percent that rounds the same, the change is computed exactly and only the
// residual (sheet - computed) is anchored (#16). Otherwise the flat is recovered from the sheet's
// 1-dp percent, which is off by up to 0.05 points: the result carries an error bound.
function anchorProduct(t, pct, dFlat, dPct, mult, exFlat, exPct) {
  if (Number.isFinite(exFlat) && Number.isFinite(exPct) && typeof pct === 'number' && fix(exPct, 1) === pct) {
    const c0 = exFlat * (1 + exPct / 100) * mult;
    const c1 = (exFlat + dFlat) * (1 + (exPct + dPct) / 100) * mult;
    const pre = Math.floor(c0) === t ? c0 : t + 0.5; // the sheet's floor: lost fraction estimated at 0.5
    return { total: Math.max(0, Math.floor(pre + c1 - c0)), pct: fix(Math.max(0, exPct + dPct), 1), error: 0 };
  }
  const p = num(pct);
  const flat = t / ((1 + p / 100) * mult);
  const next = (flat + dFlat) * (1 + (p + dPct) / 100) * mult;
  // |d next / d percent| x 0.05, plus the floor.
  const error = Math.ceil(0.05 * (t * Math.abs(dPct) / (100 + p) ** 2 + Math.abs(dFlat) * mult / 100)) + 1;
  return { total: Math.max(0, Math.floor(t + 0.5 + (next - t))), pct: fix(Math.max(0, p + dPct), 1), error };
}

/**
 * Apply `rawDelta` to an in-game sheet; see anchoredDeltaDetailed. Returns the stats only.
 * @returns {import('../types.js').ComputedStats}
 */
export function anchoredDelta(sheet, rawDelta, ctx = {}) {
  return anchoredDeltaDetailed(sheet, rawDelta, ctx).stats;
}

/**
 * Apply `rawDelta` to an in-game sheet.
 *
 * `rawDelta` is keyed by ComputedStats key and expressed in the same space the pipeline sums in
 * BEFORE the curve (so a gear swap's per-stat difference can be passed straight in):
 *  - capped / uncapped secondaries: the change in the raw sum (Attack Speed and Crit Damage as
 *    multiplier deltas). `totalAttackSpeed` is scaled by the form's attackSpeedMult.
 *  - `totalAttack`: change in flat Attack. `totalHp`: change in flat HP from equipped GEAR (it is
 *    scaled by the form's gearHpMult). `totalAttackPercent` / `totalHealthPercent`: percent points.
 *  - `fearChance` (optional) folds into `totalDisruptionChance`.
 * `sheet` is a Sheet ({values}) or bare values. A missing sheet key counts as 0.
 *
 * `ctx.exact` is the computed pipeline's unrounded split of the same build (calculateTotalStatsExact
 * `.exact`, computePresetStats `.exact`). Where it agrees with the sheet it replaces the values the
 * sheet rounded away:
 *  - Attack/HP: the exact percent and flat when the sheet's percent rounds from the computed one;
 *  - capped stats: the exact raw when the sheet's total rounds from it (#17).
 * Without it, capped stats start from `sheet.raw<Key>` when printed, otherwise
 * `rawFromSoftCapped(effective)` (flagged: within one display tick), and Attack/HP from the sheet's
 * 1-dp percent (flagged, with a bound). Capped stats re-emit `raw<Key>` only when the new raw exceeds
 * the soft cap; a stat at or above its hard cap (raw not recoverable) is left unchanged. Attack/HP
 * keep the sheet's floor: the lost fraction is estimated at 0.5 so a zero change returns the sheet.
 *
 * @param {{values: Object<string, number>}|Object<string, number>} sheet
 * @param {Object<string, number>} rawDelta
 * @param {{playerClass?: string, formConfig?: Object|null, activeSpec?: string|null, exact?: Object|null}} [ctx]
 * @returns {{stats: import('../types.js').ComputedStats, approx: boolean, errors: Object<string, number>}}
 *   `stats` is a new object (the input is not mutated); `errors[key]` bounds |stats[key] - recompute|
 *   for each estimated key, and `approx` is true when there is any.
 */
export function anchoredDeltaDetailed(sheet, rawDelta, ctx = {}) {
  const values = sheet && typeof sheet.values === 'object' ? sheet.values : (sheet ?? {});
  const out = { ...values };
  const errors = {};
  const d = { ...(rawDelta ?? {}) };
  const fc = ctx.formConfig ?? null;
  const ex = ctx.exact ?? null;
  const cx = { ...ctx, formConfig: fc };
  if (d.fearChance) d.totalDisruptionChance = num(d.totalDisruptionChance) + num(d.fearChance);
  if (d.totalAttackSpeed) d.totalAttackSpeed = d.totalAttackSpeed * (fc?.attackSpeedMult ?? 1);

  // Attack / HP: flat x (1 + percent/100) [x form multiplier]
  const dPctA = num(d.totalAttackPercent);
  const dPctH = num(d.totalHealthPercent);
  if (typeof values.totalAttack === 'number' && (num(d.totalAttack) || dPctA)) {
    const r = anchorProduct(values.totalAttack, values.totalAttackPercent, num(d.totalAttack), dPctA,
      (fc?.attackMult ?? 1) * (ctx.stanceConfig?.attackMult ?? 1), ex?.attackFlat, ex?.attackPercent);
    out.totalAttack = r.total;
    if (dPctA) out.totalAttackPercent = r.pct;
    if (r.error) errors.totalAttack = r.error;
  } else if (dPctA) {
    out.totalAttackPercent = fix(Math.max(0, num(values.totalAttackPercent) + dPctA), 1);
  }
  if (typeof values.totalHp === 'number' && (num(d.totalHp) || dPctH)) {
    const r = anchorProduct(values.totalHp, values.totalHealthPercent, num(d.totalHp) * (fc?.gearHpMult ?? 1), dPctH,
      1, ex?.hpFlat, ex?.healthPercent);
    out.totalHp = r.total;
    if (dPctH) out.totalHealthPercent = r.pct;
    if (r.error) errors.totalHp = r.error;
  } else if (dPctH) {
    out.totalHealthPercent = fix(Math.max(0, num(values.totalHealthPercent) + dPctH), 1);
  }

  for (const [key, delta] of Object.entries(d)) {
    const dv = num(delta);
    if (!dv || key === 'totalAttack' || key === 'totalHp' || key === 'totalAttackPercent'
      || key === 'totalHealthPercent' || key === 'fearChance') continue;
    if (isInert(key, cx)) continue;
    if (key in UNCAPPED) {
      const digits = UNCAPPED[key];
      const next = Math.max(0, num(values[key]) + dv);
      out[key] = digits == null ? Math.round(next) : fix(next, digits);
      continue;
    }
    const meta = sheetKeyMeta(key);
    const cfg = meta && !meta.isRaw ? capConfig(key) : null;
    const rawKey = rawKeyOf(key);
    if (!cfg || !rawKey) continue; // unknown or non-additive key (e.g. totalDominion)
    const eff = num(values[key]);
    const printed = values[rawKey];
    const hasPrinted = typeof printed === 'number' && printed > cfg.soft;
    const exRaw = ex?.raw?.[key];
    let raw0;
    if (Number.isFinite(exRaw) && fix(applySoftCap(exRaw, cfg), meta.digits) === eff
      && (!hasPrinted || fix(exRaw, meta.digits) === printed)) {
      raw0 = exRaw;
    } else if (hasPrinted) {
      raw0 = printed;
    } else {
      raw0 = rawFromSoftCapped(eff, cfg);
      errors[key] = 10 ** -meta.digits; // the inverted 1-dp total may land one display tick off
    }
    if (!Number.isFinite(raw0)) { // at/above the hard cap: raw is not recoverable
      delete errors[key];
      continue;
    }
    const raw1 = Math.max(0, raw0 + dv);
    out[key] = fix(applySoftCap(raw1, cfg), meta.digits);
    if (raw1 > cfg.soft) out[rawKey] = fix(raw1, meta.digits);
    else delete out[rawKey];
  }
  return { stats: out, approx: Object.keys(errors).length > 0, errors };
}
