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
import { newCharacter, getCurrent, emptyStats, newPetEntry, newMountEntry, newMountGlyphEntry } from './model.js';
import { applySwap } from './dps.js';
import { SLOTS, SOURCE_DEFS } from './constants.js';

const MOUNT_GLYPH_TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'mountGlyphs').tierCaps;

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

  // --- Profile Stats: Manual / Calculated totals mode ---
  function setLoadoutTotalsMode(loadoutIndex, mode) {
    current.loadouts[loadoutIndex].manualTotals = mode === 'manual';
    persist();
  }

  // --- Pets (character-scoped, one active at a time) ---
  function addPet(name, rarity, level) {
    const pet = newPetEntry({ name, rarity, level });
    current.sources.pets.entries.push(pet);
    if (!current.sources.pets.activeId) current.sources.pets.activeId = pet.id;
    persist();
    return pet.id;
  }

  function updatePetField(petId, field, value) {
    const pet = current.sources.pets.entries.find((p) => p.id === petId);
    if (pet) {
      pet[field] = value;
      persist();
    }
  }

  function updatePetStat(petId, key, value) {
    const pet = current.sources.pets.entries.find((p) => p.id === petId);
    if (pet) {
      pet.stats[key] = value;
      persist();
    }
  }

  function setActivePet(petId) {
    current.sources.pets.activeId = petId;
    persist();
  }

  function removePet(petId) {
    const pets = current.sources.pets;
    pets.entries = pets.entries.filter((p) => p.id !== petId);
    if (pets.activeId === petId) {
      pets.activeId = pets.entries[0]?.id ?? null;
    }
    persist();
  }

  // --- Mounts (character-scoped, one active/"riding" at a time) ---
  function addMount(name, rarity) {
    const mount = newMountEntry({ name, rarity });
    current.sources.mounts.entries.push(mount);
    if (!current.sources.mounts.activeId) current.sources.mounts.activeId = mount.id;
    persist();
    return mount.id;
  }

  function updateMount(mountId, field, value) {
    const mount = current.sources.mounts.entries.find((m) => m.id === mountId);
    if (mount) {
      mount[field] = value;
      persist();
    }
  }

  function setActiveMount(mountId) {
    current.sources.mounts.activeId = mountId;
    persist();
  }

  function removeMount(mountId) {
    const mounts = current.sources.mounts;
    mounts.entries = mounts.entries.filter((m) => m.id !== mountId);
    if (mounts.activeId === mountId) {
      mounts.activeId = mounts.entries[0]?.id ?? null;
    }
    persist();
  }

  // --- Mount Glyphs (character-scoped inventory; up to 3 Minor/2 Major/1 Mythic equipped) ---
  function addMountGlyph(tier, statKey, value) {
    const glyph = newMountGlyphEntry({ tier, statKey, value });
    current.sources.mountGlyphs.entries.push(glyph);
    persist();
    return glyph.id;
  }

  function removeMountGlyph(glyphId) {
    const glyphs = current.sources.mountGlyphs;
    glyphs.entries = glyphs.entries.filter((g) => g.id !== glyphId);
    persist();
  }

  /** Returns false (no-op) if equipping would exceed that tier's cap. */
  function setGlyphEquipped(glyphId, equipped) {
    const glyphs = current.sources.mountGlyphs.entries;
    const glyph = glyphs.find((g) => g.id === glyphId);
    if (!glyph) return false;
    if (equipped && !glyph.equipped) {
      const cap = MOUNT_GLYPH_TIER_CAPS[glyph.tier];
      const equippedInTier = glyphs.filter((g) => g.tier === glyph.tier && g.equipped).length;
      if (equippedInTier >= cap) return false;
    }
    glyph.equipped = equipped;
    persist();
    return true;
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
    // In Calculated mode, profileTotals is inert manual data the user isn't
    // looking at - only touch it in Manual mode, or it'd silently store a
    // stale swap result that resurfaces as a surprise if they switch back.
    // The gear slot always updates either way (Calculated re-derives from it).
    if (loadout.manualTotals) {
      loadout.profileTotals = applySwap(loadout.profileTotals, loadout.gear[slot], piece);
    }
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
    setLoadoutTotalsMode,
    addPet,
    updatePetField,
    updatePetStat,
    setActivePet,
    removePet,
    addMount,
    updateMount,
    setActiveMount,
    removeMount,
    addMountGlyph,
    removeMountGlyph,
    setGlyphEquipped,
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
