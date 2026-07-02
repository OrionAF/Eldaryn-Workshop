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
import { SLOTS, SOURCE_DEFS, TALENT_TOTAL_POINTS } from './constants.js';
import { TALENT_TREES } from './talentTreeData.js';
import { AWAKENING_PATHS, AWAKENING_TOTAL_POINTS } from './awakeningData.js';
import { RELICS_BY_CLASS, RELIC_EQUIP_CAP } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { canUnlock, reachableFrom, effectiveUnlockedSet } from './transcendence.js';

const MOUNT_GLYPH_TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'mountGlyphs').tierCaps;

/** Points spent across a tier's own talents, per a loadout's talentAllocation. */
function pointsSpentInTier(tier, talentAllocation) {
  return tier.talents.reduce((sum, t) => sum + (talentAllocation[t.id] || 0), 0);
}

/** Tier 0 is always accessible (matches the screenshot: no lock badge on Tier 1). */
function isTierUnlocked(tree, tierIndex, talentAllocation) {
  if (tierIndex === 0) return true;
  let spent = 0;
  for (let i = 0; i < tierIndex; i++) spent += pointsSpentInTier(tree.tiers[i], talentAllocation);
  return spent >= tree.tiers[tierIndex].threshold;
}

function totalPointsSpent(talentAllocation) {
  return Object.values(talentAllocation || {}).reduce((sum, r) => sum + r, 0);
}

/** Finds {tier, tierIndex, talent} for a talentId within a tree, or null. */
function findTalent(tree, talentId) {
  for (let i = 0; i < (tree?.tiers.length ?? 0); i++) {
    const talent = tree.tiers[i].talents.find((t) => t.id === talentId);
    if (talent) return { tier: tree.tiers[i], tierIndex: i, talent };
  }
  return null;
}

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

  // --- Talents (Character.class; Loadout.spec/talentAllocation; tree content is static, see talentTreeData.js) ---
  function setCharacterClass(id, className) {
    const c = roster.characters.find((ch) => ch.id === id);
    if (!c) return;
    c.class = className;
    // A different class's specs/talent/relic/Transcendence positions are
    // meaningless for this character now (a different class has an entirely
    // different tree - old unlocked positions wouldn't even correspond to
    // the same node types/stats).
    for (const loadout of c.loadouts) {
      loadout.spec = null;
      loadout.talentAllocation = {};
      loadout.relics = { entries: [] };
    }
    c.transcendence = { unlockedPositions: [] };
    persist();
  }

  function setLoadoutSpec(loadoutIndex, spec) {
    const loadout = current.loadouts[loadoutIndex];
    loadout.spec = spec;
    loadout.talentAllocation = {}; // a different tree's talent IDs don't apply
    persist();
  }

  /** Returns false (no-op) if the tier is locked or the 29-point cap would be exceeded. */
  function setTalentRank(loadoutIndex, talentId, rank) {
    const loadout = current.loadouts[loadoutIndex];
    const tree = loadout.spec ? TALENT_TREES[loadout.spec] : null;
    const found = tree ? findTalent(tree, talentId) : null;
    if (!found) return false;
    if (!isTierUnlocked(tree, found.tierIndex, loadout.talentAllocation)) return false;

    const clampedRank = Math.max(0, Math.min(rank, found.talent.ranks.length));
    const currentRank = loadout.talentAllocation[talentId] || 0;
    const delta = clampedRank - currentRank;
    if (totalPointsSpent(loadout.talentAllocation) + delta > TALENT_TOTAL_POINTS) return false;

    if (clampedRank === 0) {
      delete loadout.talentAllocation[talentId];
    } else {
      loadout.talentAllocation[talentId] = clampedRank;
    }
    persist();
    return true;
  }

  function resetTalents(loadoutIndex) {
    current.loadouts[loadoutIndex].talentAllocation = {};
    persist();
  }

  // --- Awakening (Character.awakening - one path/point count shared by both loadouts) ---
  function setAwakeningPath(path) {
    if (path !== null && !(path in AWAKENING_PATHS)) return false;
    current.awakening.path = path;
    current.awakening.points = 0; // a different path's stats don't carry over
    persist();
    return true;
  }

  /** Returns false (no-op) if no path is chosen yet. */
  function setAwakeningPoints(points) {
    if (!current.awakening.path) return false;
    current.awakening.points = Math.max(0, Math.min(points, AWAKENING_TOTAL_POINTS));
    persist();
    return true;
  }

  function resetAwakening() {
    current.awakening.path = null;
    current.awakening.points = 0;
    persist();
  }

  // --- Transcendence (Character.transcendence - one shared unlocked-node set across both loadouts, like Awakening) ---
  /**
   * Returns false (no-op) if unlocking isn't adjacency-valid, or removing a
   * position that isn't unlocked. Nothing is unlocked by default, including
   * the tree's start position - it has no adjacency prerequisite (see
   * canUnlock in transcendence.js), but it's still something the player has
   * to unlock themselves before anything else becomes reachable. Removing
   * it therefore cascades away the entire unlocked set, same as removing any
   * other bridge node that everything else was routed through.
   */
  function setTranscendenceNode(position, unlock) {
    const tree = TRANSCENDENCE_TREES[current.class];
    if (!tree) return false;
    const unlockedPositions = current.transcendence.unlockedPositions;
    if (unlock) {
      if (!canUnlock(position, unlockedPositions, tree)) return false;
      unlockedPositions.push(position);
      persist();
      return true;
    }
    if (!unlockedPositions.includes(position)) return false;
    // Cascade: removing a node also drops every other unlocked node that
    // becomes disconnected from the start as a result (recomputed via BFS
    // over what's left), rather than leaving orphaned nodes stranded or
    // blocking the removal outright.
    const remaining = unlockedPositions.filter((p) => p !== position);
    const reachable = reachableFrom(tree.startPosition, effectiveUnlockedSet(remaining), tree);
    current.transcendence.unlockedPositions = remaining.filter((p) => reachable.has(p));
    persist();
    return true;
  }

  // --- Relics (Loadout.relics - independent per Set A/B, like Talents; static content in relicsData.js) ---
  function findRelicDef(defId) {
    return (RELICS_BY_CLASS[current.class] || []).find((d) => d.id === defId);
  }

  function findOrCreateRelicEntry(loadout, defId) {
    let entry = loadout.relics.entries.find((e) => e.defId === defId);
    if (!entry) {
      entry = { defId, level: 1, equipped: false };
      loadout.relics.entries.push(entry);
    }
    return entry;
  }

  /** Returns false (no-op) if defId isn't a relic for this character's class. */
  function setRelicLevel(loadoutIndex, defId, level) {
    const def = findRelicDef(defId);
    if (!def) return false;
    const loadout = current.loadouts[loadoutIndex];
    const entry = findOrCreateRelicEntry(loadout, defId);
    entry.level = Math.max(1, Math.min(level, def.maxLevel));
    persist();
    return true;
  }

  /** Returns false (no-op) if defId is invalid, or equipping would exceed the 4-relic cap for this loadout. */
  function setRelicEquipped(loadoutIndex, defId, equipped) {
    const def = findRelicDef(defId);
    if (!def) return false;
    const loadout = current.loadouts[loadoutIndex];
    if (equipped) {
      const existing = loadout.relics.entries.find((e) => e.defId === defId);
      const alreadyEquipped = loadout.relics.entries.filter((e) => e.equipped).length;
      if (!(existing && existing.equipped) && alreadyEquipped >= RELIC_EQUIP_CAP) return false;
    }
    const entry = findOrCreateRelicEntry(loadout, defId);
    entry.equipped = equipped;
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
    setCharacterClass,
    setLoadoutSpec,
    setTalentRank,
    resetTalents,
    setAwakeningPath,
    setAwakeningPoints,
    resetAwakening,
    setTranscendenceNode,
    setRelicLevel,
    setRelicEquipped,
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
