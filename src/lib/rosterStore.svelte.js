/**
 * rosterStore.svelte.js - the single reactive source of truth for the app.
 *
 * Wraps model.js/storage.js/dps.js exactly as built (no signature changes).
 * Every mutator ends with persist() (explicit save-to-localStorage on every
 * mutating action, per the handoff's persistence model) rather than a
 * background $effect, so save timing is deterministic - important right
 * before downloadRoster/character switches.
 */

import { loadRoster, saveRoster, importRoster as parseRosterJson, downloadRoster } from './storage.js';
import { newCharacter, getCurrent, emptyStats } from './model.js';
import { applySwap } from './dps.js';
import { SLOTS } from './constants.js';

function createRosterStore() {
  let roster = $state(loadRoster());
  const current = $derived(getCurrent(roster));

  function persist() {
    saveRoster(roster);
  }

  // --- Characters ---
  function addCharacter(name) {
    const c = newCharacter(name || 'New Character');
    roster.characters.push(c);
    roster.currentId = c.id;
    persist();
    return c.id;
  }

  function renameCharacter(id, name) {
    const c = roster.characters.find((ch) => ch.id === id);
    if (c && name && name.trim()) {
      c.name = name.trim();
      persist();
    }
  }

  function deleteCharacter(id) {
    if (roster.characters.length <= 1) return false; // never delete the last character
    const idx = roster.characters.findIndex((ch) => ch.id === id);
    if (idx === -1) return false;
    roster.characters.splice(idx, 1);
    if (roster.currentId === id) {
      roster.currentId = roster.characters[0].id;
    }
    persist();
    return true;
  }

  function selectCharacter(id) {
    if (roster.characters.some((ch) => ch.id === id)) {
      roster.currentId = id;
      persist();
    }
  }

  // --- Profile totals (Profile Stats tab) ---
  function setProfileField(loadoutIndex, key, value) {
    current.loadouts[loadoutIndex].profileTotals[key] = value;
    persist();
  }

  // --- Gear (Gear Panel tab, Edit mode) ---
  function setGearField(slot, loadoutIndex, key, value) {
    current.loadouts[loadoutIndex].gear[slot][key] = value;
    persist();
  }

  // --- Drop comparison (roster-level, survives character switches) ---
  function startDrop(slot) {
    roster.drop = { slot: slot || SLOTS[0], piece: emptyStats() };
    persist();
  }

  function setDropSlot(slot) {
    if (roster.drop) {
      roster.drop.slot = slot;
      persist();
    }
  }

  function setDropField(key, value) {
    if (roster.drop) {
      roster.drop.piece[key] = value;
      persist();
    }
  }

  function clearDrop() {
    roster.drop = null;
    persist();
  }

  function applyDropToLoadout(loadoutIndex) {
    if (!roster.drop) return;
    const { slot, piece } = roster.drop;
    const loadout = current.loadouts[loadoutIndex];
    loadout.profileTotals = applySwap(loadout.profileTotals, loadout.gear[slot], piece);
    loadout.gear[slot] = piece;
    roster.drop = null;
    persist();
  }

  // --- Export / Import ---
  function importFromJson(jsonText) {
    roster = parseRosterJson(jsonText);
    persist();
  }

  function exportDownload() {
    downloadRoster(roster);
  }

  return {
    get roster() {
      return roster;
    },
    get current() {
      return current;
    },
    addCharacter,
    renameCharacter,
    deleteCharacter,
    selectCharacter,
    setProfileField,
    setGearField,
    startDrop,
    setDropSlot,
    setDropField,
    clearDrop,
    applyDropToLoadout,
    importFromJson,
    exportDownload,
  };
}

export const rosterStore = createRosterStore();
