// Relic art lookup. The scraped files are per tier (relics_<tier>.png); the game gives no per-relic icon, so a
// relic shows its tier's art and a tier without a file gets null (the page draws a placeholder tile).
import { assetUrl } from './base.js';

/** Tier icon for 'bronze' | 'silver' | 'gold', or null when there is no art. */
export function relicImage(tier) {
  return assetUrl(tier ? `relics_${String(tier).toLowerCase()}` : null);
}
