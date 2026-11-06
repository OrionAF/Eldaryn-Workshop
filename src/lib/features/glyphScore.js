// Minor glyph score (Character > Mounts & Glyphs): how good a minor glyph's rolled secondary is for
// a spec. An app convention, not a game grade, like the gear score (features/gearScore.js), whose
// stat weights it shares (features/coreScore.js statWeights).
//
// A minor glyph rolls one stat, uniform over the class pool, at a quality drawn uniformly inside its
// rarity's band (Game/mounts-glyphs.md §9). So:
//   roll   where the quality sits in the rarity's band, 0 at the bottom and 1 at the top. It rates the
//          roll for that rarity; a higher rarity's band is higher, which rarity itself already says.
//   fit    the stat's weight against the spec's top weight (one slot)
//   score  fit x (0.5 + 0.5 x roll): picking a stat earns half, its roll the other half
import { glyphQualityBand, glyphSecondaryDef, glyphTier } from '../model/glyphs.js';
import { gradeLetter } from '../format.js';

/**
 * Score one glyph. Without weights only `roll` is set (fit, score and grade null).
 * @param {Object} glyph  model glyph ({glyphType, rarity, sealed, secondary: {stat, quality}|null})
 * @param {Map<string, number>|null} weights  keyed by SecondaryStatType enum
 * @returns {{roll:number, fit:number|null, score:number|null, grade:string|null}|null}
 *   null for a sealed or non-minor glyph, or one without an entered secondary
 */
export function glyphScore(glyph, weights) {
  if (!glyph || glyph.sealed || glyphTier(glyph.glyphType) !== 'minor') return null;
  const def = glyphSecondaryDef(glyph.secondary?.stat);
  if (!def) return null;
  const [lo, hi] = glyphQualityBand(glyph.rarity);
  const q = Number(glyph.secondary.quality) || 0;
  const roll = hi > lo ? Math.min(1, Math.max(0, (q - lo) / (hi - lo))) : 1;
  if (!weights) return { roll, fit: null, score: null, grade: null };

  const top = Math.max(0, ...weights.values());
  const fit = top > 0 ? Math.min(1, (weights.get(def.statEnum) ?? 0) / top) : 0;
  const score = fit * (0.5 + 0.5 * roll);
  return { roll, fit, score, grade: gradeLetter(score) };
}
