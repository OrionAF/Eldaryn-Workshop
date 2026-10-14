// Glyph art lookup, moved verbatim out of assets.js (M1). Owned by the Glyph domain slice from here on.
import { assetUrl, slug } from './base.js';

/** Glyph art by tier ('minor' | 'major' | 'mythic') and rarity. */
export function glyphImage(tier, rarity) {
  if (tier === 'mythic') return assetUrl('glyph_mythic');
  if (!tier || !rarity) return null;
  return assetUrl(`glyph_${slug(tier)}_${slug(rarity)}`);
}
