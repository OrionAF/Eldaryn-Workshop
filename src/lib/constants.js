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
 * `classOnly`, if set, is a class ('Warrior' | 'Sentinel') this field is
 * relevant to - fieldsForTab('profile', characterClass) hides it unless the
 * character is that class. Only affects the Profile Stats tab; Gear Panel
 * still shows every field regardless of class (a piece of gear's raw stats
 * aren't scoped to who's wearing it).
 * `cap`, if set, is the hard ceiling the game itself enforces on that stat's
 * effective total - totals.js's applyStatCaps() clamps to it for both
 * Manual and Calculated totals (stacking many sources - gear, talents,
 * Awakening - can otherwise exceed what the game allows).
 *
 * The 6 defensive fields (block_chance..paralyze_chance) and pvp_attack/
 * pvp_defense are NOT used by computeDps/computeHps/compareSwap yet (see
 * docs/adr/0001-defer-pvp-combat-modeling.md) - display and swap-tracking
 * only, added ahead of a future PVP phase.
 */
export const STAT_FIELDS = [
  { key: 'attack', label: 'Attack', kind: 'flat', base: 10, tabs: ['profile', 'gear'] },
  { key: 'attack_pct', label: 'Attack %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'health', label: 'Health', kind: 'flat', base: 10, tabs: ['profile', 'gear'] },
  { key: 'health_pct', label: 'Health %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'speed', label: 'Speed %', kind: 'pct', base: 100, tabs: ['profile', 'gear'] },
  { key: 'crit', label: 'Critical %', kind: 'pct', base: 0, tabs: ['profile', 'gear'], cap: 80 },
  { key: 'crit_mult', label: 'Crit Mult %', kind: 'pct', base: 150, tabs: ['profile', 'gear'] },
  { key: 'double_hit', label: 'Double Hit %', kind: 'pct', base: 0, tabs: ['profile', 'gear'], cap: 40 },
  { key: 'lifesteal', label: 'Lifesteal %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'hp_regen', label: 'HP Regen %/s', kind: 'pct', base: 0, tabs: ['profile', 'gear'], cap: 60 },
  { key: 'miss_chance', label: 'Miss Chance %', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Sentinel', cap: 80 },
  { key: 'blind_chance', label: 'Blind Chance %', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Sentinel', cap: 40 },
  { key: 'paralyze_chance', label: 'Paralyze Chance %', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Sentinel', cap: 15 },
  { key: 'dmg_reduction', label: 'DMG Reduction %', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Warrior', cap: 60 },
  { key: 'block_chance', label: 'Block Chance %', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Warrior', cap: 80 },
  { key: 'penetration', label: 'Penetration %', kind: 'pct', base: 0, tabs: ['profile', 'gear'], cap: 90 },
  { key: 'pvp_attack', label: 'PVP Attack', kind: 'flat', base: 0, tabs: ['profile'] },
  { key: 'pvp_defense', label: 'PVP Defense', kind: 'flat', base: 0, tabs: ['profile'] },
];

export const FLAT_KEYS = STAT_FIELDS.filter((f) => f.kind === 'flat').map((f) => f.key);

/**
 * Fields shown on a given tab ('profile' | 'gear'), in STAT_FIELDS order.
 * Passing `characterClass` (Profile Stats, Gear Panel) hides fields tagged
 * `classOnly` for a different class (or all of them, while no class is set
 * yet - `null` still counts as "passed"). Omit the argument entirely (e.g.
 * Pets' stat block, which reuses the 'gear' field set but isn't scoped to
 * who's wearing anything) to skip class filtering altogether - the presence
 * of the argument is the switch, not which tab was asked for.
 */
export function fieldsForTab(tab, characterClass) {
  return STAT_FIELDS.filter((f) => {
    if (!f.tabs.includes(tab)) return false;
    if (characterClass !== undefined && f.classOnly && f.classOnly !== characterClass) return false;
    return true;
  });
}

/**
 * Fields carried through swap math generically (combineAdditive in dps.js):
 * everything except attack/health (decompose+recombine via their %) and
 * speed/crit_mult (handled explicitly alongside them in applySwap, so they
 * aren't double-processed by the generic loop below).
 */
export const SWAP_SPECIAL_KEYS = ['attack', 'attack_pct', 'health', 'health_pct', 'speed', 'crit_mult'];
export const SWAP_ADDITIVE_KEYS = STAT_FIELDS.map((f) => f.key).filter((k) => !SWAP_SPECIAL_KEYS.includes(k));

/**
 * The 9-tier rarity scale (handoff §2), used by Pets/Mounts (and eventually
 * other sources) for a rarity dropdown. Didn't exist before Phase 1 - gear
 * entries in Phase 0 are raw stat blocks with no rarity tracking.
 */
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ancient', 'Divine', 'Eternal'];

/**
 * Stat sources beyond gear (handoff §8). `scope: 'loadout'` means per-set
 * (enchant stones bind to Set 1/Set 2); 'character' means one shared across
 * both loadouts. `selection` tells the generic Calculated-totals sum
 * (totals.js) which entries count, without per-source special-casing:
 *   'all'    -> every entry contributes (Talents: many simultaneous bonuses)
 *   'single' -> only the entry matching sourceState.activeId contributes
 *   'tiered' -> only entries with equipped:true contribute, capped per tierCaps
 * No `selection` at all (Talents, Awakening, Transcendence, Relics) means the
 * source is special-cased in totals.js entirely, bypassing the generic
 * entries[]/activeId sum - see each source's own comment below for why.
 * Only pets/mounts/mountGlyphs/talents/awakening/transcendence/relics have
 * real UI; the rest (sigils) are scaffold only (empty entries, contributing
 * nothing) until a future pass builds them - see the Phase 1 plan's
 * "Deferred sources" section for what's known/unknown.
 */
export const SOURCE_DEFS = [
  // scope: 'loadout' - Talents maps onto Dual Spec (Set A/B = Loadout 1/2), the
  // same way gear/stones already do. Its per-loadout spec + rank allocation
  // live on Loadout directly (model.js), not in Character.sources like the
  // character-scoped sources below, and totals.js sums it alongside gear/
  // stones rather than through the generic character-scoped loop.
  { key: 'talents', label: 'Talents', scope: 'loadout' },
  // scope: 'character' but no `selection` - Awakening is one path + a single
  // point count shared by BOTH loadouts (not a collection of user-created
  // entries the generic 'single' selection picks one of). Its path/points
  // live on Character.awakening directly (model.js); static per-point
  // content is in awakeningData.js, same reasoning as Talents' static tree.
  { key: 'awakening', label: 'Awakening', scope: 'character' },
  // scope: 'character', no `selection` - one shared unlocked-node set per
  // character (like Awakening, not per-loadout like Talents/Relics), special-
  // cased in totals.js. Static tree content (node positions/types/stats) is
  // in transcendenceData.js; the player's unlocked positions live on
  // Character.transcendence directly (model.js).
  { key: 'transcendence', label: 'Transcendence', scope: 'character' },
  { key: 'pets', label: 'Pets (Companions)', scope: 'character', selection: 'single' },
  { key: 'mounts', label: 'Mounts', scope: 'character', selection: 'single' },
  { key: 'mountGlyphs', label: 'Mount Glyphs', scope: 'character', selection: 'tiered', tierCaps: { minor: 3, major: 2, mythic: 1 } },
  { key: 'sigils', label: 'Sigils', scope: 'character', selection: 'tiered', tierCaps: { equipped: 3 } },
  // scope: 'loadout' like Talents - equipped Relics are independent per Set
  // A/B, not shared across both loadouts like Awakening. A relic's fixed
  // stats/tiers/levels are static per-class content (relicsData.js); the
  // player's owned/leveled/equipped state lives on Loadout.relics.
  { key: 'relics', label: 'Relics', scope: 'loadout' },
  { key: 'stones', label: 'Enchant Stones', scope: 'loadout' },
];

/**
 * Class/spec structure for Talents. Spec keys are lowercased for storage
 * (matches the lowercase convention already used for Mount Glyph tiers).
 */
export const CLASSES = ['Warrior', 'Sentinel'];
export const SPECS_BY_CLASS = {
  Warrior: [
    { key: 'arms', label: 'Arms' },
    { key: 'protection', label: 'Protection' },
  ],
  Sentinel: [
    { key: 'marksmanship', label: 'Marksmanship' },
    { key: 'disruption', label: 'Disruption' },
  ],
};
export const TALENT_TREE_KEYS = Object.values(SPECS_BY_CLASS).flat().map((s) => s.key);

/** Hard cap on talent points spendable in one loadout's build. */
export const TALENT_TOTAL_POINTS = 29;

/**
 * Transcendence's tiered Ichor cost table (docs/Transcendence Screenshots):
 * the Nth node unlocked (1-indexed, counting only common/uncommon nodes -
 * Ancient Sigils have their own flat cost, see TRANSCENDENCE_SIGIL_COST)
 * costs whatever tier `n` falls into. Uncommon nodes cost x3 that tier's
 * price. Shown as info in the UI (Ichor isn't a tracked/gated balance - see
 * transcendence.js), not enforced as a hard affordability check.
 */
export const TRANSCENDENCE_COST_TIERS = [
  { upTo: 4, cost: 1 },
  { upTo: 9, cost: 2 },
  { upTo: 16, cost: 3 },
  { upTo: 26, cost: 5 },
  { upTo: 41, cost: 8 },
  { upTo: 61, cost: 12 },
  { upTo: 86, cost: 18 },
  { upTo: 116, cost: 26 },
  { upTo: 156, cost: 38 },
  { upTo: 206, cost: 55 },
  { upTo: Infinity, cost: 80 },
];

/** Flat Ichor cost for an Ancient Sigil - not affected by the tiered table above. */
export const TRANSCENDENCE_SIGIL_COST = 30;

/** Uncommon nodes cost this multiple of the tiered common cost. */
export const TRANSCENDENCE_UNCOMMON_COST_MULTIPLIER = 3;
