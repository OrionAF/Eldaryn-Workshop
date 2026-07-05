/**
 * rosterStore.svelte.js - the single reactive source of truth for the app.
 *
 * Wraps model.js/storage.js/dps.js/totals.js exactly as built (no signature
 * changes). Every mutator ends with persist() (explicit save-to-localStorage
 * on every mutating action) rather than a background $effect, so save timing
 * is deterministic - important right before downloadRoster/character
 * switches.
 */

import { loadRoster, saveRoster, importRoster as parseRosterJson, downloadRoster } from './storage.js';
import { newCharacter, getCurrent, emptyStats, newPetEntry, newMountEntry, newMountGlyphEntry, newPreset, newStoneEntry } from './model.js';
import { computePresetTotals } from './totals.js';
import { SLOTS, SOURCE_DEFS, TALENT_TOTAL_POINTS, PRESET_RELIC_CAP } from './constants.js';
import { TALENT_TREES } from './talentTreeData.js';
import { AWAKENING_PATHS, AWAKENING_TOTAL_POINTS } from './awakeningData.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { canUnlock, reachableFrom, effectiveUnlockedSet } from './transcendence.js';

const MOUNT_GLYPH_TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'glyphs').tierCaps;

/** Points spent across a tier's own talents, per a talent set's allocation. */
function pointsSpentInTier(tier, allocation) {
  return tier.talents.reduce((sum, t) => sum + (allocation[t.id] || 0), 0);
}

/** Tier 0 is always accessible (matches the screenshot: no lock badge on Tier 1). */
function isTierUnlocked(tree, tierIndex, allocation) {
  if (tierIndex === 0) return true;
  let spent = 0;
  for (let i = 0; i < tierIndex; i++) spent += pointsSpentInTier(tree.tiers[i], allocation);
  return spent >= tree.tiers[tierIndex].threshold;
}

function totalPointsSpent(allocation) {
  return Object.values(allocation || {}).reduce((sum, r) => sum + r, 0);
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

  /**
   * A different class's specs/talents/relic defs/Transcendence positions are
   * meaningless for this character now (a different class has an entirely
   * different tree - old allocations/levels/unlocked positions wouldn't even
   * correspond to the same node types/stats). Pets are untouched - their
   * stats aren't class-scoped.
   */
  function setCharacterClass(id, className) {
    const c = roster.characters.find((ch) => ch.id === id);
    if (!c) return;
    c.class = className;
    for (const talentSet of c.talentSets) {
      talentSet.spec = null;
      talentSet.allocation = {};
    }
    c.relicLevels = {};
    for (const preset of c.presets) {
      preset.relicIds = [];
    }
    c.transcendence = { unlockedPositions: [] };
    persist();
  }

  // --- Gear (Gear Loadouts screen) ---
  function setGearField(slot, loadoutIndex, key, value) {
    current.loadouts[loadoutIndex].gear[slot][key] = value;
    persist();
  }

  // --- Pets (character-scoped shared collection; a Preset picks which one contributes) ---
  function addPet(name, rarity, stats = {}) {
    const pet = newPetEntry({ name, rarity, stats });
    current.pets.push(pet);
    persist();
    return pet.id;
  }

  function updatePetField(petId, field, value) {
    const pet = current.pets.find((p) => p.id === petId);
    if (pet) {
      pet[field] = value;
      persist();
    }
  }

  function updatePetStat(petId, key, value) {
    const pet = current.pets.find((p) => p.id === petId);
    if (pet) {
      pet.stats[key] = value;
      persist();
    }
  }

  /** Character-wide - every pet levels together, unlike pre-redesign's per-pet level. */
  function setPetLevel(level) {
    current.petLevel = Math.max(1, level);
    persist();
  }

  /** Nulls petId on every preset that used this pet, rather than leaving a dangling reference. */
  function removePet(petId) {
    current.pets = current.pets.filter((p) => p.id !== petId);
    for (const preset of current.presets) {
      if (preset.petId === petId) preset.petId = null;
    }
    persist();
  }

  // --- Mounts (character-scoped, one active/"riding" at a time) ---
  function addMount(name, rarity, baseHpPct = 0, baseAtkPct = 0) {
    const mount = newMountEntry({ name, rarity, baseHpPct, baseAtkPct });
    current.mounts.entries.push(mount);
    if (!current.mounts.activeId) current.mounts.activeId = mount.id;
    persist();
    return mount.id;
  }

  function updateMount(mountId, field, value) {
    const mount = current.mounts.entries.find((m) => m.id === mountId);
    if (mount) {
      mount[field] = value;
      persist();
    }
  }

  function setActiveMount(mountId) {
    current.mounts.activeId = mountId;
    persist();
  }

  function removeMount(mountId) {
    const mounts = current.mounts;
    mounts.entries = mounts.entries.filter((m) => m.id !== mountId);
    if (mounts.activeId === mountId) {
      mounts.activeId = mounts.entries[0]?.id ?? null;
    }
    persist();
  }

  // --- Mount Glyphs (character-scoped inventory; up to 3 Minor/2 Major/1 Mythic equipped) ---
  function addMountGlyph(tier, statKey, value) {
    const glyph = newMountGlyphEntry({ tier, statKey, value });
    current.glyphs.entries.push(glyph);
    persist();
    return glyph.id;
  }

  function removeMountGlyph(glyphId) {
    const glyphs = current.glyphs;
    glyphs.entries = glyphs.entries.filter((g) => g.id !== glyphId);
    persist();
  }

  /** Returns false (no-op) if equipping would exceed that tier's cap. */
  function setGlyphEquipped(glyphId, equipped) {
    const glyphs = current.glyphs.entries;
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

  // --- Socketed Stones (character-scoped shared inventory; socketed per-loadout-per-slot via Loadout.socketedStones) ---
  function addStone({ type, quality, rolledKeys, stats }) {
    const stone = newStoneEntry({ type, quality, rolledKeys, stats });
    current.stoneInventory.push(stone);
    persist();
    return stone.id;
  }

  /** Only quality and each rolled stat's value are editable after creation - type/rolledKeys are locked in (see model.js's StoneEntry comment). */
  function updateStone(stoneId, { quality, stats } = {}) {
    const stone = current.stoneInventory.find((s) => s.id === stoneId);
    if (!stone) return;
    if (quality !== undefined) stone.quality = Math.max(0, quality);
    if (stats) {
      for (const key of stone.rolledKeys) {
        if (key in stats) stone.stats[key] = stats[key];
      }
    }
    persist();
  }

  /** Nulls this stone out of every loadout socket referencing it, rather than leaving a dangling reference. */
  function removeStone(stoneId) {
    current.stoneInventory = current.stoneInventory.filter((s) => s.id !== stoneId);
    for (const loadout of current.loadouts) {
      for (const slot of SLOTS) {
        if (loadout.socketedStones[slot] === stoneId) loadout.socketedStones[slot] = null;
      }
    }
    persist();
  }

  /**
   * Sockets stoneId into loadoutIndex/slot. A stone can only occupy one slot
   * per loadout - if it's already socketed elsewhere in THIS loadout, that
   * slot is silently vacated first (auto-move, like pulling a gem out and
   * re-socketing it elsewhere). The same stone may still be socketed
   * independently in the other loadout at the same time (see model.js).
   */
  function socketStone(loadoutIndex, slot, stoneId) {
    const loadout = current.loadouts[loadoutIndex];
    for (const s of SLOTS) {
      if (loadout.socketedStones[s] === stoneId) loadout.socketedStones[s] = null;
    }
    loadout.socketedStones[slot] = stoneId;
    persist();
  }

  function unsocketStone(loadoutIndex, slot) {
    current.loadouts[loadoutIndex].socketedStones[slot] = null;
    persist();
  }

  // --- Talent Sets (Character.talentSets - Set A/Set B; tree content is static, see talentTreeData.js) ---
  function setTalentSetSpec(talentSetIndex, spec) {
    const talentSet = current.talentSets[talentSetIndex];
    talentSet.spec = spec;
    talentSet.allocation = {}; // a different tree's talent IDs don't apply
    persist();
  }

  /** Returns false (no-op) if the tier is locked or the 29-point cap would be exceeded. */
  function setTalentSetRank(talentSetIndex, talentId, rank) {
    const talentSet = current.talentSets[talentSetIndex];
    const tree = talentSet.spec ? TALENT_TREES[talentSet.spec] : null;
    const found = tree ? findTalent(tree, talentId) : null;
    if (!found) return false;
    if (!isTierUnlocked(tree, found.tierIndex, talentSet.allocation)) return false;

    const clampedRank = Math.max(0, Math.min(rank, found.talent.ranks.length));
    const currentRank = talentSet.allocation[talentId] || 0;
    const delta = clampedRank - currentRank;
    if (totalPointsSpent(talentSet.allocation) + delta > TALENT_TOTAL_POINTS) return false;

    if (clampedRank === 0) {
      delete talentSet.allocation[talentId];
    } else {
      talentSet.allocation[talentId] = clampedRank;
    }
    persist();
    return true;
  }

  function resetTalentSet(talentSetIndex) {
    current.talentSets[talentSetIndex].allocation = {};
    persist();
  }

  // --- Awakening (Character.awakening - one path/point count shared by every preset) ---
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

  // --- Transcendence (Character.transcendence - one shared unlocked-node set, like Awakening) ---
  /**
   * Returns false (no-op) if unlocking isn't adjacency-valid, or removing a
   * position that isn't unlocked. Removing a node cascades away every other
   * unlocked node that becomes disconnected from the start as a result.
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
    const remaining = unlockedPositions.filter((p) => p !== position);
    const reachable = reachableFrom(tree.startPosition, effectiveUnlockedSet(remaining), tree);
    current.transcendence.unlockedPositions = remaining.filter((p) => reachable.has(p));
    persist();
    return true;
  }

  // --- Relics (character-wide levels; equipped per-preset, up to PRESET_RELIC_CAP) ---
  function findRelicDef(defId) {
    return (RELICS_BY_CLASS[current.class] || []).find((d) => d.id === defId);
  }

  /** Returns false (no-op) if defId isn't a relic for this character's class. */
  function setRelicLevel(defId, level) {
    const def = findRelicDef(defId);
    if (!def) return false;
    current.relicLevels[defId] = Math.max(0, Math.min(level, def.maxLevel));
    persist();
    return true;
  }

  /** Returns false (no-op) if defId is invalid, or equipping would exceed the per-preset relic cap. */
  function toggleRelicOnPreset(presetId, defId, equipped) {
    const def = findRelicDef(defId);
    if (!def) return false;
    const preset = current.presets.find((p) => p.id === presetId);
    if (!preset) return false;
    if (equipped) {
      if (preset.relicIds.includes(defId)) return true;
      if (preset.relicIds.length >= PRESET_RELIC_CAP) return false;
      preset.relicIds.push(defId);
      if (!(defId in current.relicLevels)) current.relicLevels[defId] = 1;
    } else {
      preset.relicIds = preset.relicIds.filter((id) => id !== defId);
    }
    persist();
    return true;
  }

  // --- Presets (Character.presets - the unit a Drop Check verdict/preset editor operates on) ---
  function addPreset(name) {
    const preset = newPreset(name || `Preset ${current.presets.length + 1}`);
    // Unlike a freshly seeded character's first preset (Manual - nothing to
    // calculate from yet), a preset added later starts Calculated: the
    // character already has loadouts/talents/relics worth calculating from.
    preset.manualTotals = false;
    current.presets.push(preset);
    persist();
    return preset.id;
  }

  function renamePreset(presetId, name) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (preset && name && name.trim()) {
      preset.name = name.trim();
      persist();
    }
  }

  /** Returns false (no-op) if this is the last remaining preset. */
  function deletePreset(presetId) {
    if (current.presets.length <= 1) return false;
    const idx = current.presets.findIndex((p) => p.id === presetId);
    if (idx === -1) return false;
    current.presets.splice(idx, 1);
    persist();
    return true;
  }

  function setPresetLoadout(presetId, loadoutIndex) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (preset) {
      preset.loadout = loadoutIndex;
      persist();
    }
  }

  function setPresetTalentSet(presetId, talentSetIndex) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (preset) {
      preset.talentSet = talentSetIndex;
      persist();
    }
  }

  function setPresetPet(presetId, petId) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (preset) {
      preset.petId = petId;
      persist();
    }
  }

  /** Switching TO manual snapshots the preset's current calculated totals first, so Manual mode starts from real numbers, not zeros. */
  function setPresetTotalsMode(presetId, mode) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (!preset) return;
    const manual = mode === 'manual';
    if (manual && !preset.manualTotals) {
      preset.manualStats = computePresetTotals(current, preset);
    }
    preset.manualTotals = manual;
    persist();
  }

  function setPresetManualStat(presetId, key, value) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (preset) {
      preset.manualStats[key] = value;
      persist();
    }
  }

  // --- Drop comparison (character-scoped, survives screen switches, resets on character switch) ---
  function startDrop(slot) {
    current.drop = { slot: slot || SLOTS[0], piece: emptyStats() };
    persist();
  }

  function setDropSlot(slot) {
    if (current.drop) {
      current.drop.slot = slot;
      persist();
    }
  }

  function setDropField(key, value) {
    if (current.drop) {
      current.drop.piece[key] = value;
      persist();
    }
  }

  function clearDrop() {
    current.drop = null;
    persist();
  }

  /**
   * The gear slot always updates - every Calculated-mode preset referencing
   * this loadout re-derives from it automatically (it reads the loadout
   * live). Manual-mode presets are deliberately NOT touched: manualStats is
   * an explicit, player-owned value, not something silently overwritten by
   * a gear change on a loadout it happens to reference (switching that
   * preset to Calculated and back re-snapshots it, if that's what's wanted).
   */
  function applyDropToLoadout(loadoutIndex) {
    if (!current.drop) return;
    const { slot, piece } = current.drop;
    current.loadouts[loadoutIndex].gear[slot] = piece;
    current.drop = null;
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
    setCharacterClass,
    setGearField,
    addPet,
    updatePetField,
    updatePetStat,
    setPetLevel,
    removePet,
    addMount,
    updateMount,
    setActiveMount,
    removeMount,
    addMountGlyph,
    removeMountGlyph,
    setGlyphEquipped,
    addStone,
    updateStone,
    removeStone,
    socketStone,
    unsocketStone,
    setTalentSetSpec,
    setTalentSetRank,
    resetTalentSet,
    setAwakeningPath,
    setAwakeningPoints,
    resetAwakening,
    setTranscendenceNode,
    setRelicLevel,
    toggleRelicOnPreset,
    addPreset,
    renamePreset,
    deletePreset,
    setPresetLoadout,
    setPresetTalentSet,
    setPresetPet,
    setPresetTotalsMode,
    setPresetManualStat,
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
