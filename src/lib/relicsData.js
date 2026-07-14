/**
 * relicsData.js - hardcoded Relic content (docs/Relics Screenshots/*.txt),
 * per class. Same reasoning as talentTreeData.js/awakeningData.js: fixed
 * game data, not user-authored, so it lives in code.
 *
 * A relic has a tier (bronze/silver/gold) driving its maxLevel (10/15/20)
 * and 1-2 fixed bonus stats, each with a min (at level 1) and max (at
 * maxLevel) value - relicLevelValue() linearly interpolates between them
 * for any level in between, since the source data only gives two endpoints
 * per stat, not a per-level table like Talents' independently-authored ranks.
 * Bronze always has exactly 1 stat, Silver always 2, Gold has either 1 or 2
 * depending on the specific relic (e.g. Titan's Oath/Shadowbind are
 * 1-stat gold relics).
 *
 * Equipping is per-loadout (Set A/Set B = Loadout 1/2), independent and
 * capped at RELIC_EQUIP_CAP each - mirrors gear/Talents, not the
 * shared-across-both-loadouts model Awakening uses. A relic's LEVEL is
 * also per-loadout in this model (Loadout.relics.entries), same as every
 * other per-loadout field - there's no separate account-wide "ownership"
 * concept tracked here.
 *
 * The in-game "Relic Medals" currency (used to unlock additional equip
 * slots and presumably to level relics up) is not modeled - same
 * precedent as Dual Spec: this app assumes the max/unlocked state (4
 * equip slots) rather than tracking account-progression currencies.
 */

export const RELIC_EQUIP_CAP = 4;

export const RELIC_TIERS = ['bronze', 'silver', 'gold'];
export const RELIC_TIER_LABELS = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };
export const RELIC_TIER_MAX_LEVEL = { bronze: 10, silver: 15, gold: 20 };

export const RELICS_BY_CLASS = {
  Warrior: [
    { id: 'basalt-guard', name: 'Basalt Guard', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'dmg_reduction', min: 3.0, max: 12.0 }] },
    { id: 'iron-heart', name: 'Iron Heart', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'health_pct', min: 6.0, max: 26.0 }] },
    { id: 'mending-stone', name: 'Mending Stone', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'hp_regen', min: 2.0, max: 8.0 }] },
    { id: 'stone-ward', name: 'Stone Ward', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'block_chance', min: 2.0, max: 10.0 }] },
    { id: 'swift-emblem', name: 'Swift Emblem', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'speed', min: 8.0, max: 35.0 }] },
    { id: 'war-charm', name: 'War Charm', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'attack_pct', min: 4.0, max: 20.0 }] },

    { id: 'fortune-token', name: 'Fortune Token', tier: 'silver', maxLevel: 15, stats: [
      { statKey: 'crit', min: 6.0, max: 14.0 },
      { statKey: 'crit_mult', min: 40.0, max: 80.0 },
    ] },
    { id: 'guardians-signet', name: "Guardian's Signet", tier: 'silver', maxLevel: 15, stats: [
      { statKey: 'health_pct', min: 12.0, max: 30.0 },
      { statKey: 'dmg_reduction', min: 5.0, max: 12.0 },
    ] },
    { id: 'lifewell-charm', name: 'Lifewell Charm', tier: 'silver', maxLevel: 15, stats: [
      { statKey: 'hp_regen', min: 4.0, max: 12.0 },
      { statKey: 'block_chance', min: 6.0, max: 12.0 },
    ] },
    { id: 'crimson-charm', name: 'Crimson Edge', tier: 'silver', maxLevel: 15, stats: [
      { statKey: 'attack_pct', min: 12.0, max: 28.0 },
      { statKey: 'penetration', min: 12.0, max: 24.0 },
    ] },

    { id: 'dragon-core', name: 'Dragon Core', tier: 'gold', maxLevel: 20, stats: [
      { statKey: 'penetration', min: 12.0, max: 50.0 },
      { statKey: 'pvp_attack', min: 40, max: 120 },
    ] },
    { id: 'fatebreaker', name: 'Fatebreaker', tier: 'gold', maxLevel: 20, stats: [
      { statKey: 'crit', min: 8.0, max: 18.0 },
      { statKey: 'crit_mult', min: 60.0, max: 120.0 },
    ] },
    { id: 'phoenix-feather', name: 'Phoenix Feather', tier: 'gold', maxLevel: 20, stats: [
      { statKey: 'health_pct', min: 15.0, max: 50.0 },
      { statKey: 'pvp_defense', min: 50, max: 180 },
    ] },
    { id: 'titans-oath', name: "Titan's Oath", tier: 'gold', maxLevel: 20, stats: [
      { statKey: 'dmg_reduction', min: 8.0, max: 26.0 },
    ] },
  ],

  Sentinel: [
    { id: 'blinding-powder', name: 'Blinding Powder', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'blind_chance', min: 3.0, max: 10.0 }] },
    { id: 'falcons-eye', name: "Falcon's Eye", tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'crit', min: 3.0, max: 10.0 }] },
    { id: 'phantom-veil', name: 'Phantom Veil', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'miss_chance', min: 4.0, max: 12.0 }] },
    { id: 'serpent-fang', name: 'Serpent Fang', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'lifesteal', min: 3.0, max: 10.0 }] },
    { id: 'hunters-mark', name: "Hunter's Mark", tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'attack_pct', min: 6.0, max: 26.0 }] },
    { id: 'swift-quiver', name: 'Swift Quiver', tier: 'bronze', maxLevel: 10, stats: [{ statKey: 'speed', min: 8.0, max: 35.0 }] },

    { id: 'deadeye-charm', name: 'Deadeye Charm', tier: 'silver', maxLevel: 15, stats: [
      { statKey: 'crit', min: 6.0, max: 14.0 },
      { statKey: 'crit_mult', min: 40.0, max: 80.0 },
    ] },
    { id: 'nerve-sigil', name: 'Nerve Sigil', tier: 'silver', maxLevel: 15, stats: [
      { statKey: 'paralyze_chance', min: 1.0, max: 3.0 },
      { statKey: 'blind_chance', min: 2.0, max: 10.0 },
    ] },
    { id: 'wardens-totem', name: "Warden's Totem", tier: 'silver', maxLevel: 15, stats: [
      { statKey: 'health_pct', min: 15.0, max: 35.0 },
      { statKey: 'miss_chance', min: 5.0, max: 13.0 },
    ] },
    { id: 'viper-glyph', name: 'Viper Glyph', tier: 'silver', maxLevel: 15, stats: [
      { statKey: 'attack_pct', min: 14.0, max: 32.0 },
      { statKey: 'penetration', min: 12.0, max: 24.0 },
    ] },

    { id: 'eclipse-shard', name: 'Eclipse Shard', tier: 'gold', maxLevel: 20, stats: [
      { statKey: 'crit', min: 8.0, max: 18.0 },
      { statKey: 'crit_mult', min: 60.0, max: 120.0 },
    ] },
    { id: 'shadowbind', name: 'Shadowbind', tier: 'gold', maxLevel: 20, stats: [
      { statKey: 'paralyze_chance', min: 2.0, max: 6.0 },
    ] },
    { id: 'spirit-eagle', name: 'Spirit Eagle', tier: 'gold', maxLevel: 20, stats: [
      { statKey: 'health_pct', min: 15.0, max: 50.0 },
      { statKey: 'pvp_defense', min: 50, max: 180 },
    ] },
    { id: 'void-arrow', name: 'Void Arrow', tier: 'gold', maxLevel: 20, stats: [
      { statKey: 'penetration', min: 12.0, max: 50.0 },
      { statKey: 'pvp_attack', min: 40, max: 120 },
    ] },
  ],
};

/** Linearly interpolate a relic stat's value at `level` (1 = min, maxLevel = max). */
export function relicLevelValue(min, max, level, maxLevel) {
  if (maxLevel <= 1) return min;
  const clampedLevel = Math.max(1, Math.min(level, maxLevel));
  return min + ((max - min) * (clampedLevel - 1)) / (maxLevel - 1);
}
