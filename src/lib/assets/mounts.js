// Mount art lookup, moved verbatim out of assets.js (M1). Owned by the Mount domain slice from here on.
import { assetUrl } from './base.js';

/** Mount art, keyed by the MOUNT_DEFS id (already snake_case). */
export function mountImage(mountId) {
  return assetUrl(mountId ? `mount_${mountId}` : null);
}
