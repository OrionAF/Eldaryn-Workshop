/**
 * awakeningData.js - hardcoded Awakening path content (Shadow Path, Radiant
 * Path). Same reasoning as talentTreeData.js: this is the same for every
 * player, not user-authored data, so it lives in code rather than the
 * persisted Roster.
 *
 * Unlike Talents, Awakening has no tiers and no independently-authored
 * per-rank values - each invested point contributes the SAME flat amount to
 * every stat in the path, linearly (e.g. Shadow's Attack % is exactly
 * 2 * pointsInvested, not a per-rank table). Also unlike Talents, Awakening
 * is character-scoped (one path/point count shared by both loadouts), not
 * per-loadout - the in-game source is "1 point per level from 45-59" (15
 * points total), which doesn't vary per gear loadout the way a talent build
 * does.
 *
 * Shadow Path is identical for both classes. Radiant Path's per-point stats
 * differ by class (Warrior gets DMG Reduction/Block Chance; Sentinel gets
 * Blind/Paralyze/Miss Chance) - resolveAwakeningPerPoint() is the one place
 * that class-dependent lookup happens.
 */

export const AWAKENING_TOTAL_POINTS = 15;

export const AWAKENING_PATHS = {
  shadow: {
    label: 'Shadow Path',
    // Same for both classes.
    perPoint: { attack_pct: 2, crit: 0.5, crit_mult: 2, penetration: 0.6 },
  },
  radiant: {
    label: 'Radiant Path',
    perPointByClass: {
      Warrior: { health_pct: 2.5, hp_regen: 0.5, dmg_reduction: 0.5, block_chance: 0.5 },
      Sentinel: { health_pct: 2.5, blind_chance: 0.5, paralyze_chance: 0.2, miss_chance: 0.5 },
    },
  },
};

/** The per-point stat map for a path, resolved for a class if the path needs one. Null if unresolvable. */
export function resolveAwakeningPerPoint(pathKey, characterClass) {
  const path = AWAKENING_PATHS[pathKey];
  if (!path) return null;
  return path.perPoint ?? path.perPointByClass?.[characterClass] ?? null;
}
