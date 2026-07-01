/**
 * constants.js - slots, stat-field metadata, base profile, and source defs.
 * Single source of truth for what fields exist and how they parse/display.
 */

// 9 equipment slots, in display order.
export const SLOTS = [
  'Head',
  'Shoulders',
  'Chest',
  'Leggings',
  'Boots',
  'Weapon',
  'Offhand',
  'Ring',
  'Trinket',
];

/**
 * The OffensiveStats fields. `kind` drives number parsing/formatting:
 *   'flat' -> value uses "." as a THOUSANDS separator (48.124 = 48124)
 *   'pct'  -> value uses "." as a DECIMAL point (6.2 = 6.2)
 * `base` is the character's base value (for reference / future derived totals).
 * `tabs` marks which UI surfaces show the field: 'profile' (Profile Stats tab,
 * per-loadout totals) and/or 'gear' (Gear Panel tab, per-slot piece stats).
 *
 * The 6 defensive fields (block_chance..paralyze_chance) and pvp_attack/
 * pvp_defense are NOT used by computeDps/computeHps/compareSwap yet (see
 * docs/adr/0001-defer-pvp-combat-modeling.md) - display and swap-tracking
 * only, added ahead of a future PVP phase.
 */
export const STAT_FIELDS = [
  { key: 'attack', label: 'Attack', kind: 'flat', base: 10, tabs: ['profile', 'gear'] },
  { key: 'attack_pct', label: 'Attack %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'speed', label: 'Speed %', kind: 'pct', base: 100, tabs: ['profile', 'gear'] },
  { key: 'crit', label: 'Critical %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'crit_mult', label: 'Crit Mult %', kind: 'pct', base: 150, tabs: ['profile', 'gear'] },
  { key: 'double_hit', label: 'Double Hit %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'health', label: 'Health', kind: 'flat', base: 10, tabs: ['profile', 'gear'] },
  { key: 'health_pct', label: 'Health %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'hp_regen', label: 'HP Regen %/s', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'lifesteal', label: 'Lifesteal %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'block_chance', label: 'Block Chance %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'miss_chance', label: 'Miss Chance %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'blind_chance', label: 'Blind Chance %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'penetration', label: 'Penetration %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'dmg_reduction', label: 'DMG Reduction %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'paralyze_chance', label: 'Paralyze Chance %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'pvp_attack', label: 'PVP Attack', kind: 'flat', base: 0, tabs: ['profile'] },
  { key: 'pvp_defense', label: 'PVP Defense', kind: 'flat', base: 0, tabs: ['profile'] },
];

export const FLAT_KEYS = STAT_FIELDS.filter((f) => f.kind === 'flat').map((f) => f.key);

/** Fields shown on a given tab ('profile' | 'gear'), in STAT_FIELDS order. */
export function fieldsForTab(tab) {
  return STAT_FIELDS.filter((f) => f.tabs.includes(tab));
}

/**
 * Fields carried through swap math generically (combineAdditive in dps.js):
 * everything except attack/health (decompose+recombine via their %) and
 * speed/crit_mult (additive-by-default with a multiplicative switch).
 */
export const SWAP_SPECIAL_KEYS = ['attack', 'attack_pct', 'health', 'health_pct', 'speed', 'crit_mult'];
export const SWAP_ADDITIVE_KEYS = STAT_FIELDS.map((f) => f.key).filter((k) => !SWAP_SPECIAL_KEYS.includes(k));

/**
 * Future stat sources (handoff 8). SCAFFOLD ONLY: shape + scope, no scaling
 * formulas. `scope: 'loadout'` means per-set (e.g. enchant stones bind to Set
 * 1/Set 2); 'character' means one active across both loadouts.
 */
export const SOURCE_DEFS = [
  { key: 'talents', label: 'Talents', scope: 'character' },
  { key: 'awakening', label: 'Awakening', scope: 'character' },
  { key: 'pets', label: 'Pets (Companions)', scope: 'character' },
  { key: 'mounts', label: 'Mounts', scope: 'character' },
  { key: 'sigils', label: 'Sigils', scope: 'character' },
  { key: 'relics', label: 'Relics', scope: 'character' },
  { key: 'stones', label: 'Enchant Stones', scope: 'loadout' },
];
