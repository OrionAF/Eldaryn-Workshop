// Relic art lookup. The scraped files are per tier (relics_bronze / _silver / _gold), not per relic.
import { assetUrl, slug } from './base.js';

/** Tier icon for a relic ('bronze' | 'silver' | 'gold'), or null for an unknown tier. */
export function relicImage(tier) {
  return tier ? assetUrl(`relics_${slug(tier)}`) : null;
}
