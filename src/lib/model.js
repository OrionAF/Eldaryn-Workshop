/**
 * model.js - the typed data model + factories for the optimiser.
 *
 * Roster      = { characters: Character[], currentId }
 * Character   = { id, name, class: 'Warrior'|'Sentinel'|null,
 *                 loadouts: [Loadout, Loadout],           // gear only
 *                 talentSets: [TalentSet, TalentSet],      // Set A / Set B
 *                 pets: PetEntry[],                        // shared collection, no per-pet level
 *                 petLevel: number,                        // ONE level for every pet (character-wide)
 *                 relicLevels: Record<defId, level>,       // character-wide levels
 *                 mounts: { entries, activeId },           // character-wide, one ridden at a time
 *                 glyphs: { entries },                      // character-wide, tier-capped equip (see SOURCE_DEFS)
 *                 stoneInventory: StoneEntry[],             // character-wide shared inventory (like pets)
 *                 awakening: { path, points },              // character-wide
 *                 transcendence: { unlockedPositions },     // character-wide
 *                 presets: Preset[],
 *                 drop: DropState | null }                  // per-character (Preset redesign moved this off Roster)
 * Loadout     = { name, gear: Record<Slot, OffensiveStats>, socketedStones: Record<Slot, stoneId|null> }
 *   socketedStones is just an ID reference into Character.stoneInventory per slot - never a
 *   stat block. Replacing a slot's gear never touches this map, so a socketed stone survives
 *   a gear swap untouched. The SAME stone id may appear in both loadouts at once (one slot
 *   each), but at most once within a single loadout - see rosterStore.socketStone's auto-move.
 * TalentSet   = { spec: specKey|null, allocation: Record<talentId, rank> }
 *   No `name` field - Set A/Set B are fixed labels derived from index (talentSetLabel), not
 *   user-renamable. Tree CONTENT (tiers/talents/values) is static code data in
 *   talentTreeData.js, not part of the persisted Roster.
 * PetEntry    = { id, name, rarity, stats: OffensiveStats }  // no level - see Character.petLevel
 * StoneEntry  = { id, type: 'verdant'|'crimson'|'azure'|'eldaryn'|'mythic', quality: number,
 *                 rolledKeys: string[], stats: OffensiveStats }
 *   quality is display-only (no calc effect, same principle as gear not tracking item level).
 *   rolledKeys records which stat keys are actually on this stone (incl. pvp_attack/
 *   pvp_defense where the type fixes them) - needed because a 0-value stat is otherwise
 *   indistinguishable from "not rolled". Type + rolledKeys are fixed at creation (see
 *   stonesData.js's STONE_TYPES for each type's fixed/free bonus-stat shape); only quality
 *   and each rolled stat's value can be edited afterward. `stats` is the stone's resolved
 *   contribution, accumulated directly into totals.js like gear/pet stats.
 * Preset      = { id, name, loadout: 0|1, talentSet: 0|1, petId: string|null,
 *                 relicIds: string[] (max PRESET_RELIC_CAP),
 *                 sigilIds: string[] (max PRESET_SIGIL_CAP, scaffold - no Sigil content/UI yet),
 *                 manualTotals: boolean, manualStats: OffensiveStats,
 *                 fortressBuffs: { top: boolean, bottom: boolean, core: boolean } }
 *   fortressBuffs: top/bottom are mutually exclusive (setPresetFortressBuff clears the other
 *   when one is turned on); core is independent of both - see FORTRESS_BUFF_STATS in totals.js
 *   for the fixed stat contribution each one adds.
 *   A preset is the unit that ties one gear loadout + one talent set + a pet + up to 4
 *   relics together, with its own totals (manual OR calculated - see totals.js's
 *   computePresetTotals/resolveEffectiveTotals). Mounts, Glyphs, Awakening, and
 *   Transcendence are NOT part of a preset - they're character-wide and shared by
 *   every preset (model.js Character fields above), matching how Awakening/
 *   Transcendence already worked pre-redesign.
 * DropState   = { slot, piece: OffensiveStats }
 *
 * Socketed Stones (docs/socketed-stones-design.md) got real content/UI on the Gear
 * Loadouts screen: a character-wide inventory (Character.stoneInventory) referenced
 * per-slot-per-loadout via Loadout.socketedStones, deliberately separate from gear
 * stats so Drop Check (which only ever reads Loadout.gear) can't be affected by them.
 * Sigils are per-preset (Preset.sigilIds) and remain scaffold-only (no real content/UI
 * yet), same as before the redesign.
 */

import { offensiveStats } from './dps.js';
import { SLOTS, STAT_FIELDS, SOURCE_DEFS, CLASSES, SPECS_BY_CLASS, RARITIES, PRESET_RELIC_CAP, PRESET_SIGIL_CAP } from './constants.js';
import { TALENT_TREES } from './talentTreeData.js';
import { AWAKENING_PATHS, AWAKENING_TOTAL_POINTS } from './awakeningData.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { reachableFrom, effectiveUnlockedSet } from './transcendence.js';
import { stoneTypeDef } from './stonesData.js';

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

// --- Pets (shared collection; level lives on Character.petLevel, not here) ---
export function newPetEntry({ name = 'New Pet', rarity = 'Common', stats = {} } = {}) {
  return { id: newId(), name, rarity, stats: emptyStats(stats) };
}

// --- Mounts ---
export function newMountEntry({ name = 'New Mount', rarity = 'Common', baseHpPct = 0, baseAtkPct = 0 } = {}) {
  return { id: newId(), name, rarity, baseHpPct, baseAtkPct };
}

// --- Mount Glyphs ---
export function newMountGlyphEntry({ tier = 'minor', statKey = 'attack_pct', value = 0, equipped = false } = {}) {
  return { id: newId(), tier, statKey, value, equipped };
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
export function newPreset(name, { loadout = 0, talentSet = 0, manualTotals = false } = {}) {
  return {
    id: newId(),
    name,
    loadout,
    talentSet,
    petId: null,
    relicIds: [],
    sigilIds: [],
    manualTotals,
    manualStats: emptyStats(),
    fortressBuffs: { top: false, bottom: false, core: false },
  };
}

export function newCharacter(name = 'New Character') {
  return {
    id: newId(),
    name,
    class: null, // 'Warrior' | 'Sentinel' | null
    loadouts: [newLoadout('Loadout 1'), newLoadout('Loadout 2')],
    talentSets: [newTalentSet(), newTalentSet()],
    pets: [],
    petLevel: 1,
    relicLevels: {},
    mounts: emptySourceState(findSourceDef('mounts')),
    glyphs: emptySourceState(findSourceDef('glyphs')),
    stoneInventory: [],
    awakening: emptyAwakening(),
    transcendence: emptyTranscendence(),
    // A fresh character has nothing to calculate totals from yet - the seeded
    // preset starts in Manual mode (matches today's onboarding, which starts
    // Profile Stats in Manual mode too). A preset created later via "+ New
    // Preset" starts in Calculated mode instead - see rosterStore.addPreset.
    presets: [newPreset('Preset 1', { manualTotals: true })],
    drop: null,
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
 * its `level` becomes the new character-wide petLevel. Old roster-level drop
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
  const petLevel = Number(activePet?.level) || 1;

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
    petLevel,
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
  base.petLevel = Math.max(1, Number(c?.petLevel) || 1);
  base.relicLevels = normaliseRelicLevels(c?.relicLevels, base.class);

  base.mounts = normaliseMounts(c?.mounts);
  base.glyphs = normaliseGlyphs(c?.glyphs);
  base.awakening = normaliseAwakening(c?.awakening);
  base.transcendence = normaliseTranscendence(c?.transcendence, base.class);

  const petIds = new Set(base.pets.map((p) => p.id));
  const relicDefIds = new Set(Object.keys(base.relicLevels));
  const rawPresets = Array.isArray(c?.presets) ? c.presets : [];
  base.presets = rawPresets.length
    ? rawPresets.map((p) => normalisePreset(p, petIds, relicDefIds))
    : [newPreset('Preset 1', { manualTotals: true })];

  base.drop = normaliseDrop(c?.drop);
  return base;
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

/** Drops malformed entries (missing id, dupes); defends stats shape like gear/stones do. */
function normalisePets(raw) {
  const seen = new Set();
  const pets = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    pets.push({
      id: p.id,
      name: p.name || 'Pet',
      rarity: RARITIES.includes(p.rarity) ? p.rarity : 'Common',
      stats: emptyStats(p.stats || {}),
    });
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

function normaliseMounts(raw) {
  const entries = Array.isArray(raw?.entries) ? raw.entries : [];
  const activeId = entries.some((e) => e?.id === raw?.activeId) ? raw.activeId : null;
  return { entries, activeId };
}

function normaliseGlyphs(raw) {
  return { entries: Array.isArray(raw?.entries) ? raw.entries : [] };
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
function normalisePreset(raw, petIds, relicDefIds) {
  const base = newPreset(raw?.name || 'Preset');
  if (raw?.id) base.id = raw.id;
  base.loadout = raw?.loadout === 1 ? 1 : 0;
  base.talentSet = raw?.talentSet === 1 ? 1 : 0;
  base.petId = petIds.has(raw?.petId) ? raw.petId : null;
  const relicIds = Array.isArray(raw?.relicIds) ? raw.relicIds.filter((id) => relicDefIds.has(id)) : [];
  base.relicIds = [...new Set(relicIds)].slice(0, PRESET_RELIC_CAP);
  const sigilIds = Array.isArray(raw?.sigilIds) ? raw.sigilIds : [];
  base.sigilIds = [...new Set(sigilIds)].slice(0, PRESET_SIGIL_CAP);
  base.manualTotals = raw?.manualTotals !== false;
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
