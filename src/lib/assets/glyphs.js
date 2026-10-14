// Glyph art lookup. Owned by B4 (moved verbatim out of assets.js by M1).
import { assetUrl, slug } from './base.js';

/** Glyph art by tier ('minor' | 'major' | 'mythic') and rarity. The Mythic rarity has no per-tier file and borrows the mythic icon. */
export function glyphImage(tier, rarity) {
  if (tier === 'mythic') return assetUrl('glyph_mythic');
  if (!tier || !rarity) return null;
  return assetUrl(`glyph_${slug(tier)}_${slug(rarity)}`) ?? (slug(rarity) === 'mythic' ? assetUrl('glyph_mythic') : null);
}
