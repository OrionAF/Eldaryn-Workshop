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
 * Capped stats start from `sheet.raw<Key>` when printed, otherwise `rawFromSoftCapped(effective)`,
 * and re-emit `raw<Key>` only when the new raw exceeds the soft cap. A stat sitting at or above its
 * hard cap (raw not recoverable) is left unchanged. Attack/HP keep the sheet's floor error: the lost
 * fraction is estimated at 0.5 so a zero change returns the sheet value.
 *
 * @param {{values: Object<string, number>}|Object<string, number>} sheet
 * @param {Object<string, number>} rawDelta
 * @param {{playerClass?: string, formConfig?: Object|null, activeSpec?: string|null}} [ctx]
 * @returns {import('../types.js').ComputedStats} a new object; the input is not mutated
 */
export function anchoredDelta(sheet, rawDelta, ctx = {}) {
  const values = sheet && typeof sheet.values === 'object' ? sheet.values : (sheet ?? {});
  const out = { ...values };
  const d = { ...(rawDelta ?? {}) };
  const fc = ctx.formConfig ?? null;
  const cx = { ...ctx, formConfig: fc };
  if (d.fearChance) d.totalDisruptionChance = num(d.totalDisruptionChance) + num(d.fearChance);
  if (d.totalAttackSpeed) d.totalAttackSpeed = d.totalAttackSpeed * (fc?.attackSpeedMult ?? 1);

  // Attack / HP: flat x (1 + percent/100) [x form multiplier]
  const attackMult = fc?.attackMult ?? 1;
  const gearHpMult = fc?.gearHpMult ?? 1;
  const pctA = num(values.totalAttackPercent);
  const pctH = num(values.totalHealthPercent);
  const dPctA = num(d.totalAttackPercent);
  const dPctH = num(d.totalHealthPercent);
  if (typeof values.totalAttack === 'number' && (num(d.totalAttack) || dPctA)) {
    const t = values.totalAttack;
    const flat = t / ((1 + pctA / 100) * attackMult);
    const next = (flat + num(d.totalAttack)) * (1 + (pctA + dPctA) / 100) * attackMult;
    out.totalAttack = Math.max(0, Math.floor(t + 0.5 + (next - t)));
  }
  if (typeof values.totalHp === 'number' && (num(d.totalHp) || dPctH)) {
    const t = values.totalHp;
    const flat = t / (1 + pctH / 100);
    const next = (flat + num(d.totalHp) * gearHpMult) * (1 + (pctH + dPctH) / 100);
    out.totalHp = Math.max(0, Math.floor(t + 0.5 + (next - t)));
  }
  if (dPctA) out.totalAttackPercent = fix(Math.max(0, pctA + dPctA), 1);
  if (dPctH) out.totalHealthPercent = fix(Math.max(0, pctH + dPctH), 1);

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
    const raw0 = typeof printed === 'number' && printed > cfg.soft ? printed : rawFromSoftCapped(eff, cfg);
    if (!Number.isFinite(raw0)) continue; // at/above the hard cap: raw is not recoverable
    const raw1 = Math.max(0, raw0 + dv);
    out[key] = fix(applySoftCap(raw1, cfg), meta.digits);
    if (raw1 > cfg.soft) out[rawKey] = fix(raw1, meta.digits);
    else delete out[rawKey];
  }
  return out;
}
