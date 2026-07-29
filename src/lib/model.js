/**
 * model.js - the typed data model + factories for the optimiser.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ THE SHAPE IS DOCUMENTED IN docs/Reference/data-model.md - read that   │
 * │ first. It owns: the full Roster/Character/Preset structure, the       │
 * │ character-wide vs per-preset vs per-mount scope split (§2), the       │
 * │ constraints this file enforces (§3), and the normalisation contract   │
 * │ every persisted field must satisfy (§4).                              │
 * │                                                                       │
 * │ The sketch below is a NAVIGATION AID for reading this file, not the   │
 * │ specification. If it disagrees with data-model.md, that document      │
 * │ wins and this comment is the bug.                                     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Roster      = { characters: Character[], currentId }
 * Character   = { id, name, class: 'Warrior'|'Sentinel'|null,
 *                 loadouts: [Loadout, Loadout],           // gear only
 *                 talentSets: [TalentSet, TalentSet],      // Set A / Set B
 *                 pets: PetEntry[],                        // shared collection, no per-pet level
 *                 petAltar: { tier, level },                // ONE tier+level for every pet (character-wide)
 *                 relicLevels: Record<defId, level>,       // character-wide levels
 *                 sigilValues: Record<sigilId, SigilValues>, // character-wide entered stat/damage numbers
 *                 sigilForgeTier: number,   // character-wide (1..3) - the Forge tiers every sigil at once
 *                 mounts: { entries },                      // character-wide stat entry; entries fixed to MOUNT_DEFS (mountsData.js), which mount is ridden is per-preset (Preset.mountId)
 *                 glyphs: { entries },                      // character-wide, tier-capped equip (see SOURCE_DEFS)
 *                 stoneInventory: StoneEntry[],             // character-wide shared inventory (like pets)
 *                 awakening: { path, points },              // character-wide
 *                 transcendence: { unlockedPositions },     // character-wide
 *                 presets: Preset[],
 *                 activePresetId: string|null,              // which preset the Presets editor shows (survives screen switches)
 *                 drop: DropState | null,                   // per-character (Preset redesign moved this off Roster)
 *                 dropGoal: { kind, ehpWeight } }           // Drop Check verdict goal (see DROP_GOAL_KINDS)
 * Loadout     = { name, gear: Record<Slot, OffensiveStats>, socketedStones: Record<Slot, stoneId|null> }
 * TalentSet   = { spec: specKey|null, allocation: Record<talentId, rank> }
 * PetEntry    = { id, name, rarity, companionId: string|null,
 *                 secondaries: [{ statKey, value }], stats: OffensiveStats }
 * StoneEntry  = { id, type: 'verdant'|'crimson'|'azure'|'eldaryn'|'mythic', quality: number,
 *                 rolledKeys: string[], stats: OffensiveStats }
 * Preset      = { id, name, loadout: 0|1, talentSet: 0|1, petId: string|null,
 *                 mountId: string|null (a MOUNT_DEFS id - the mount this preset rides),
 *                 relicIds: string[] (max PRESET_RELIC_CAP),
 *                 sigilIds: string[] (max PRESET_SIGIL_CAP, references the static
 *                 SIGILS_BY_CLASS catalogue for the character's class),
 *                 manualTotals: boolean, manualStats: OffensiveStats,
 *                 fortressBuffs: { top: boolean, bottom: boolean, core: boolean },
 *                 goal: PresetGoal|null, linked: boolean }
 * DropState   = { slot, piece: OffensiveStats }
 * SigilValues = { level, tier, passive: Record<statKey, number>,
 *                 active: Record<statKey, number>, damage, tickDamage }
 *
 * Field semantics for all of the above - what companionId null means, why
 * StoneEntry carries rolledKeys, which SigilValues fields are derived rather
 * than stored, the fortressBuffs exclusivity rule - are in
 * docs/Reference/data-model.md §1.
 */

import { offensiveStats } from './dps.js';
import { SLOTS, STAT_FIELDS, SOURCE_DEFS, CLASSES, SPECS_BY_CLASS, RARITIES, GLYPH_RARITIES, PRESET_RELIC_CAP, PRESET_SIGIL_CAP } from './constants.js';
import { majorGlyphById, resolveGlyphId } from './glyphsData.js';
import { TALENT_TREES } from './talentTreeData.js';
import { AWAKENING_PATHS, AWAKENING_TOTAL_POINTS } from './awakeningData.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { reachableFrom, effectiveUnlockedSet } from './transcendence.js';
import { stoneTypeDef } from './stonesData.js';
import { MOUNT_DEFS, mountStarLevels, mountStarRange } from './mountsData.js';
import { SIGILS_BY_CLASS, SIGIL_MAX_LEVEL, SIGIL_MAX_TIER } from './sigilsData.js';
import { companionById, COMPANION_MAX_TIER, COMPANION_MAX_LEVEL, petSecondarySlots, secondaryRange, clampSecondaryValue } from './petsData.js';

let _idCounter = 0;
function newId() {
  _idCounter += 1;
  return `c${Date.now().toString(36)}${_idCounter}`;
}

/** Empty stats record (all zero). Re-exported for convenience. */
export function emptyStats(overrides = {}) {
  return offensiveStats(overrides);
}

/** Per-slot map of empty stat records. */
function emptyGear() {
  const g = {};
  for (const slot of SLOTS) g[slot] = emptyStats();
  return g;
}

/** Per-slot map of no socketed stone (see Loadout.socketedStones). */
function emptySocketedStones() {
  const s = {};
  for (const slot of SLOTS) s[slot] = null;
  return s;
}

/** The correctly-shaped empty state for one SOURCE_DEFS entry (Mounts/Glyphs only - see constants.js). */
function emptySourceState(def) {
  return def.selection === 'single' ? { entries: [], activeId: null } : { entries: [] };
}

function findSourceDef(key) {
  return SOURCE_DEFS.find((d) => d.key === key);
}

/** 'Set A' | 'Set B' - fixed, non-renamable label for a talent-set index. */
export function talentSetLabel(index) {
  return index === 1 ? 'Set B' : 'Set A';
}

// --- Loadouts ---
export function newLoadout(name) {
  return { name, gear: emptyGear(), socketedStones: emptySocketedStones() };
}

// --- Talent Sets (Character.talentSets - moved off Loadout) ---
function newTalentSet() {
  return { spec: null, allocation: {} };
}

// --- Pets (shared collection) ---
// A pet is either a CATALOGUE pet (companionId set - Attack/Health derived from
// petsData.js's companion curve, plus rarity-many secondary rolls the user
// dials in) or a CUSTOM/legacy pet (companionId null - uses the hand-entered
// `stats` block, the pre-catalogue shape). petStats() (petsData.js) resolves
// either into the OffensiveStats totals.js consumes.
//
// A catalogue pet carries NO tier, level or rarity of its own: the Pet Altar
// tiers and levels every pet together (character.petAltar), and rarity is a
// property of the companion. Only a custom pet keeps its own rarity, since it
// has no catalogue entry to read one from.
export function newPetEntry({ name, rarity = 'Common', companionId = null, secondaries = [], stats = {} } = {}) {
  const def = companionById(companionId);
  const effectiveRarity = def ? def.rarity : RARITIES.includes(rarity) ? rarity : 'Common';
  return {
    id: newId(),
    name: name || def?.name || 'New Pet',
    rarity: effectiveRarity,
    companionId: def ? def.id : null,
    secondaries: normalisePetSecondaries(secondaries, effectiveRarity),
    stats: emptyStats(stats),
  };
}

/** The character-wide Pet Altar: one tier + level for the whole collection. */
export function emptyPetAltar() {
  return { tier: 1, level: 1 };
}

/**
 * Normalise the Pet Altar. Pre-altar saves carried a per-pet tier/level and a
 * legacy character-wide `petLevel`; the highest of those wins so migrating
 * never silently weakens a collection.
 */
function normalisePetAltar(raw, rawPets, legacyPetLevel) {
  const pets = Array.isArray(rawPets) ? rawPets : [];
  const tier = raw?.tier != null
    ? clampInt(raw.tier, 1, COMPANION_MAX_TIER)
    : Math.max(1, ...pets.map((p) => clampInt(p?.tier, 1, COMPANION_MAX_TIER)));
  const level = raw?.level != null
    ? clampInt(raw.level, 1, COMPANION_MAX_LEVEL)
    : Math.max(1, clampInt(legacyPetLevel, 1, COMPANION_MAX_LEVEL), ...pets.map((p) => clampInt(p?.level, 1, COMPANION_MAX_LEVEL)));
  return { tier, level };
}

function clampInt(value, lo, hi) {
  return Math.max(lo, Math.min(Math.round(Number(value)) || lo, hi));
}

// --- Mounts ---
// The mount list is the fixed MOUNT_DEFS catalogue (mountsData.js): every
// character always has one entry per catalogue mount. Player state is which
// star level the mount is, plus the two rolled bonus values (hpPct/atkPct),
// bounded to that star's observed range. Which mount is ridden is per-preset
// (Preset.mountId).
function clampMountVal(value, range) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return range ? range[0] : 0;
  if (!range) return Math.max(0, n);
  return Math.max(range[0], Math.min(n, range[1]));
}

function mountEntryFromDef(def, saved) {
  const stars = mountStarLevels(def);
  // star 0 = NOT OWNED. There is no separate `owned` flag: a mount is owned
  // exactly when it has a star level, which is what the star control on the
  // card sets (clicking the lit first star drops back to 0).
  let star = Number(saved?.star);
  if (!stars.includes(star)) {
    star = 0;
    // Legacy saves predate the star field: infer ownership from an entered
    // base HP%/ATK% (or an explicit owned flag), then pick the star whose HP
    // range best fits the value they entered.
    const legacyHp = Number(saved?.baseHpPct);
    const wasOwned =
      saved?.owned === true ||
      (saved?.owned === undefined && (Number(saved?.baseHpPct) > 0 || Number(saved?.baseAtkPct) > 0));
    if (wasOwned) {
      star = stars[0] ?? 0;
      if (saved?.hpPct === undefined && Number.isFinite(legacyHp) && legacyHp > 0) {
        let bestDist = Infinity;
        for (const s of stars) {
          const r = mountStarRange(def, s);
          const mid = (r.hp[0] + r.hp[1]) / 2;
          const d = Math.abs(mid - legacyHp);
          if (d < bestDist) { bestDist = d; star = s; }
        }
      }
    }
  }
  // An unowned mount still needs sane bounds to fall back on, so range/values
  // are read against its first star.
  const range = mountStarRange(def, star || stars[0] || 1);
  const rawHp = saved?.hpPct ?? saved?.baseHpPct ?? (range ? range.hp[0] : 0);
  const rawAtk = saved?.atkPct ?? saved?.baseAtkPct ?? (range ? range.atk[0] : 0);
  return {
    id: def.id,
    name: def.name,
    rarity: def.rarity,
    star,
    hpPct: clampMountVal(rawHp, range?.hp),
    atkPct: clampMountVal(rawAtk, range?.atk),
    // Glyphs are MOUNT-bound: these are ids into character.glyphs.entries.
    // Validated against the inventory in normaliseMounts.
    glyphIds: Array.isArray(saved?.glyphIds) ? saved.glyphIds.filter((id) => typeof id === 'string') : [],
  };
}

/** The full fixed mount catalogue with zeroed stats (which mount is ridden lives on each Preset.mountId). */
export function emptyMounts() {
  return { entries: MOUNT_DEFS.map((def) => mountEntryFromDef(def, null)) };
}

// --- Mount Glyphs ---
// A glyph lives in one character-wide INVENTORY, but is equipped onto specific
// MOUNTS (mount.glyphIds), not onto the character - so a preset riding the
// high-HP mount can run defensive glyphs while another preset's mount runs
// offensive ones. There is no `equipped` flag on the entry any more; a glyph
// is equipped exactly when some mount lists its id, and the same glyph may sit
// on any number of mounts at once.
//
// `special` is either null (a MINOR glyph: a free-form statKey/value roll) or
// a MAJOR_GLYPHS variant id like 'warhaste-emblem:rare' (glyphsData.js), whose
// statKey/value are inert - its effect retunes the referenced Sigil instead.
export function newMountGlyphEntry({ tier = 'minor', rarity = 'Common', statKey = 'attack_pct', value = 0, special = null } = {}) {
  return { id: newId(), tier, rarity, statKey, value, special };
}

// --- Socketed Stones (character-wide shared inventory; see stonesData.js for per-type shape) ---
export function newStoneEntry({ type, quality = 1, rolledKeys = [], stats = {} } = {}) {
  return { id: newId(), type, quality, rolledKeys: [...rolledKeys], stats: emptyStats(stats) };
}

/** Empty Awakening state: no path chosen, no points invested. */
function emptyAwakening() {
  return { path: null, points: 0 };
}

/** Empty Transcendence state: no nodes unlocked. */
function emptyTranscendence() {
  return { unlockedPositions: [] };
}

// --- Presets (the unit that ties a loadout + talent set + pet + relics together) ---

/** The optimization goals a preset can be assigned; null kind = unassigned. */
export const PRESET_GOAL_KINDS = ['dps', 'tank', 'pvp', 'custom'];

/**
 * A preset's assigned optimization goal (goals/linking redesign, see
 * docs/Reference/Notes/goals-linking-redesign-notes.md). `kind` null means unassigned - the
 * UI prompts rather than silently defaulting. 'tank' is Warrior-only.
 * `name` is the user-facing label for 'custom' goals. `ehpWeight` is the
 * Tank blend weight (tankObjective.js semantics). `weights` are the PVP/
 * Custom factor sliders (Maximum Damage / Damage Mitigation / Survivability),
 * kept summing to 100 by normalisation. `linked` marks the two presets the
 * linking simulation evaluates (first two by default) - see
 * linkingSimulation.js, which shipped in slice 4.
 */
/** Display label for a preset's goal; null when unassigned (UI shows a prompt). */
export function presetGoalLabel(goal) {
  switch (goal?.kind) {
    case 'dps': return 'DPS';
    case 'tank': return 'Tank';
    case 'pvp': return 'PVP';
    case 'custom': return goal.name?.trim() || 'Custom';
    default: return null;
  }
}

export function newPresetGoal({ linked = false } = {}) {
  return {
    kind: null,
    name: '',
    ehpWeight: 0.5,
    weights: { damage: 34, mitigation: 33, survivability: 33 },
    linked,
  };
}

export function newPreset(name, { loadout = 0, talentSet = 0, manualTotals = false, linked = false } = {}) {
  return {
    id: newId(),
    name,
    loadout,
    talentSet,
    petId: null,
    mountId: null,
    relicIds: [],
    sigilIds: [],
    manualTotals,
    manualStats: emptyStats(),
    fortressBuffs: { top: false, bottom: false, core: false },
    goal: newPresetGoal({ linked }),
  };
}

// --- PVP Opponents (character-wide; manually-entered enemy profiles for the PVP simulator) ---
/**
 * Opponent = { id, name, class, stats, sigilIds, sigilValues }
 * `stats` is a full OffensiveStats record entered from the enemy's in-game
 * profile (so sigil passives etc. are already baked in); `sigilIds` (max
 * PRESET_SIGIL_CAP) + `sigilValues` mirror the character's own sigil shape
 * and feed only the simulation's ACTIVE effects.
 */
export function newOpponent(name = 'New Opponent') {
  return {
    id: newId(),
    name,
    class: null, // 'Warrior' | 'Sentinel' | null
    stats: emptyStats(),
    sigilIds: [],
    sigilValues: {},
    specialGlyphIds: [], // SPECIAL_GLYPHS ids the enemy runs (modify their sigil actives)
  };
}

// Pre-runHistory saved-result kinds - only read during legacy migration
// (normaliseCharacter folds old `savedResults` into `runHistory` once).
const LEGACY_SAVED_RESULT_KINDS = ['sim', 'opt', 'pvp-sim', 'pvp-opt', 'sim-compare'];

/**
 * Run history (Simulations Dashboard) - the auto-saved successor to saved
 * results: every completed run records itself, no manual Save step.
 *
 * Each entry splits its payload in two:
 *  - `headline`: a tiny kind-specific record of plain numbers/strings kept
 *    FOREVER - it feeds the Dashboard's long-term history charts.
 *  - `detail`: the full display payload (histograms, damage breakdowns,
 *    optimizer changes, capped duel timelines). Only the newest
 *    RUN_DETAIL_LIMIT entries per kind keep it; older entries COMPACT to
 *    `detail: null` (headline row only). `pinned` entries never compact and
 *    don't count against the limit.
 *
 * Same plain-data contract as saved results: numbers and strings only,
 * never live references into the build. `goalKind`/`presetName` are
 * snapshots of the moment the run happened - they don't chase later edits.
 */
export const RUN_KINDS = ['sim', 'sim-compare', 'opt', 'pvp-sim', 'pvp-opt', 'pvp-matrix', 'pvp-gauntlet'];
export const RUN_DETAIL_LIMIT = 50; // full-detail entries kept per kind (pinned exempt)

export function newRunEntry(kind, fields = {}) {
  return {
    id: newId(),
    kind,
    at: new Date().toISOString(),
    name: typeof fields.name === 'string' && fields.name ? fields.name : 'Run',
    goalKind: typeof fields.goalKind === 'string' ? fields.goalKind : null,
    presetId: fields.presetId ?? null,
    presetName: typeof fields.presetName === 'string' ? fields.presetName : '',
    notes: '',
    pinned: false,
    headline: fields.headline && typeof fields.headline === 'object' ? fields.headline : {},
    detail: fields.detail && typeof fields.detail === 'object' ? fields.detail : null,
  };
}

/**
 * Compact a newest-first run history in place: beyond the newest
 * RUN_DETAIL_LIMIT unpinned detailed entries of each kind, `detail` drops to
 * null. Pinned entries are skipped entirely (keep detail, don't count).
 */
export function compactRunHistory(entries) {
  const detailedByKind = {};
  for (const e of entries) {
    if (e.pinned || e.detail === null) continue;
    detailedByKind[e.kind] = (detailedByKind[e.kind] || 0) + 1;
    if (detailedByKind[e.kind] > RUN_DETAIL_LIMIT) e.detail = null;
  }
  return entries;
}

/**
 * Preventive size budget for the single-localStorage-key persistence
 * (storage.js silently swallows quota errors, so overflow must be prevented
 * BEFORE persist, not detected after). Two stages, oldest-first, pinned
 * always exempt: (1) drop `detail` until the serialized history fits the
 * byte budget; (2) still over on headline rows alone -> drop whole compact
 * rows beyond `maxRowsPerKind`.
 */
export const RUN_HISTORY_BYTE_BUDGET = 1_500_000;
export const RUN_HISTORY_MAX_ROWS_PER_KIND = 2000;

export function enforceRunHistoryBudget(
  entries,
  { byteBudget = RUN_HISTORY_BYTE_BUDGET, maxRowsPerKind = RUN_HISTORY_MAX_ROWS_PER_KIND } = {}
) {
  if (JSON.stringify(entries).length <= byteBudget) return entries;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.pinned || e.detail === null) continue;
    e.detail = null;
    if (JSON.stringify(entries).length <= byteBudget) return entries;
  }
  const kept = [];
  const rowsByKind = {};
  for (const e of entries) {
    if (!e.pinned) {
      rowsByKind[e.kind] = (rowsByKind[e.kind] || 0) + 1;
      if (rowsByKind[e.kind] > maxRowsPerKind) continue;
    }
    kept.push(e);
  }
  return kept;
}

/**
 * The linking simulation's persisted outcome (character-bound). `null` =
 * never run, so the Dashboard shows its setup section.
 *
 * Only the `completedAt` gate is validated; everything else passes through
 * untouched. That is deliberate forward-compatibility, not an unfinished
 * validator - the outcome shape is owned by linkingSimulation.js and may grow
 * (it already carries per-preset stat priorities and talent lean), and a
 * strict schema here would drop fields a newer run had written.
 */
export function normaliseLinkingSim(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.completedAt !== 'string') return null;
  const out = { ...raw }; // unknown/forward keys pass through (the outcome shape can grow)
  // `presets` drives the report UI - coerce to an array of plain objects,
  // dropping anything malformed so imported/hand-edited state can't crash it.
  out.presets = (Array.isArray(raw.presets) ? raw.presets : []).filter(
    (p) => p && typeof p === 'object' && typeof p.presetId === 'string'
  );
  return out;
}

export function newCharacter(name = 'New Character') {
  return {
    id: newId(),
    name,
    class: null, // 'Warrior' | 'Sentinel' | null
    loadouts: [newLoadout('Loadout 1'), newLoadout('Loadout 2')],
    talentSets: [newTalentSet(), newTalentSet()],
    pets: [],
    petAltar: emptyPetAltar(), // character-wide: tiers and levels every pet at once
    relicLevels: {},
    sigilValues: {},
    sigilForgeTier: 1, // character-wide: the Forge tiers every sigil together
    mounts: emptyMounts(),
    glyphs: emptySourceState(findSourceDef('glyphs')),
    stoneInventory: [],
    awakening: emptyAwakening(),
    transcendence: emptyTranscendence(),
    // Every preset defaults to Calculated mode, including a fresh character's
    // seeded ones - see rosterStore.addPreset for presets created later.
    // Two presets minimum (goals/linking redesign): the first two are the
    // linked pair the linking simulation will read; goals start unassigned.
    presets: [newPreset('Preset 1', { linked: true }), newPreset('Preset 2', { linked: true })],
    activePresetId: null, // normaliseCharacter falls back to the first preset
    drop: null,
    dropGoal: { kind: 'dps-fast', ehpWeight: 0.5 },
    pvpOpponents: [],
    runHistory: [],
    linkingSim: null, // filled by linkingSimulation.js: { completedAt, ...outcome }
  };
}

export function newRoster() {
  const c = newCharacter('Character 1');
  return { characters: [c], currentId: c.id };
}

/** No characters yet - the landing/welcome screen creates the first one. */
export function emptyRoster() {
  return { characters: [], currentId: null };
}

export function getCurrent(roster) {
  return roster.characters.find((c) => c.id === roster.currentId) || roster.characters[0] || null;
}

/**
 * Migrate / normalise an arbitrary parsed object into a valid Roster, filling
 * missing fields with defaults. Keeps import and old-state loads safe.
 */
export function normaliseRoster(raw) {
  if (!raw || !Array.isArray(raw.characters) || raw.characters.length === 0) {
    return emptyRoster();
  }
  const characters = raw.characters.map((c) =>
    normaliseCharacter(isLegacyCharacter(c) ? migrateLegacyCharacter(c) : c)
  );
  const currentId = characters.some((c) => c.id === raw.currentId) ? raw.currentId : characters[0].id;
  return { characters, currentId };
}

/**
 * A pre-redesign save has `talentAllocation` directly on a loadout - the new
 * shape never has that key (talent allocation moved to Character.talentSets).
 * That's a reliable, cheap discriminator without needing a version number.
 */
function isLegacyCharacter(c) {
  return Array.isArray(c?.loadouts) && c.loadouts.some((l) => l && 'talentAllocation' in l);
}

/**
 * Converts a pre-redesign Character (two loadouts each carrying their own
 * spec/talentAllocation/relics, Character.sources.{pets,mounts,mountGlyphs})
 * into the new shape. Deliberately best-effort/loose - the result is run
 * through normaliseCharacter() right after, which clamps/repairs anything
 * this pass gets approximately right.
 *
 * Seeds exactly 2 presets, one per old loadout/talent-set index (Set A/B
 * already *was* Loadout 1/2 pre-redesign, so this is a relocation, not a
 * semantic change). Old per-loadout relic `equipped` entries become that
 * preset's relicIds (already capped at 4 by the old RELIC_EQUIP_CAP); old
 * per-loadout relic `level` values collapse into one character-wide level
 * per defId (max across both loadouts - the least-surprising default, since
 * the new model can't represent two different levels for the same relic).
 * The old "active pet" (already character-wide/shared pre-redesign, just
 * modeled as a single-select source) becomes both seeded presets' petId, and
 * its `level` seeds the character-wide Pet Altar level. Old roster-level drop
 * state is NOT migrated (Preset redesign moves Drop to per-character and
 * starts it empty - an in-flight comparison isn't worth preserving across a
 * one-time migration).
 */
function migrateLegacyCharacter(oldChar) {
  const oldLoadouts = Array.isArray(oldChar?.loadouts) ? oldChar.loadouts : [];
  const characterClass = CLASSES.includes(oldChar?.class) ? oldChar.class : null;

  const loadouts = [0, 1].map((i) => ({
    name: oldLoadouts[i]?.name || `Loadout ${i + 1}`,
    gear: oldLoadouts[i]?.gear || {},
  }));

  const talentSets = [0, 1].map((i) => ({
    spec: oldLoadouts[i]?.spec ?? null,
    allocation: oldLoadouts[i]?.talentAllocation || {},
  }));

  const relicLevels = {};
  const presetRelicIds = [[], []];
  oldLoadouts.forEach((loadout, i) => {
    for (const entry of loadout?.relics?.entries || []) {
      if (!entry?.defId) continue;
      const level = Number(entry.level) || 1;
      relicLevels[entry.defId] = Math.max(relicLevels[entry.defId] || 0, level);
      if (entry.equipped) presetRelicIds[i].push(entry.defId);
    }
  });

  const oldPetEntries = Array.isArray(oldChar?.sources?.pets?.entries) ? oldChar.sources.pets.entries : [];
  const activePetId = oldChar?.sources?.pets?.activeId ?? null;
  const activePet = oldPetEntries.find((p) => p?.id === activePetId);
  const pets = oldPetEntries.map((p) => ({ id: p.id, name: p.name, rarity: p.rarity, stats: p.stats || {} }));
  // The old active pet's level seeds the character-wide Pet Altar level;
  // normalisePetAltar clamps it and picks the max against anything else.
  const petAltar = { tier: 1, level: Number(activePet?.level) || 1 };

  const presets = [0, 1].map((i) => ({
    id: `${oldChar.id || 'char'}-preset-${i + 1}`,
    name: oldLoadouts[i]?.name || `Preset ${i + 1}`,
    loadout: i,
    talentSet: i,
    petId: activePetId,
    relicIds: presetRelicIds[i],
    sigilIds: [],
    manualTotals: oldLoadouts[i]?.manualTotals !== false,
    manualStats: oldLoadouts[i]?.profileTotals || {},
  }));

  return {
    id: oldChar.id,
    name: oldChar.name,
    class: characterClass,
    loadouts,
    talentSets,
    pets,
    petAltar,
    relicLevels,
    mounts: oldChar?.sources?.mounts || { entries: [], activeId: null },
    glyphs: oldChar?.sources?.mountGlyphs || { entries: [] },
    awakening: oldChar?.awakening || { path: null, points: 0 },
    transcendence: oldChar?.transcendence || { unlockedPositions: [] },
    presets,
    drop: null,
  };
}

function normaliseCharacter(c) {
  const base = newCharacter(c?.name || 'Character');
  if (c?.id) base.id = c.id;
  base.class = CLASSES.includes(c?.class) ? c.class : null;

  base.stoneInventory = normaliseStoneInventory(c?.stoneInventory);
  const stoneIds = new Set(base.stoneInventory.map((s) => s.id));

  const loadouts = Array.isArray(c?.loadouts) ? c.loadouts : [];
  base.loadouts = [
    normaliseLoadout(loadouts[0], 'Loadout 1', stoneIds),
    normaliseLoadout(loadouts[1], 'Loadout 2', stoneIds),
  ];

  const talentSets = Array.isArray(c?.talentSets) ? c.talentSets : [];
  base.talentSets = [
    normaliseTalentSet(talentSets[0], base.class),
    normaliseTalentSet(talentSets[1], base.class),
  ];

  base.pets = normalisePets(c?.pets);
  // Read BEFORE the per-pet tier/level are dropped, so old saves migrate.
  base.petAltar = normalisePetAltar(c?.petAltar, c?.pets, c?.petLevel);
  base.relicLevels = normaliseRelicLevels(c?.relicLevels, base.class);
  base.sigilValues = normaliseSigilValues(c?.sigilValues, base.class);
  // Read BEFORE the per-sigil tiers are dropped, so old saves migrate.
  base.sigilForgeTier = normaliseSigilForgeTier(c?.sigilForgeTier, c?.sigilValues);

  base.glyphs = normaliseGlyphs(c?.glyphs);
  // Mounts must settle after the glyph inventory: mount.glyphIds points into it.
  base.mounts = reconcileMountGlyphs(normaliseMounts(c?.mounts), base.glyphs);
  base.awakening = normaliseAwakening(c?.awakening);
  base.transcendence = normaliseTranscendence(c?.transcendence, base.class);

  const petIds = new Set(base.pets.map((p) => p.id));
  const relicDefIds = new Set(Object.keys(base.relicLevels));
  const sigilDefIds = new Set((SIGILS_BY_CLASS[base.class] || []).map((s) => s.id));
  const legacyMountId = legacyActiveMountId(c?.mounts);
  const rawPresets = Array.isArray(c?.presets) ? c.presets : [];
  base.presets = rawPresets.length
    ? rawPresets.map((p, i) => normalisePreset(p, petIds, relicDefIds, sigilDefIds, legacyMountId, base.class, i))
    : [newPreset('Preset 1', { linked: true })];
  // Two-preset minimum (goals/linking redesign): rosters saved before this
  // shape change get their second, linked-by-default preset seeded here.
  while (base.presets.length < 2) {
    base.presets.push(newPreset(`Preset ${base.presets.length + 1}`, { linked: true }));
  }

  base.activePresetId = base.presets.some((p) => p.id === c?.activePresetId)
    ? c.activePresetId
    : base.presets[0]?.id ?? null;

  base.drop = normaliseDrop(c?.drop);
  base.dropGoal = normaliseDropGoal(c?.dropGoal, base.class);
  base.pvpOpponents = normaliseOpponents(c?.pvpOpponents);
  // Legacy migration: saves from before the auto-saved run history carry
  // savedResults but no runHistory field at all - fold them in once (the
  // presence of ANY runHistory value, even [], means migration already ran).
  // The normalised output no longer carries a savedResults field.
  base.runHistory =
    c?.runHistory === undefined && Array.isArray(c?.savedResults)
      ? normaliseRunHistory(normaliseLegacySavedResults(c.savedResults).map(savedResultToRunEntry))
      : normaliseRunHistory(c?.runHistory);
  base.linkingSim = normaliseLinkingSim(c?.linkingSim);
  return base;
}

/**
 * Legacy saved-result snapshots, read only by the one-time runHistory
 * migration. Entries missing an id / with a dupe id or an unknown kind are
 * dropped; the summary payload is only coerced to an object.
 */
function normaliseLegacySavedResults(raw) {
  const seen = new Set();
  const entries = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r?.id || seen.has(r.id) || !LEGACY_SAVED_RESULT_KINDS.includes(r?.kind)) continue;
    seen.add(r.id);
    entries.push({
      id: r.id,
      kind: r.kind,
      name: typeof r.name === 'string' && r.name ? r.name : 'Saved result',
      savedAt: typeof r.savedAt === 'string' ? r.savedAt : '',
      notes: typeof r.notes === 'string' ? r.notes : '',
      pinned: r.pinned === true,
      summary: r.summary && typeof r.summary === 'object' ? r.summary : {},
    });
  }
  return entries;
}

/**
 * Run-history entries. Same light-touch policy as saved results (headline/
 * detail are display-only plain data, coerced to objects, never resolved
 * against static domain data), plus: newest-first ordering by `at` and the
 * per-kind detail compaction - enforced here as well as in the add mutator
 * so imported/hand-edited state self-repairs.
 */
function normaliseRunHistory(raw) {
  const seen = new Set();
  const entries = [];
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!r?.id || seen.has(r.id) || !RUN_KINDS.includes(r?.kind)) continue;
    seen.add(r.id);
    entries.push({
      id: r.id,
      kind: r.kind,
      at: typeof r.at === 'string' && r.at ? r.at : new Date().toISOString(),
      name: typeof r.name === 'string' && r.name ? r.name : 'Run',
      goalKind: PRESET_GOAL_KINDS.includes(r.goalKind) ? r.goalKind : null,
      presetId: r.presetId ?? null,
      presetName: typeof r.presetName === 'string' ? r.presetName : '',
      notes: typeof r.notes === 'string' ? r.notes : '',
      pinned: r.pinned === true,
      headline: r.headline && typeof r.headline === 'object' ? r.headline : {},
      detail: r.detail && typeof r.detail === 'object' ? r.detail : null,
    });
  }
  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return compactRunHistory(entries);
}

/**
 * One legacy saved result -> run entry. The summary becomes the detail
 * verbatim; the headline is derived best-effort from the fields each kind's
 * old Save button snapshotted ({} when unrecognised - the row still lists,
 * it just can't feed charts). All five legacy kinds exist in RUN_KINDS.
 */
function savedResultToRunEntry(r) {
  const s = r.summary || {};
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  let headline = {};
  if (r.kind === 'sim') {
    headline = strip({
      meanDps: num(s.meanDps),
      p5: num(s.totalDamage?.p5),
      p95: num(s.totalDamage?.p95),
      iterations: num(s.iterations),
      durationSeconds: num(s.durationSeconds),
    });
  } else if (r.kind === 'sim-compare') {
    headline = strip({ aName: s.presetAName, bName: s.presetBName, aDps: num(s.meanDpsA), bDps: num(s.meanDpsB), deltaPct: num(s.deltaPct) });
  } else if (r.kind === 'opt') {
    headline = strip({
      unit: typeof s.goal === 'string' ? s.goal : undefined,
      baseline: num(s.baselineScore),
      best: num(s.bestScore),
      improvementPct: num(s.improvementPct),
      ichorSpent: num(s.ichorSpent),
    });
  } else if (r.kind === 'pvp-sim') {
    headline = strip({ opponentName: s.opponentName, winRate: num(s.winRate), killRate: num(s.killRate), meanTimeToKill: num(s.meanTimeToKill) });
  } else if (r.kind === 'pvp-opt') {
    headline = strip({ opponents: s.opponentName, baselineWinRate: num(s.beforeWinRate), bestWinRate: num(s.afterWinRate) });
  }
  return {
    id: r.id,
    kind: r.kind,
    at: r.savedAt,
    name: r.name,
    goalKind: null,
    presetId: r.summary?.presetId ?? null,
    presetName: typeof r.summary?.presetName === 'string' ? r.summary.presetName : '',
    notes: r.notes,
    pinned: r.pinned,
    headline,
    detail: s,
  };
}

/**
 * Opponents carry their OWN class (independent of the character's), so their
 * sigil references validate against that class's catalogue. Malformed
 * entries (no id, dupe id) are dropped; sigilIds are deduped, resolved
 * against the class catalogue and capped at PRESET_SIGIL_CAP.
 */
function normaliseOpponents(raw) {
  const seen = new Set();
  const opponents = [];
  for (const o of Array.isArray(raw) ? raw : []) {
    if (!o?.id || seen.has(o.id)) continue;
    seen.add(o.id);
    const opponentClass = CLASSES.includes(o?.class) ? o.class : null;
    const sigilDefIds = new Set((SIGILS_BY_CLASS[opponentClass] || []).map((s) => s.id));
    const sigilIds = [...new Set(Array.isArray(o.sigilIds) ? o.sigilIds : [])]
      .filter((id) => sigilDefIds.has(id))
      .slice(0, PRESET_SIGIL_CAP);
    opponents.push({
      id: o.id,
      name: o.name || 'Opponent',
      class: opponentClass,
      stats: emptyStats(o.stats || {}),
      sigilIds,
      sigilValues: normaliseSigilValues(o.sigilValues, opponentClass),
      // Special mount glyphs the enemy runs (validated against the global
      // catalogue) - they modify the enemy's sigil actives in a duel.
      specialGlyphIds: [
        ...new Set(
          (Array.isArray(o.specialGlyphIds) ? o.specialGlyphIds : []).map(resolveGlyphId).filter(Boolean),
        ),
      ],
    });
  }
  return opponents;
}

/**
 * `stoneIds` is this character's already-normalised stone inventory ids. A
 * socketedStones entry is dropped (set to null) if it points at a stone that
 * doesn't exist, or if that stone id was already claimed by an earlier slot
 * in this same loadout (SLOTS order) - a stone can only occupy one slot per
 * loadout (see model.js header comment / rosterStore.socketStone).
 */
function normaliseLoadout(l, fallbackName, stoneIds) {
  const base = newLoadout(l?.name || fallbackName);
  const claimed = new Set();
  for (const slot of SLOTS) {
    base.gear[slot] = emptyStats(l?.gear?.[slot] || {});
    const stoneId = l?.socketedStones?.[slot];
    if (stoneId && stoneIds.has(stoneId) && !claimed.has(stoneId)) {
      base.socketedStones[slot] = stoneId;
      claimed.add(stoneId);
    }
  }
  return base;
}

/** Drops entries missing an id/dupe id, or whose type isn't a real STONE_TYPES key; clamps quality, defends stats shape. */
function normaliseStoneInventory(raw) {
  const seen = new Set();
  const entries = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    if (!s?.id || seen.has(s.id) || !stoneTypeDef(s?.type)) continue;
    seen.add(s.id);
    const rolledKeys = Array.isArray(s.rolledKeys) ? s.rolledKeys.filter((k) => STAT_FIELDS.some((f) => f.key === k)) : [];
    entries.push({
      id: s.id,
      type: s.type,
      quality: Math.max(0, Number(s.quality) || 0),
      rolledKeys,
      stats: emptyStats(s.stats || {}),
    });
  }
  return entries;
}

function normaliseTalentSet(raw, characterClass) {
  const validSpecKeys = (SPECS_BY_CLASS[characterClass] || []).map((s) => s.key);
  const spec = validSpecKeys.includes(raw?.spec) ? raw.spec : null;
  return { spec, allocation: normaliseTalentAllocation(raw?.allocation, spec) };
}

/**
 * Keep at most `petSecondarySlots(rarity)` valid, de-duplicated secondary rolls,
 * each clamped to its stat's range/step (petsData.js). Unknown/junk statKeys and
 * overflow past the rarity's slot count are dropped.
 */
function normalisePetSecondaries(raw, rarity) {
  const slots = petSecondarySlots(rarity);
  const out = [];
  const seen = new Set();
  for (const s of Array.isArray(raw) ? raw : []) {
    if (out.length >= slots) break;
    if (!s || !secondaryRange(s.statKey) || seen.has(s.statKey)) continue;
    seen.add(s.statKey);
    out.push({ statKey: s.statKey, value: clampSecondaryValue(s.statKey, s.value) });
  }
  return out;
}

/**
 * Drops malformed entries (missing id, dupes). A pet whose `companionId`
 * resolves against the static COMPANION_DEFS catalogue becomes a catalogue pet
 * (rarity taken FROM the catalogue, secondaries validated against it,
 * Attack/Health derived at read time from the Pet Altar); everything else
 * stays a custom/legacy pet keeping its `stats` block, so pre-catalogue saves
 * survive untouched.
 *
 * Per-pet `tier`/`level` from pre-altar saves are read by normalisePetAltar
 * before being dropped here.
 */
function normalisePets(raw) {
  const seen = new Set();
  const pets = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const def = companionById(p.companionId);
    if (def) {
      pets.push({
        id: p.id,
        name: p.name || def.name,
        // Catalogue wins: a saved rarity that disagrees is data-entry drift,
        // and it decides how many secondary slots the pet has.
        rarity: def.rarity,
        companionId: def.id,
        secondaries: normalisePetSecondaries(p.secondaries, def.rarity),
        stats: emptyStats(),
      });
    } else {
      const rarity = RARITIES.includes(p.rarity) ? p.rarity : 'Common';
      pets.push({
        id: p.id,
        name: p.name || 'Pet',
        rarity,
        companionId: null,
        secondaries: [],
        stats: emptyStats(p.stats || {}),
      });
    }
  }
  return pets;
}

/** Drops levels for defIds that no longer exist for this class's (static) relics, clamps to [0, maxLevel]. */
function normaliseRelicLevels(raw, characterClass) {
  const defs = RELICS_BY_CLASS[characterClass] || [];
  const defById = new Map(defs.map((d) => [d.id, d]));
  const levels = {};
  for (const [defId, level] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const def = defById.get(defId);
    if (!def) continue;
    levels[defId] = Math.max(0, Math.min(Number(level) || 0, def.maxLevel));
  }
  return levels;
}

/**
 * One fresh SigilValues block: a 0 for every statKey `def` declares, plus the
 * damage fields. `level` drives the derived passive Attack/Health (sigilStat,
 * sigilsData.js) together with the character-wide `sigilForgeTier` - the
 * passive attack/health entries stay 0 in storage and are computed at read
 * time in totals.js for baked sigils.
 *
 * There is deliberately NO per-sigil `tier` here: the Sigil Forge tiers every
 * sigil at once, so tier is one character-wide number (see
 * normaliseSigilForgeTier).
 */
export function emptySigilValues(def) {
  const zeros = (stats) => Object.fromEntries((stats || []).map((s) => [s.statKey, 0]));
  return {
    level: 0, // 0 = not owned/levelled -> derived Attack/Health contribute nothing
    passive: zeros(def?.passive?.stats),
    active: zeros(def?.active?.stats),
    damage: 0,
    tickDamage: 0,
    regenDebuffPct: 0, // enemy HP-Regen debuff % (level-scaled, e.g. Withering Touch)
  };
}

/**
 * The character-wide Sigil Forge tier. Older saves stored a `tier` on every
 * sigil independently; since the forge tiers them together, any spread in a
 * saved file is data-entry drift, so the highest levelled sigil's tier wins -
 * that can only ever raise stats, never silently lower them.
 */
function normaliseSigilForgeTier(raw, rawValues) {
  const direct = clampInt(raw, 1, SIGIL_MAX_TIER);
  if (direct >= 1 && raw != null) return direct;
  let best = 1;
  for (const entry of Object.values(rawValues && typeof rawValues === 'object' ? rawValues : {})) {
    if (!entry || typeof entry !== 'object') continue;
    if ((clampInt(entry.level, 0, SIGIL_MAX_LEVEL) || 0) < 1) continue;
    best = Math.max(best, clampInt(entry.tier, 1, SIGIL_MAX_TIER));
  }
  return best;
}

/**
 * Drops entries for sigilIds that don't exist in this class's (static)
 * catalogue, and drops stat values for statKeys the sigil's own passive/
 * active doesn't declare - the entered numbers can only ever fill in the
 * catalogue's structure, never extend it.
 */
function normaliseSigilValues(raw, characterClass) {
  const defs = SIGILS_BY_CLASS[characterClass] || [];
  const defById = new Map(defs.map((d) => [d.id, d]));
  const values = {};
  for (const [sigilId, entry] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    const def = defById.get(sigilId);
    if (!def || !entry || typeof entry !== 'object') continue;
    const base = emptySigilValues(def);
    base.level = clampInt(entry.level, 0, SIGIL_MAX_LEVEL);
    for (const effectType of ['passive', 'active']) {
      for (const key of Object.keys(base[effectType])) {
        base[effectType][key] = Number(entry[effectType]?.[key]) || 0;
      }
    }
    base.damage = Math.max(0, Number(entry.damage) || 0);
    base.tickDamage = Math.max(0, Number(entry.tickDamage) || 0);
    base.regenDebuffPct = Math.min(100, Math.max(0, Number(entry.regenDebuffPct) || 0));
    values[sigilId] = base;
  }
  return values;
}

function normaliseMounts(raw) {
  const saved = Array.isArray(raw?.entries) ? raw.entries : [];
  // Entries are always rebuilt from the fixed catalogue; saved stats are
  // carried over by id, falling back to a name match so pre-catalogue
  // user-created mounts (arbitrary ids) keep their entered stats.
  const savedFor = (def) =>
    saved.find((e) => e?.id === def.id) ??
    saved.find((e) => typeof e?.name === 'string' && e.name.trim().toLowerCase() === def.name.toLowerCase());
  return { entries: MOUNT_DEFS.map((def) => mountEntryFromDef(def, savedFor(def))) };
}

/**
 * Pre-per-preset saves carried ONE character-wide ridden mount as
 * mounts.activeId; map it onto a catalogue id (directly or via a legacy
 * user-created entry's name) so normalisePreset can seed every preset's
 * mountId from it.
 */
function legacyActiveMountId(raw) {
  if (!raw?.activeId) return null;
  const saved = Array.isArray(raw?.entries) ? raw.entries : [];
  const savedActive = saved.find((e) => e?.id === raw.activeId);
  const activeDef =
    MOUNT_DEFS.find((def) => def.id === raw.activeId) ??
    (typeof savedActive?.name === 'string'
      ? MOUNT_DEFS.find((def) => def.name.toLowerCase() === savedActive.name.trim().toLowerCase())
      : null);
  return activeDef?.id ?? null;
}

/**
 * Per-entry glyph repair: pre-rarity saves get 'Common'; an unknown rarity or
 * tier falls back to defaults; a `special` id must resolve against the static
 * MAJOR_GLYPHS catalogue (which then dictates the entry's tier AND rarity,
 * since a variant id encodes both) or it drops back to an ordinary stat glyph.
 *
 * The pre-catalogue 'ember-curse-glyph' id is remapped by resolveGlyphId.
 * Note there is no `equipped` here any more - see the Mount Glyphs comment
 * above; equip state moved onto mount.glyphIds.
 */
function normaliseGlyphs(raw) {
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  const tierCaps = findSourceDef('glyphs').tierCaps;
  return {
    entries: entries
      .filter((e) => e && typeof e === 'object')
      .map((e) => {
        const specialDef = majorGlyphById(resolveGlyphId(e.special));
        return {
          id: typeof e.id === 'string' ? e.id : newId(),
          tier: specialDef ? specialDef.tier : e.tier in tierCaps ? e.tier : 'minor',
          rarity: specialDef ? specialDef.rarity : GLYPH_RARITIES.includes(e.rarity) ? e.rarity : 'Common',
          statKey: STAT_FIELDS.some((f) => f.key === e.statKey) ? e.statKey : 'attack_pct',
          value: Number(e.value) || 0,
          special: specialDef ? specialDef.id : null,
        };
      }),
  };
}

/**
 * Second pass over mounts, once the glyph inventory is known: drop glyph ids
 * that no longer resolve, de-duplicate, and enforce the per-mount tier caps
 * (3 minor / 2 major / 1 mythic - the six slots a mount card shows).
 *
 * A glyph may sit on any number of mounts at once, so there is deliberately no
 * cross-mount uniqueness check here.
 */
function reconcileMountGlyphs(mounts, glyphs) {
  const byId = new Map(glyphs.entries.map((g) => [g.id, g]));
  const tierCaps = findSourceDef('glyphs').tierCaps;
  for (const mount of mounts.entries) {
    const kept = [];
    const perTier = {};
    for (const glyphId of mount.glyphIds) {
      const glyph = byId.get(glyphId);
      if (!glyph || kept.includes(glyphId)) continue;
      const cap = tierCaps[glyph.tier] ?? 0;
      perTier[glyph.tier] = (perTier[glyph.tier] || 0) + 1;
      if (perTier[glyph.tier] > cap) continue;
      kept.push(glyphId);
    }
    mount.glyphIds = kept;
  }
  return mounts;
}

/** Validates path against the static AWAKENING_PATHS, clamps points to [0, cap], forces points to 0 with no path. */
function normaliseAwakening(raw) {
  const path = raw?.path in AWAKENING_PATHS ? raw.path : null;
  if (!path) return emptyAwakening();
  const points = Math.max(0, Math.min(Number(raw?.points) || 0, AWAKENING_TOTAL_POINTS));
  return { path, points };
}

/**
 * Drops positions that no longer exist in this class's (static) tree, drops
 * glyph sockets (inert - never a legal stored entry, even from old/corrupt
 * data), de-dupes while preserving unlock order (order feeds the Ichor-spent
 * display, see transcendence.js), and drops anything no longer reachable
 * from the tree's start position via the remaining unlocked set - the same
 * cascade rule applied live when a node is removed through the UI, reapplied
 * here in case a class change or manual import left an orphaned position.
 */
function normaliseTranscendence(raw, characterClass) {
  const tree = characterClass ? TRANSCENDENCE_TREES[characterClass] : null;
  if (!tree) return emptyTranscendence();
  const byPosition = new Map(tree.nodes.map((n) => [n.position, n]));
  const seen = new Set();
  const ordered = [];
  for (const position of Array.isArray(raw?.unlockedPositions) ? raw.unlockedPositions : []) {
    const node = byPosition.get(position);
    if (!node || node.type === 'glyph' || seen.has(position)) continue;
    seen.add(position);
    ordered.push(position);
  }
  const reachable = reachableFrom(tree.startPosition, effectiveUnlockedSet(ordered), tree);
  return { unlockedPositions: ordered.filter((p) => reachable.has(p)) };
}

/**
 * Preset normalisation defends against dangling references left by deleting
 * a pet/relic out from under a preset that used it (petIds/relicDefIds are
 * this character's already-normalised pet/relic-level sets) - a stale
 * petId/relicId just gets dropped rather than crashing or being kept as a
 * ghost reference.
 */
function normalisePreset(raw, petIds, relicDefIds, sigilDefIds, legacyMountId = null, characterClass = null, presetIndex = 0) {
  const base = newPreset(raw?.name || 'Preset');
  if (raw?.id) base.id = raw.id;
  base.goal = normalisePresetGoal(raw?.goal, characterClass, presetIndex);
  base.loadout = raw?.loadout === 1 ? 1 : 0;
  base.talentSet = raw?.talentSet === 1 ? 1 : 0;
  base.petId = petIds.has(raw?.petId) ? raw.petId : null;
  // Presets saved before mountId existed inherit the old character-wide
  // ridden mount (legacyMountId); an explicit null stays null.
  const rawMountId = raw?.mountId === undefined ? legacyMountId : raw.mountId;
  base.mountId = MOUNT_DEFS.some((def) => def.id === rawMountId) ? rawMountId : null;
  const relicIds = Array.isArray(raw?.relicIds) ? raw.relicIds.filter((id) => relicDefIds.has(id)) : [];
  base.relicIds = [...new Set(relicIds)].slice(0, PRESET_RELIC_CAP);
  const sigilIds = Array.isArray(raw?.sigilIds) ? raw.sigilIds.filter((id) => sigilDefIds.has(id)) : [];
  base.sigilIds = [...new Set(sigilIds)].slice(0, PRESET_SIGIL_CAP);
  base.manualTotals = raw?.manualTotals === true;
  base.manualStats = emptyStats(raw?.manualStats || {});
  const rawBuffs = raw?.fortressBuffs || {};
  const top = rawBuffs.top === true;
  base.fortressBuffs = {
    top,
    // top/bottom stay mutually exclusive even against corrupt/hand-edited saved data.
    bottom: !top && rawBuffs.bottom === true,
    core: rawBuffs.core === true,
  };
  return base;
}

/** The three PVP/Custom factor sliders, kept non-negative and summing to 100. */
function normaliseGoalWeights(raw) {
  const keys = ['damage', 'mitigation', 'survivability'];
  const weights = {};
  let sum = 0;
  for (const key of keys) {
    const v = Number(raw?.[key]);
    weights[key] = Number.isFinite(v) && v > 0 ? v : 0;
    sum += weights[key];
  }
  if (sum <= 0) return { damage: 34, mitigation: 33, survivability: 33 };
  for (const key of keys) weights[key] = (weights[key] / sum) * 100;
  return weights;
}

/**
 * A preset's persisted goal. Unknown kinds fall back to null (= unassigned -
 * the UI prompts, nothing is silently chosen); 'tank' is Warrior-only, so a
 * class change normalises a stale tank goal away (same gating as
 * normaliseDropGoal). `linked` defaults BY POSITION when the field is absent
 * (presets saved before goals existed, and legacy-migrated ones): the first
 * two presets of a character form the linked pair.
 */
export function normalisePresetGoal(g, characterClass, presetIndex = 0) {
  let kind = PRESET_GOAL_KINDS.includes(g?.kind) ? g.kind : null;
  if (kind === 'tank' && characterClass !== 'Warrior') kind = null;
  const rawWeight = Number(g?.ehpWeight);
  const ehpWeight = Number.isFinite(rawWeight) ? Math.min(1, Math.max(0, rawWeight)) : 0.5;
  const linked = g?.linked === undefined ? presetIndex < 2 : g.linked === true;
  return {
    kind,
    name: typeof g?.name === 'string' ? g.name : '',
    ehpWeight,
    weights: normaliseGoalWeights(g?.weights),
    linked,
  };
}

/** Drops allocations pointing at talents/ranks that no longer exist in the (static) tree. */
function normaliseTalentAllocation(raw, spec) {
  const tree = spec ? TALENT_TREES[spec] : null;
  if (!tree || !raw || typeof raw !== 'object') return {};
  const talentById = new Map();
  for (const tier of tree.tiers) {
    for (const t of tier.talents) talentById.set(t.id, t);
  }
  const allocation = {};
  for (const [talentId, rank] of Object.entries(raw)) {
    const talent = talentById.get(talentId);
    if (!talent) continue;
    const clamped = Math.max(0, Math.min(Number(rank) || 0, talent.ranks.length));
    if (clamped > 0) allocation[talentId] = clamped;
  }
  return allocation;
}

function normaliseDrop(d) {
  if (!d || !SLOTS.includes(d.slot)) return null;
  return { slot: d.slot, piece: emptyStats(d.piece || {}) };
}

/**
 * The Drop Check verdict goals; the scoring itself lives in dropGoals.js.
 * 'hps' was removed in the goals redesign (the game has no other-player
 * healing) - stale persisted 'hps' goals coerce to 'dps-fast' below.
 */
export const DROP_GOAL_KINDS = ['dps-fast', 'dps-accurate', 'tank'];

/**
 * Drop Check's persisted verdict goal. Unknown kinds fall back to the DPS
 * default; 'tank' is Warrior-only (same gating as the Simulation screen's
 * Goal toggle), so a class change normalises a stale tank goal away.
 * ehpWeight is always carried (clamped to [0, 1], default 0.5) - it's only
 * meaningful for 'tank' but keeping it preserves the slider position across
 * goal switches.
 */
export function normaliseDropGoal(g, characterClass) {
  let kind = DROP_GOAL_KINDS.includes(g?.kind) ? g.kind : 'dps-fast';
  if (kind === 'tank' && characterClass !== 'Warrior') kind = 'dps-fast';
  const raw = Number(g?.ehpWeight);
  const ehpWeight = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
  return { kind, ehpWeight };
}
