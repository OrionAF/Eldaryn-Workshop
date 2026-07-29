/**
 * statCaps.js - the game's soft-cap diminishing-returns curve.
 *
 * The curve, its verification against the patch notes' worked examples, and
 * the raw -> effective pipeline it sits in are documented in
 * docs/Reference/combat-model.md §2. The cap VALUES live in constants.js
 * (STAT_FIELDS' `softCap` / `cap`), not here.
 *
 * THE ONE THING A CALLER MUST GET RIGHT - two operations, not
 * interchangeable:
 *  - applySoftCaps(raw)         for pre-curve sums (Calculated totals, swap
 *                               candidates). NOT IDEMPOTENT - feeding it an
 *                               already-curved value silently double-curves.
 *  - clampToHardCaps(effective) for values already post-curve (Manual totals,
 *                               PVP opponent entry - the stat sheet's own
 *                               number). Only guards impossible entries.
 *
 * The stat sheet's own numbers confirm both the curve and the clampToHardCaps
 * path for Manual totals - see combat-model.md §2 for the observation and what
 * it settled.
 */
import { STAT_FIELDS } from './constants.js';

/** The curve for one value. Returns `raw` unchanged at or below `softCap`. */
export function softCapValue(raw, softCap, hardCap) {
  if (!(raw > softCap)) return raw;
  const range = hardCap - softCap;
  const decay = (2 * range) / (raw - softCap + 2 * range);
  return softCap + range * (1 - decay * decay);
}

/**
 * How much of the NEXT raw point survives the curve, as a fraction in (0, 1].
 * The game shows this as "N% GAIN" beside a capped stat.
 *
 * It is the exact derivative of softCapValue with respect to `raw`, so the two
 * cannot drift: with K = hardCap - softCap and x = raw - softCap,
 * effective = softCap + K - 4K³/(x+2K)², whose slope is 8K³/(x+2K)³. Below the
 * soft cap the curve is the identity and a point is worth a full point.
 */
export function marginalGain(raw, softCap, hardCap) {
  if (!(raw > softCap)) return 1;
  const k = hardCap - softCap;
  const denom = raw - softCap + 2 * k;
  return (8 * k * k * k) / (denom * denom * denom);
}

/**
 * Curve a RAW (pre-curve) OffensiveStats-shaped record into effective
 * totals: every field with a `softCap` goes through softCapValue; a field
 * with only a hard `cap` (none currently) clamps. Never mutates its input.
 */
export function applySoftCaps(stats) {
  const effective = { ...stats };
  for (const f of STAT_FIELDS) {
    const v = effective[f.key];
    if (f.softCap != null && f.cap != null) {
      effective[f.key] = softCapValue(v, f.softCap, f.cap);
    } else if (f.cap != null && v > f.cap) {
      effective[f.key] = f.cap;
    }
  }
  return effective;
}

/**
 * Clamp an already-EFFECTIVE stat record to the hard caps. For values the
 * user copied off the game's stat sheet (the curve has already been applied
 * by the game): effective totals can legitimately sit anywhere below the
 * hard cap, so only impossible entries are corrected. Never mutates.
 */
export function clampToHardCaps(stats) {
  const clamped = { ...stats };
  for (const f of STAT_FIELDS) {
    if (f.cap != null && clamped[f.key] > f.cap) clamped[f.key] = f.cap;
  }
  return clamped;
}
