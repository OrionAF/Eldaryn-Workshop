// Sigil art lookup, moved verbatim out of assets.js (M1). Owned by the Sigil domain slice from here on.
import { assetUrl, slug } from './base.js';

/** Sigil art. Class-scoped, since both classes have their own 12. */
export function sigilImage(characterClass, sigilId) {
  if (!characterClass || !sigilId) return null;
  return assetUrl(`sigils_${slug(characterClass)}_${slug(sigilId)}`);
}
