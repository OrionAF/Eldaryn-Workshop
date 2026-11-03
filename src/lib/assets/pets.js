// Pet art lookup, moved verbatim out of assets.js (M1). Owned by the Pet domain slice from here on.
import { assetUrl, slug } from './base.js';

/**
 * Pet art, keyed by DISPLAY NAME - companion ids are unpunctuated
 * ('ancientdrake') while the files are snake_cased ('pet_ancient_drake').
 */
export function petImage(name) {
  return assetUrl(name ? `pet_${slug(name)}` : null);
}

/** Pet Core art by rarity ('Mythic' or 'MYTHIC'): cells of the 2.9.1 client's cores_atlas, Common..Oblivion. */
export function coreImage(rarity) {
  return assetUrl(rarity ? `pet_core_${String(rarity).toLowerCase()}` : null);
}
