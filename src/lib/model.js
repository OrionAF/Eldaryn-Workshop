/**
 * model.js - the typed data model + factories for the optimiser.
 *
 * Roster      = { characters: Character[], currentId, drop: DropState | null }
 * Character   = { id, name, loadouts: [Loadout, Loadout], sources: SourceState }
 * Loadout     = { name, profileTotals: OffensiveStats, manualTotals: bool,
 *                 gear: Record<Slot, OffensiveStats>,
 *                 stones: Record<Slot, OffensiveStats> }   // stones = per-set
 * SourceState = { talents, awakening, pets, mounts, sigils, relics }  // SCAFFOLD
 * DropState   = { slot, piece: OffensiveStats }  // persists across char switches
 *
 * Phase 0: profileTotals are a manual input. `manualTotals` leaves room for the
 * Phase 1 "totals = base + sum(sources)" derivation (handoff 11).
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

/** SCAFFOLD: empty source state. Shape only - no values entered in Phase 0. */
export function emptySources() {
  const s = {};
  for (const def of SOURCE_DEFS) {
    if (def.scope === 'character') s[def.key] = { entries: [] };
  }
  return s;
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
  base.sources = { ...emptySources(), ...(c?.sources || {}) };
  return base;
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
