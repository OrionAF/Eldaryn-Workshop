// Mount art lookup. Owned by B4 (moved verbatim out of assets.js by M1, then keyed by species).
import { assetUrl } from './base.js';

/**
 * Mount art by species key ('NIGHT_WOLF') or, for the v1 catalogue ids, snake_case ('night_wolf');
 * the files are named mount_<snake_case>.png.
 */
export function mountImage(mountId) {
  return assetUrl(mountId ? `mount_${String(mountId).toLowerCase()}` : null);
}
