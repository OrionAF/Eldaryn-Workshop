/**
 * model.js - the typed data model + factories for the optimiser.
 *
 * Roster      = { characters: Character[], currentId, drop: DropState | null }
 * Character   = { id, name, loadouts: [Loadout, Loadout], sources: SourceState }
 * Loadout     = { name, profileTotals: OffensiveStats, manualTotals: bool,
 *                 gear: Record<Slot, OffensiveStats>,
 *                 stones: Record<Slot, OffensiveStats> }   // stones = per-set
 * SourceState = one entry per SOURCE_DEFS[].key, shape per its `selection`:
 *   'all'/'tiered' -> { entries: [] }        (Talents; Mount Glyphs/Sigils/Relics)
 *   'single'       -> { entries: [], activeId: string|null }  (Awakening, Transcendence, Pets, Mounts)
 * Only pets/mounts/mountGlyphs have real entry shapes so far (Phase 1) - see
 * PET_ENTRY/MOUNT_ENTRY/MOUNT_GLYPH_ENTRY factories below. The rest stay an
 * empty scaffold (SOURCE_DEFS, Phase 1 plan's "Deferred sources").
 * DropState   = { slot, piece: OffensiveStats }  // persists across char switches
 *
 * Phase 0: profileTotals are a manual input. Phase 1 adds `manualTotals` as a
 * live toggle (was hardcoded true) - see totals.js for the "Calculated" sum.
 */

import { offensiveStats } from './dps.js';
import { SLOTS, SOURCE_DEFS } from './constants.js';

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

/** The correctly-shaped empty state for one SOURCE_DEFS entry. */
function emptySourceState(def) {
  return def.selection === 'single' ? { entries: [], activeId: null } : { entries: [] };
}

/** Empty source state for every character-scoped source (SOURCE_DEFS). */
export function emptySources() {
  const s = {};
  for (const def of SOURCE_DEFS) {
    if (def.scope === 'character') s[def.key] = emptySourceState(def);
  }
  return s;
}

// --- Pets ---
export function newPetEntry({ name = 'New Pet', rarity = 'Common', level = 1, stats = {} } = {}) {
  return { id: newId(), name, rarity, level, stats: emptyStats(stats) };
}

// --- Mounts ---
export function newMountEntry({ name = 'New Mount', rarity = 'Common', baseHpPct = 0, baseAtkPct = 0 } = {}) {
  return { id: newId(), name, rarity, baseHpPct, baseAtkPct };
}

// --- Mount Glyphs ---
export function newMountGlyphEntry({ tier = 'minor', statKey = 'attack_pct', value = 0, equipped = false } = {}) {
  return { id: newId(), tier, statKey, value, equipped };
}

export function newLoadout(name) {
  return {
    name,
    profileTotals: emptyStats(),
    manualTotals: true, // Phase 0: totals typed directly
    gear: emptyGear(),
    stones: emptyGear(), // enchant stones, per-set (handoff 8.8) - SCAFFOLD
  };
}

export function newCharacter(name = 'New Character') {
  return {
    id: newId(),
    name,
    loadouts: [newLoadout('Loadout 1'), newLoadout('Loadout 2')],
    sources: emptySources(),
  };
}

export function newRoster() {
  const c = newCharacter('Character 1');
  return { characters: [c], currentId: c.id, drop: null };
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
    return newRoster();
  }
  const characters = raw.characters.map((c) => normaliseCharacter(c));
  const currentId = characters.some((c) => c.id === raw.currentId)
    ? raw.currentId
    : characters[0].id;
  const drop = normaliseDrop(raw.drop);
  return { characters, currentId, drop };
}

function normaliseCharacter(c) {
  const base = newCharacter(c?.name || 'Character');
  if (c?.id) base.id = c.id;
  const loadouts = Array.isArray(c?.loadouts) ? c.loadouts : [];
  base.loadouts = [normaliseLoadout(loadouts[0], 'Loadout 1'), normaliseLoadout(loadouts[1], 'Loadout 2')];
  base.sources = normaliseSources(c?.sources);
  return base;
}

/**
 * Deep-normalise source state per SOURCE_DEFS (not a shallow spread): a raw
 * import/reload might predate a source existing at all (emptySources()
 * fills it in), predate `activeId` on a 'single' source (Phase 0's pets/
 * mounts scaffold had no activeId), or carry a malformed entries array.
 */
function normaliseSources(raw) {
  const s = {};
  for (const def of SOURCE_DEFS) {
    if (def.scope !== 'character') continue;
    const empty = emptySourceState(def);
    const rawState = raw?.[def.key];
    let entries = Array.isArray(rawState?.entries) ? rawState.entries : [];
    if (def.key === 'pets') {
      // Pets are the only source with an embedded OffensiveStats sub-object
      // this pass - defend against a malformed import the way gear/stones already do.
      entries = entries.map((e) => ({ ...e, stats: emptyStats(e?.stats || {}) }));
    }
    if (def.selection === 'single') {
      const activeId = entries.some((e) => e?.id === rawState?.activeId) ? rawState.activeId : null;
      s[def.key] = { entries, activeId };
    } else {
      s[def.key] = { ...empty, entries };
    }
  }
  return s;
}

function normaliseLoadout(l, fallbackName) {
  const base = newLoadout(l?.name || fallbackName);
  base.profileTotals = emptyStats(l?.profileTotals || {});
  base.manualTotals = l?.manualTotals !== false;
  for (const slot of SLOTS) {
    base.gear[slot] = emptyStats(l?.gear?.[slot] || {});
    base.stones[slot] = emptyStats(l?.stones?.[slot] || {});
  }
  return base;
}

function normaliseDrop(d) {
  if (!d || !SLOTS.includes(d.slot)) return null;
  return { slot: d.slot, piece: emptyStats(d.piece || {}) };
}
