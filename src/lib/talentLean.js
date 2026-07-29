/**
 * talentLean.js - classify a talent allocation as offensive vs defensive.
 *
 * The game stores no offense/defense tag on talents (or on STAT_FIELDS), so
 * the split is derived from each talent's `statKey`. The two buckets below
 * are exactly the stats the Awakening paths separate on: Shadow's per-point
 * map is the offensive set (attack/crit/crit_mult/penetration), Radiant's is
 * the defensive/PVP set (health/regen/mitigation/control) - see
 * awakeningData.js. The linking simulation uses this to summarise which way
 * each linked preset's recommended talents lean, so the report can say the
 * offensive-path preset compensates with defensive talents and vice versa.
 */

import { TALENT_TREES } from './talentTreeData.js';

/** Stats that raise damage output (read by computeDps, or damage-through-block / PVP attack). */
export const OFFENSE_STATKEYS = new Set([
  'attack',
  'attack_pct',
  'speed',
  'crit',
  'crit_mult',
  'double_hit',
  'spell_damage',
  'penetration',
  'pvp_attack',
]);

/** Stats that raise survival / control (health, recovery, mitigation, avoidance, PVP defense). */
export const DEFENSE_STATKEYS = new Set([
  'health',
  'health_pct',
  'hp_regen',
  'lifesteal',
  'dmg_reduction',
  'block_chance',
  'spell_resist',
  'miss_chance',
  'blind_chance',
  'paralyze_chance',
  'pvp_defense',
]);

/** talentId -> talent def, across every tier of a spec's tree. */
function talentIndex(spec) {
  const tree = TALENT_TREES[spec];
  if (!tree) return {};
  const byId = {};
  for (const tier of tree.tiers) for (const t of tier.talents) byId[t.id] = t;
  return byId;
}

/**
 * Sum the points a talent set spends in each bucket.
 * `talentSet` = { spec, allocation: { talentId: rank } } (rank = points spent).
 * Returns { offense, defense, label }.
 */
export function talentLean(talentSet) {
  const byId = talentIndex(talentSet?.spec);
  let offense = 0;
  let defense = 0;
  for (const [id, rank] of Object.entries(talentSet?.allocation || {})) {
    const pts = Number(rank) || 0;
    const def = byId[id];
    if (!def || pts <= 0) continue;
    if (OFFENSE_STATKEYS.has(def.statKey)) offense += pts;
    else if (DEFENSE_STATKEYS.has(def.statKey)) defense += pts;
  }
  const label =
    offense === 0 && defense === 0
      ? 'no talents allocated'
      : offense > defense
        ? 'leans offensive'
        : defense > offense
          ? 'leans defensive'
          : 'balanced';
  return { offense, defense, label };
}
