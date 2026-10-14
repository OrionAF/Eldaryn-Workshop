// L1 catalogue: talent trees by spec (8), tier thresholds, dual talents, respec cost.
// Lookups only, no game logic. Sources: Game/talents.md §1, §2, §5, §9; data/talents.json.
import talentsData from '../../data/game/talents.json';

// talents.md §2
export const TALENT_CONSTANTS = talentsData.constants;
export const TIER_THRESHOLDS = TALENT_CONSTANTS.tierThresholds;
export const TALENT_VALUE_UNITS = talentsData.valueUnits;

// talents.md §1. Keys match classes.js SPECS.
export const TALENT_SPECS = talentsData.specs;
export const TALENT_SPEC_KEYS = Object.keys(TALENT_SPECS);

export function talentSpec(specKey) {
  return TALENT_SPECS[specKey] ?? null;
}
export function talentSpecsForClass(cls) {
  return TALENT_SPEC_KEYS.filter((k) => TALENT_SPECS[k].class === cls);
}
export function talentTiers(specKey) {
  return talentSpec(specKey)?.tiers ?? [];
}
// Walks every spec; talent ids are globally unique.
export function talentById(id) {
  for (const key of TALENT_SPEC_KEYS) {
    for (const tier of TALENT_SPECS[key].tiers) {
      const hit = tier.talents.find((t) => t.id === id);
      if (hit) return { ...hit, specKey: key, tier: tier.tier };
    }
  }
  return null;
}
// talents.md §4: points that must already be spent in the set to unlock tier 1..6
export function tierPointsRequired(tier) {
  return TIER_THRESHOLDS[tier - 1] ?? null;
}
