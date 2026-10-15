// Talent art lookup. Files are talents_<class>_<tree>_<talent_name>.png; the tree name in the file is not the
// spec's display name (Protection and Arms are the Warrior trees, Mage and Druid the Mystic ones), so it is mapped.
import { assetUrl } from './base.js';

const TREE_PREFIX = {
  WARRIOR_TANK: 'warrior_protection',
  WARRIOR_DPS: 'warrior_arms',
  SENTINEL_MARKSMANSHIP: 'sentinel_marksmanship',
  SENTINEL_DISRUPTION: 'sentinel_disruption',
  MYSTIC_MAGE: 'mystic_mage',
  MYSTIC_DRUID: 'mystic_druid',
};

/** 'Guardian's Might' -> 'guardians_might' (apostrophes vanish, they do not become separators). */
const fileSlug = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Art for one talent, or null when its tree has none (the Necromancer trees) so the row draws a placeholder. */
export function talentImage(specKey, talentName) {
  const tree = TREE_PREFIX[specKey];
  return tree && talentName ? assetUrl(`talents_${tree}_${fileSlug(talentName)}`) : null;
}
