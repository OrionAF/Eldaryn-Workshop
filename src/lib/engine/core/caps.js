// Soft caps, combat ceilings and PVP rating conversion.
// Cap numbers come from the L1 catalogue (src/lib/game/stats.js); see docs/Reference/Game/stats.md.
import { softCap, hardCap, combatCeiling, SOFT_CAP_CURVE, PVP_RATING } from '../../game/stats.js';

/** Soft-cap curve exponent (SOFT_CAP_CURVE_EXPONENT). */
const EXP = SOFT_CAP_CURVE.exponent;
/** PVP_RATING_K */
const PVP_K = PVP_RATING.K;

/** @typedef {{soft:number, hard:number}} CapCfg */

/**
 * Cap config for a stat (computedKey or enum name), or null when it has no soft cap.
 * @returns {CapCfg|null}
 */
export function capConfig(id) {
  const soft = softCap(id);
  const hard = hardCap(id);
  return soft == null || hard == null ? null : { soft, hard };
}

// port of applySoftCap L1080181-1080222
export function applySoftCap(raw, cfg) {
  if (!(raw > cfg.soft)) return raw;
  const k = cfg.hard - cfg.soft;
  if (!(k > 0)) return Math.min(raw, cfg.hard);
  const s = EXP * k;
  return cfg.soft + k * (1 - Math.pow(s / (raw - cfg.soft + s), EXP));
}

// port of rawFromSoftCapped L1080224-1080265 (inverse of applySoftCap; Infinity at/above the hard cap)
export function rawFromSoftCapped(capped, cfg) {
  if (!(capped > cfg.soft)) return capped;
  const k = cfg.hard - cfg.soft;
  if (!(k > 0) || capped >= cfg.hard) return Infinity;
  const s = EXP * k;
  const x = Math.pow(1 - (capped - cfg.soft) / k, 0.5);
  return cfg.soft + s / x - s;
}

// port of applyCombatCeiling L1080297-1080308
export function applyCombatCeiling(value, ceiling) {
  return value > ceiling ? ceiling : value;
}

/** Combat ceiling for a stat (computedKey or enum name), or null. */
export const ceilingFor = (id) => combatCeiling(id);

// port of softCapGainFromSheet L1080334-1080366
/** Extra capped value from adding rawDelta on top of an already-capped sheet value. */
export function softCapGainFromSheet(sheetValue, rawDelta, cfg) {
  if (!(rawDelta > 0)) return 0;
  const raw = rawFromSoftCapped(sheetValue, cfg);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, applySoftCap(raw + rawDelta, cfg) - sheetValue);
}

// port of softCapEfficiency L1080367-1080400 (marginal gain per raw point)
export function softCapEfficiency(raw, cfg) {
  if (!(raw > cfg.soft)) return 1;
  const k = cfg.hard - cfg.soft;
  if (!(k > 0)) return 0;
  const s = EXP * k;
  return Math.pow(s / (raw - cfg.soft + s), 3);
}

// port of pvpRatingToPercent L1080412-1080429; result in percent (0-100)
export function pvpRatingToPercent(rating) {
  if (!(rating > 0)) return 0;
  return (rating / (rating + PVP_K)) * 100;
}
