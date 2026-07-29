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
 * `softCap`/`cap` are the game's diminishing-returns caps. THE VALUES BELOW
 * ARE THE SOURCE OF TRUTH for the app; the curve that consumes them, its
 * verification, and the raw-vs-effective rules are combat-model.md §2, which
 * also tabulates these values - keep the two in step when a patch moves a cap.
 *
 * The 6 defensive fields (block_chance..paralyze_chance) and pvp_attack/
 * pvp_defense are not read by dps.js's PVE closed form, but they are very much
 * computed with elsewhere: the duel engine, both goal objectives and the
 * gauntlet all depend on them. (This comment used to call them "display and
 * swap-tracking only", citing ADR 0001 - long false, and now superseded.)
 */
export const STAT_FIELDS = [
  { key: 'attack', label: 'Attack', kind: 'flat', base: 10, tabs: ['profile', 'gear'] },
  { key: 'attack_pct', label: 'Attack %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'health', label: 'Health', kind: 'flat', base: 10, tabs: ['profile', 'gear'] },
  { key: 'health_pct', label: 'Health %', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'speed', label: 'Attack Speed', kind: 'pct', base: 100, tabs: ['profile', 'gear'], softCap: 200, cap: 400 },
  { key: 'crit', label: 'Crit Chance', kind: 'pct', base: 0, tabs: ['profile', 'gear'], softCap: 50, cap: 90 },
  { key: 'crit_mult', label: 'Crit Damage', kind: 'pct', base: 150, tabs: ['profile', 'gear'], softCap: 300, cap: 700 },
  { key: 'double_hit', label: 'Double Hit', kind: 'pct', base: 0, tabs: ['profile', 'gear'], softCap: 60, cap: 90 },
  // Boosts sigil SPELL damage (activation nukes, DoT/bleed ticks) by
  // +value% - swings are unaffected. Uncapped ("scales freely", wiki caps table).
  { key: 'spell_damage', label: 'Spell Damage', kind: 'pct', base: 0, tabs: ['profile', 'gear'] },
  { key: 'lifesteal', label: 'Lifesteal', kind: 'pct', base: 0, tabs: ['profile', 'gear'], softCap: 40, cap: 70 },
  { key: 'hp_regen', label: 'HP Regen', kind: 'pct', base: 0, tabs: ['profile', 'gear'], softCap: 40, cap: 60 },
  { key: 'miss_chance', label: 'Miss Chance', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Sentinel', softCap: 50, cap: 90 },
  { key: 'blind_chance', label: 'Blind Chance', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Sentinel', softCap: 30, cap: 50 },
  { key: 'paralyze_chance', label: 'Paralyze Chance', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Sentinel', softCap: 8, cap: 18 },
  { key: 'dmg_reduction', label: 'DMG Reduction', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Warrior', softCap: 30, cap: 60 },
  // Softens INCOMING sigil spell damage by -value% (PVP). Shares DMG
  // Reduction's cap row in the wiki table; not class-gated there, so no classOnly.
  { key: 'spell_resist', label: 'Spell Resist', kind: 'pct', base: 0, tabs: ['profile', 'gear'], softCap: 30, cap: 60 },
  { key: 'block_chance', label: 'Block Chance', kind: 'pct', base: 0, tabs: ['profile', 'gear'], classOnly: 'Warrior', softCap: 40, cap: 80 },
  // Penetration Rework: soft cap 60 -> 25, hard cap 90 -> 50. Paired with the
  // mechanic change that what pierces a block can now crit (pvpSimulation.js),
  // which is what makes the much smaller numbers still worth taking.
  // Follow-up patch (Jul 2026) walked both caps back up: 25 -> 30, 50 -> 70.
  { key: 'penetration', label: 'Penetration', kind: 'pct', base: 0, tabs: ['profile', 'gear'], softCap: 30, cap: 70 },
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
 * The 10-tier rarity scale (handoff §2), used by Pets/Mounts/Glyphs/Sigils.
 * Didn't exist before Phase 1 - gear entries in Phase 0 are raw stat blocks
 * with no rarity tracking. `Oblivion` was added in BigReworkV1 alongside the
 * rarity colour system; each tier has a `--rarity-<lowercase>-*` token set in
 * app.css, so anything appended here needs matching tokens.
 */
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Ancient', 'Divine', 'Eternal', 'Oblivion'];

/** Mount Glyphs only span the first five rarities (unlike the full 10-tier RARITIES scale). */
export const GLYPH_RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

/** 1-based position of a rarity on the RARITIES scale; 0 when unknown. */
export function rarityRank(rarity) {
  return RARITIES.indexOf(rarity) + 1;
}

/**
 * The app.css class that rebinds --rarity-fg/-fg-strong/-border/-bg for a tier.
 * Unknown/missing rarities get the neutral `.rarity-unknown` treatment rather
 * than leaving the custom properties unset (which would inherit whatever an
 * ancestor card happened to bind).
 */
export function rarityClass(rarity) {
  return RARITIES.includes(rarity) ? `rarity-${rarity.toLowerCase()}` : 'rarity-unknown';
}

/**
 * Major (non-stat) Mount Glyphs used to live here as a single hand-modelled
 * entry. They are now a real catalogue in glyphsData.js (MAJOR_GLYPHS, 17
 * families x 5 rarities, derived from EldarynTracker/found_glyphs.csv), since
 * they carry per-rarity effect values and a sigil binding. Import from there.
 */

/**
 * Character-wide sources that still use the generic entries[]/selection sum
 * (totals.js): 'tiered' -> only entries with equipped:true contribute, capped
 * per tierCaps (Glyphs - tier-capped sockets). Every other source (Talents,
 * Awakening, Transcendence, Relics, Pets, Mounts, Presets, Enchant Stones,
 * Sigils) is explicitly modeled on Character/Preset (model.js) and hand-summed
 * in totals.js - see each source's own comment there for why. Pets/Relics
 * moved OFF this generic list in the Preset redesign: Pets are a shared
 * collection a Preset points at (no single character-wide "active" pointer
 * anymore), and Relics are leveled character-wide but equipped per-preset (up
 * to PRESET_RELIC_CAP), not per-loadout. Mounts followed the same pattern once
 * the game made the ridden mount a per-preset choice: stats are entered
 * character-wide against the fixed MOUNT_DEFS catalogue (mountsData.js), and
 * each Preset picks its own preset.mountId.
 */
export const SOURCE_DEFS = [
  // Glyphs are a character-wide INVENTORY but equip per MOUNT (mount.glyphIds),
  // so tierCaps is a per-mount budget - 3 + 2 + 1 = the six glyph slots a mount
  // card shows. totals.js sums them inside mountContribution rather than
  // through the generic equipped-entries path, which no longer applies.
  { key: 'glyphs', label: 'Mount Glyphs', scope: 'mount', selection: 'tiered', tierCaps: { minor: 3, major: 2, mythic: 1 } },
];

/** Max relics a single Preset may equip (character-wide levels, per-preset equip - see relicsData.js's RELIC_EQUIP_CAP, same numeric cap). */
export const PRESET_RELIC_CAP = 4;

/** Max Sigils a single Preset may equip (equipped in the Presets editor; content is static game data in sigilsData.js). */
export const PRESET_SIGIL_CAP = 3;

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
 * Transcendence's tiered Ichor cost table (docs/Reference/Source/screenshots/transcendence):
 * the Nth SLOT filled (1-indexed, counting only common/uncommon nodes -
 * Ancient Sigils have their own flat cost, see TRANSCENDENCE_SIGIL_COST)
 * costs whatever tier `n` falls into. A common node fills 1 slot; an
 * uncommon (big) node fills TRANSCENDENCE_UNCOMMON_SLOTS slots at once and
 * costs those slots' prices combined (so it can straddle a tier boundary).
 * Shown as info in the UI (Ichor isn't a tracked/gated balance - see
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

/** An uncommon (big) node fills this many slots at once, paying each slot's tiered price. */
export const TRANSCENDENCE_UNCOMMON_SLOTS = 3;
