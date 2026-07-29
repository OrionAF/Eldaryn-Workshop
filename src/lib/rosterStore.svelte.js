/**
 * rosterStore.svelte.js - the single reactive store (Svelte 5 runes) wrapping
 * model / storage / totals.
 *
 * THE ONE RULE HERE: every mutator ends with an explicit persist(), never a
 * background $effect. Save timing is therefore deterministic, which matters
 * immediately before downloadRoster() and around character switches - an
 * effect-based save can lag the action that triggered it and drop the last
 * edit. Adding a mutator without a persist() call is the bug this comment
 * exists to prevent.
 *
 * The SHAPE this mutates, the three scopes (character-wide / per-preset /
 * per-mount), and the constraints enforced below - two-preset minimum, altar
 * tier wiping the collection, star 0 meaning not-owned - are documented in
 * docs/Reference/data-model.md §2-§3. The per-function comments below give
 * the caller contract (what returns false, what cascades); they do not
 * restate the game rules.
 */

import { loadRoster, saveRoster, importRoster as parseRosterJson, downloadRoster } from './storage.js';
import { newCharacter, getCurrent, emptyStats, newPetEntry, newMountGlyphEntry, newPreset, newStoneEntry, emptySigilValues, newOpponent, newRunEntry, compactRunHistory, enforceRunHistoryBudget, normaliseDropGoal, normalisePresetGoal } from './model.js';
import { computePresetTotals, resolveEffectiveTotals } from './totals.js';
import { SLOTS, SOURCE_DEFS, TALENT_TOTAL_POINTS, PRESET_RELIC_CAP, PRESET_SIGIL_CAP, STAT_FIELDS, CLASSES, RARITIES } from './constants.js';
import { resolveGlyphId } from './glyphsData.js';
import { companionById, COMPANION_MAX_TIER, COMPANION_MAX_LEVEL, petSecondarySlots, secondaryRange, clampSecondaryValue } from './petsData.js';
import { mountById, mountStarLevels, mountStarRange } from './mountsData.js';
import { TALENT_TREES } from './talentTreeData.js';
import { AWAKENING_PATHS, AWAKENING_TOTAL_POINTS } from './awakeningData.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { SIGILS_BY_CLASS, SIGIL_MAX_LEVEL, SIGIL_MAX_TIER } from './sigilsData.js';
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
    c.sigilValues = {};
    for (const preset of c.presets) {
      preset.relicIds = [];
      preset.sigilIds = [];
    }
    c.transcendence = { unlockedPositions: [] };
    c.dropGoal = normaliseDropGoal(c.dropGoal, className); // clears a Warrior-only tank goal
    // Same Warrior-only gating for preset goals: a stale tank goal unassigns.
    c.presets.forEach((preset, i) => {
      preset.goal = normalisePresetGoal(preset.goal, className, i);
    });
    persist();
  }

  // --- Gear (Gear Loadouts screen) ---
  function setGearField(slot, loadoutIndex, key, value) {
    current.loadouts[loadoutIndex].gear[slot][key] = value;
    persist();
  }

  // --- Pets: character-wide shared collection, a Preset picks which one
  // contributes. The catalogue-vs-custom split (companionId) is
  // data-model.md §1; the altar levels the whole collection at once. ---
  function addPet(opts = {}) {
    const pet = newPetEntry(opts);
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

  /**
   * Point a pet at a catalogue companion (or null for a custom pet). The
   * companion decides the pet's rarity, so switching may shrink the number of
   * secondary slots - excess rolls are trimmed rather than silently kept.
   */
  function setPetCompanion(petId, companionId) {
    const pet = current.pets.find((p) => p.id === petId);
    if (!pet) return;
    const def = companionById(companionId);
    pet.companionId = def ? def.id : null;
    if (def) {
      if (!pet.name || pet.name === 'New Pet' || pet.name === 'Pet') pet.name = def.name;
      pet.rarity = def.rarity;
      const slots = petSecondarySlots(def.rarity);
      if (pet.secondaries.length > slots) pet.secondaries = pet.secondaries.slice(0, slots);
    }
    persist();
  }

  /**
   * Raise/lower the Pet Altar LEVEL. Every pet levels with the altar, so this
   * is one character-wide number - no per-pet level exists.
   */
  function setPetAltarLevel(level) {
    const n = Math.round(Number(level)) || 1;
    current.petAltar.level = Math.max(1, Math.min(n, COMPANION_MAX_LEVEL));
    persist();
  }

  /**
   * Change the Pet Altar TIER. **DESTRUCTIVE - wipes the pet collection**
   * (data-model.md §3: that is the game's behaviour, not our choice).
   * Callers MUST confirm with the user first; the Pets screen uses a two-step
   * button. Returns the number of pets removed so the UI can report it.
   */
  function setPetAltarTier(tier) {
    const n = Math.round(Number(tier)) || 1;
    const next = Math.max(1, Math.min(n, COMPANION_MAX_TIER));
    if (next === current.petAltar.tier) return 0;
    const removed = current.pets.length;
    current.petAltar.tier = next;
    current.pets = [];
    // Same dangling-reference rule as removePet: no preset may point at a pet
    // that no longer exists.
    for (const preset of current.presets) preset.petId = null;
    persist();
    return removed;
  }

  /**
   * Choose (or clear) the secondary stat in a slot. `index` may equal the
   * current length to append a new slot (up to the rarity's slot count).
   * Passing a falsy statKey removes that slot. Duplicate stats are rejected.
   */
  function setPetSecondaryKey(petId, index, statKey) {
    const pet = current.pets.find((p) => p.id === petId);
    if (!pet || !pet.companionId) return;
    const arr = pet.secondaries.slice();
    if (!statKey) {
      if (index >= 0 && index < arr.length) arr.splice(index, 1);
    } else {
      const range = secondaryRange(statKey);
      if (!range) return;
      if (arr.some((e, i) => i !== index && e.statKey === statKey)) return;
      if (index < arr.length) {
        arr[index] = { statKey, value: clampSecondaryValue(statKey, arr[index].value) };
      } else if (arr.length < petSecondarySlots(pet.rarity)) {
        arr.push({ statKey, value: range.min });
      } else {
        return;
      }
    }
    pet.secondaries = arr;
    persist();
  }

  /** Set the rolled value of a pet's secondary slot (clamped to its stat's range/step). */
  function setPetSecondaryValue(petId, index, value) {
    const pet = current.pets.find((p) => p.id === petId);
    if (!pet || !pet.companionId) return;
    const entry = pet.secondaries[index];
    if (!entry) return;
    entry.value = clampSecondaryValue(entry.statKey, value);
    persist();
  }

  /** Set a custom (non-catalogue) pet's manually-entered stat value. */
  function updatePetStat(petId, key, value) {
    const pet = current.pets.find((p) => p.id === petId);
    if (pet && !pet.companionId) {
      pet.stats[key] = value;
      persist();
    }
  }


  /** Nulls petId on every preset that used this pet, rather than leaving a dangling reference. */
  function removePet(petId) {
    current.pets = current.pets.filter((p) => p.id !== petId);
    for (const preset of current.presets) {
      if (preset.petId === petId) preset.petId = null;
    }
    persist();
  }

  // --- Mounts (fixed catalogue - see mountsData.js; the entry list itself is
  // static; the star level and the two rolled HP%/ATK% values are entered here,
  // bounded to the star's observed range - which mount is ridden is a
  // per-preset choice, see setPresetMount) ---

  /**
   * Set a mount's star level, re-clamping its HP%/ATK% into the new star's
   * range. **Star 0 = not owned** (data-model.md §3), so this is also how a
   * mount is un-owned. Rolls clamp into the new star's range rather than
   * resetting, so raising a star keeps a good roll.
   */
  function setMountStar(mountId, star) {
    const mount = current.mounts.entries.find((m) => m.id === mountId);
    if (!mount) return;
    const def = mountById(mountId);
    const s = Number(star);
    if (s !== 0 && !mountStarLevels(def).includes(s)) return;
    mount.star = s;
    const range = mountStarRange(def, s || mountStarLevels(def)[0]);
    if (range) {
      mount.hpPct = Math.max(range.hp[0], Math.min(mount.hpPct, range.hp[1]));
      mount.atkPct = Math.max(range.atk[0], Math.min(mount.atkPct, range.atk[1]));
    }
    persist();
  }

  /** Set a mount's rolled 'hpPct' or 'atkPct' value, clamped to its star's range. */
  function setMountValue(mountId, field, value) {
    const mount = current.mounts.entries.find((m) => m.id === mountId);
    if (!mount) return;
    const rangeKey = field === 'hpPct' ? 'hp' : field === 'atkPct' ? 'atk' : null;
    if (!rangeKey) return;
    const def = mountById(mountId);
    const range = mountStarRange(def, mount.star || mountStarLevels(def)[0]);
    const n = Math.round(Number(value));
    const safe = Number.isFinite(n) ? n : (range ? range[rangeKey][0] : 0);
    mount[field] = range ? Math.max(range[rangeKey][0], Math.min(safe, range[rangeKey][1])) : Math.max(0, safe);
    persist();
  }

  // --- Mount Glyphs: character-wide INVENTORY, equipped PER MOUNT. The third
  // scope, neither character-wide nor per-preset - see data-model.md §2. ---
  function addMountGlyph(tier, statKey, value, { rarity = 'Common', special = null } = {}) {
    const glyph = newMountGlyphEntry({ tier, rarity, statKey, value, special });
    current.glyphs.entries.push(glyph);
    persist();
    return glyph.id;
  }

  /** Removes a glyph from the inventory AND from every mount carrying it. */
  function removeMountGlyph(glyphId) {
    const glyphs = current.glyphs;
    glyphs.entries = glyphs.entries.filter((g) => g.id !== glyphId);
    for (const mount of current.mounts.entries) {
      if (mount.glyphIds.includes(glyphId)) {
        mount.glyphIds = mount.glyphIds.filter((id) => id !== glyphId);
      }
    }
    persist();
  }

  /**
   * Equip/unequip one glyph on ONE mount. Returns false (no-op) when the
   * mount's slots for that tier are already full - the cap is per mount, so a
   * glyph already on three other mounts doesn't count against this one.
   */
  function setMountGlyph(mountId, glyphId, equipped) {
    const mount = current.mounts.entries.find((m) => m.id === mountId);
    const glyph = current.glyphs.entries.find((g) => g.id === glyphId);
    if (!mount || !glyph) return false;
    const has = mount.glyphIds.includes(glyphId);
    if (equipped) {
      if (has) return true;
      const cap = MOUNT_GLYPH_TIER_CAPS[glyph.tier] ?? 0;
      const byId = new Map(current.glyphs.entries.map((g) => [g.id, g]));
      const inTier = mount.glyphIds.filter((id) => byId.get(id)?.tier === glyph.tier).length;
      if (inTier >= cap) return false;
      mount.glyphIds = [...mount.glyphIds, glyphId];
    } else {
      if (!has) return true;
      mount.glyphIds = mount.glyphIds.filter((id) => id !== glyphId);
    }
    persist();
    return true;
  }

  /** Every mount currently carrying this glyph (drives the "Equipped in..." popover). */
  function mountsWithGlyph(glyphId) {
    return current.mounts.entries.filter((m) => m.glyphIds.includes(glyphId));
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

  // --- Sigils (static per-class catalogue; VALUES are character-wide, equip is per-preset up to PRESET_SIGIL_CAP) ---
  function findSigilDef(sigilId) {
    return (SIGILS_BY_CLASS[current.class] || []).find((d) => d.id === sigilId);
  }

  /** The character's SigilValues entry for sigilId, created (and persisted lazily by the caller) on first edit. */
  function sigilValuesEntry(def) {
    if (!current.sigilValues[def.id]) current.sigilValues[def.id] = emptySigilValues(def);
    return current.sigilValues[def.id];
  }

  /** Set a sigil's in-game level (drives its derived Attack/Health and effect magnitudes). Returns false if the sigil doesn't exist for this class. */
  function setSigilLevel(sigilId, value) {
    const def = findSigilDef(sigilId);
    if (!def) return false;
    const entry = sigilValuesEntry(def);
    const n = Math.round(Number(value)) || 0;
    entry.level = Math.max(0, Math.min(n, SIGIL_MAX_LEVEL)); // 0 = not owned
    persist();
    return true;
  }

  /**
   * Set the character-wide Sigil Forge tier. The Forge tiers every sigil at
   * once, so this is one number rather than a per-sigil field - raising it
   * also unlocks Legendary/Ancient sigils, which don't exist below tier 2.
   */
  function setSigilForgeTier(value) {
    const n = Math.round(Number(value)) || 0;
    current.sigilForgeTier = Math.max(1, Math.min(n || 1, SIGIL_MAX_TIER));
    persist();
    return true;
  }

  /** Set one entered stat value on a sigil's passive or active. Returns false (no-op) if the sigil or statKey doesn't exist for this class. */
  function setSigilStatValue(sigilId, effectType, statKey, value) {
    const def = findSigilDef(sigilId);
    const declared = def?.[effectType]?.stats?.some((s) => s.statKey === statKey);
    if (!declared) return false;
    sigilValuesEntry(def)[effectType][statKey] = Number(value) || 0;
    persist();
    return true;
  }

  /** Set a sigil's entered activation damage ('damage'), per-tick damage ('tickDamage'), or enemy HP-Regen debuff % ('regenDebuffPct', clamped 0-100). */
  function setSigilDamageValue(sigilId, field, value) {
    const def = findSigilDef(sigilId);
    if (!def) return false;
    if (field === 'damage' || field === 'tickDamage') {
      sigilValuesEntry(def)[field] = Math.max(0, Number(value) || 0);
    } else if (field === 'regenDebuffPct') {
      sigilValuesEntry(def)[field] = Math.min(100, Math.max(0, Number(value) || 0));
    } else {
      return false;
    }
    persist();
    return true;
  }

  /** Returns false (no-op) if sigilId isn't a sigil for this character's class, or equipping would exceed the per-preset sigil cap. */
  function toggleSigilOnPreset(presetId, sigilId, equipped) {
    const def = findSigilDef(sigilId);
    if (!def) return false;
    const preset = current.presets.find((p) => p.id === presetId);
    if (!preset) return false;
    if (equipped) {
      if (preset.sigilIds.includes(sigilId)) return true;
      if (preset.sigilIds.length >= PRESET_SIGIL_CAP) return false;
      preset.sigilIds.push(sigilId);
    } else {
      preset.sigilIds = preset.sigilIds.filter((id) => id !== sigilId);
    }
    persist();
    return true;
  }

  // --- PVP Opponents (character-wide manually-entered enemy profiles; see model.js's Opponent shape) ---
  function findOpponent(opponentId) {
    return (current.pvpOpponents || []).find((o) => o.id === opponentId);
  }

  function addOpponent(name) {
    const opponent = newOpponent(name || `Opponent ${(current.pvpOpponents?.length || 0) + 1}`);
    current.pvpOpponents.push(opponent);
    persist();
    return opponent.id;
  }

  function deleteOpponent(opponentId) {
    current.pvpOpponents = (current.pvpOpponents || []).filter((o) => o.id !== opponentId);
    persist();
  }

  function duplicateOpponent(opponentId) {
    const source = findOpponent(opponentId);
    if (!source) return null;
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = newOpponent().id; // fresh id, everything else verbatim
    copy.name = `${source.name} (copy)`;
    current.pvpOpponents.push(copy);
    persist();
    return copy.id;
  }

  /**
   * Snapshot one of THIS character's presets as an opponent profile - a
   * mirror-match sparring partner, or a way to carry a build to another
   * character's opponent list via export. Stats are the preset's effective
   * totals (manual or calculated, same as the Run Duel button); equipped
   * sigils and their entered values come along, glyphs stay empty (enter the
   * enemy's separately).
   */
  function addOpponentFromPreset(presetId) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (!preset || !current.class) return null;
    const opponent = newOpponent(`${current.name} · ${preset.name}`);
    opponent.class = current.class;
    opponent.stats = emptyStats(resolveEffectiveTotals(current, preset));
    opponent.sigilIds = [...(preset.sigilIds || [])];
    opponent.sigilValues = JSON.parse(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(current.sigilValues || {}).filter(([defId]) => opponent.sigilIds.includes(defId))
        )
      )
    );
    current.pvpOpponents.push(opponent);
    persist();
    return opponent.id;
  }

  function toggleOpponentSpecialGlyph(opponentId, glyphId, equipped) {
    const opponent = findOpponent(opponentId);
    // Accept a legacy id but persist the canonical one, so saved state never
    // carries an id the catalogue no longer knows.
    const id = resolveGlyphId(glyphId);
    if (!opponent || !id) return false;
    const has = (opponent.specialGlyphIds || []).includes(id);
    if (equipped && !has) opponent.specialGlyphIds = [...(opponent.specialGlyphIds || []), id];
    else if (!equipped && has) opponent.specialGlyphIds = opponent.specialGlyphIds.filter((g) => g !== id);
    persist();
    return true;
  }

  function renameOpponent(opponentId, name) {
    const opponent = findOpponent(opponentId);
    if (!opponent || !name?.trim()) return false;
    opponent.name = name.trim();
    persist();
    return true;
  }

  // --- Run history (auto-saved runs, Simulations Dashboard; see model.js's newRunEntry) ---
  function addRunHistoryEntry(kind, fields = {}) {
    // Snapshot through JSON so the stored entry can never share references
    // with live view-state (payloads are plain numbers/strings by contract).
    const entry = newRunEntry(kind, JSON.parse(JSON.stringify(fields)));
    let history = [entry, ...(current.runHistory || [])];
    compactRunHistory(history);
    // Preventive: storage.js swallows quota errors, so trim BEFORE persist.
    history = enforceRunHistoryBudget(history);
    current.runHistory = history;
    persist();
    return entry.id;
  }

  function findRunEntry(entryId) {
    return (current.runHistory || []).find((r) => r.id === entryId);
  }

  function deleteRunEntry(entryId) {
    current.runHistory = (current.runHistory || []).filter((r) => r.id !== entryId);
    persist();
  }

  function setRunEntryNotes(entryId, notes) {
    const entry = findRunEntry(entryId);
    if (!entry) return false;
    entry.notes = typeof notes === 'string' ? notes : '';
    persist();
    return true;
  }

  function toggleRunEntryPinned(entryId) {
    const entry = findRunEntry(entryId);
    if (!entry) return false;
    entry.pinned = !entry.pinned;
    persist();
    return true;
  }

  /** Persist a finished linking-simulation report (hides the Dashboard setup section). */
  function completeLinkingSim(outcome) {
    // Snapshot through JSON - the outcome must be inert plain data, never
    // share references with the live candidate/build it was derived from.
    current.linkingSim = JSON.parse(JSON.stringify(outcome));
    persist();
  }

  /** Clears the linking simulation's outcome so the Dashboard's setup section returns. */
  function resetLinkingSim() {
    current.linkingSim = null;
    persist();
  }

  /** Changing class drops sigil selections/values that don't resolve against the new class's catalogue. */
  function setOpponentClass(opponentId, characterClass) {
    const opponent = findOpponent(opponentId);
    if (!opponent || !CLASSES.includes(characterClass)) return false;
    if (opponent.class !== characterClass) {
      opponent.class = characterClass;
      opponent.sigilIds = [];
      opponent.sigilValues = {};
    }
    persist();
    return true;
  }

  function setOpponentStat(opponentId, statKey, value) {
    const opponent = findOpponent(opponentId);
    if (!opponent || !STAT_FIELDS.some((f) => f.key === statKey)) return false;
    opponent.stats[statKey] = Number(value) || 0;
    persist();
    return true;
  }

  /** Equip/unequip one of the opponent's class sigils, capped at PRESET_SIGIL_CAP like presets. */
  function toggleOpponentSigil(opponentId, sigilId, equipped) {
    const opponent = findOpponent(opponentId);
    const def = (SIGILS_BY_CLASS[opponent?.class] || []).find((d) => d.id === sigilId);
    if (!def) return false;
    if (equipped) {
      if (opponent.sigilIds.includes(sigilId)) return true;
      if (opponent.sigilIds.length >= PRESET_SIGIL_CAP) return false;
      opponent.sigilIds.push(sigilId);
    } else {
      opponent.sigilIds = opponent.sigilIds.filter((id) => id !== sigilId);
    }
    persist();
    return true;
  }

  /** Set one entered value on an opponent sigil: a declared active statKey, or 'damage'/'tickDamage'. */
  function setOpponentSigilValue(opponentId, sigilId, field, value) {
    const opponent = findOpponent(opponentId);
    const def = (SIGILS_BY_CLASS[opponent?.class] || []).find((d) => d.id === sigilId);
    if (!def) return false;
    if (!opponent.sigilValues[sigilId]) opponent.sigilValues[sigilId] = emptySigilValues(def);
    const entry = opponent.sigilValues[sigilId];
    if (field === 'damage' || field === 'tickDamage') {
      entry[field] = Math.max(0, Number(value) || 0);
    } else if (field === 'regenDebuffPct') {
      entry[field] = Math.min(100, Math.max(0, Number(value) || 0));
    } else if (def.active?.stats?.some((s) => s.statKey === field)) {
      entry.active[field] = Number(value) || 0;
    } else {
      return false;
    }
    persist();
    return true;
  }

  // --- Presets (Character.presets - the unit a Drop Check verdict/preset editor operates on) ---
  function addPreset(name) {
    const preset = newPreset(name || `Preset ${current.presets.length + 1}`); // Calculated by default
    current.presets.push(preset);
    current.activePresetId = preset.id; // a just-created preset is what you want to edit
    persist();
    return preset.id;
  }

  /** Which preset the Presets editor shows - persisted so it survives screen switches. */
  function setActivePreset(presetId) {
    if (current.presets.some((p) => p.id === presetId)) {
      current.activePresetId = presetId;
      persist();
    }
  }

  function renamePreset(presetId, name) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (preset && name && name.trim()) {
      preset.name = name.trim();
      persist();
    }
  }

  /** Returns false (no-op) at the two-preset minimum (data-model.md §3) - never loop "delete down to one". */
  function deletePreset(presetId) {
    if (current.presets.length <= 2) return false;
    const idx = current.presets.findIndex((p) => p.id === presetId);
    if (idx === -1) return false;
    current.presets.splice(idx, 1);
    if (current.activePresetId === presetId) {
      current.activePresetId = current.presets[0]?.id ?? null;
    }
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

  function setPresetMount(presetId, mountId) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (preset) {
      preset.mountId = mountId;
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

  /**
   * Patch a preset's assigned goal (kind / custom name / ehpWeight / weights)
   * and re-normalise, so class gating and the weights sum-to-100 invariant
   * hold no matter what the caller passes.
   */
  function setPresetGoal(presetId, patch) {
    const idx = current.presets.findIndex((p) => p.id === presetId);
    if (idx === -1) return;
    const preset = current.presets[idx];
    preset.goal = normalisePresetGoal({ ...preset.goal, ...patch }, current.class, idx);
    persist();
  }

  /** Whether this preset is one of the two the linking simulation evaluates (linkingSimulation.js). */
  function setPresetLinked(presetId, linked) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (preset) {
      preset.goal.linked = linked === true;
      persist();
    }
  }

  /** top/bottom are mutually exclusive - checking one clears the other; core is independent. */
  function setPresetFortressBuff(presetId, key, checked) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (!preset) return;
    preset.fortressBuffs[key] = checked;
    if (checked && key === 'top') preset.fortressBuffs.bottom = false;
    if (checked && key === 'bottom') preset.fortressBuffs.top = false;
    persist();
  }

  /**
   * Overwrite a preset - and the character-wide sources the optimizer
   * searches - with a recommended Candidate (optimizer.js shape), in one
   * persisted step. The preset is switched to Calculated totals: the
   * recommendation was scored on calculated numbers, so leaving Manual
   * totals on would make applying it a visible no-op. Returns false (no-op)
   * if the preset doesn't exist.
   */
  function applyOptimizerCandidate(presetId, candidate) {
    const preset = current.presets.find((p) => p.id === presetId);
    if (!preset) return false;
    preset.loadout = candidate.preset.loadout;
    preset.petId = candidate.preset.petId;
    preset.mountId = candidate.preset.mountId ?? null;
    preset.relicIds = [...candidate.preset.relicIds];
    preset.sigilIds = [...candidate.preset.sigilIds];
    preset.manualTotals = false;
    const loadout = current.loadouts[candidate.preset.loadout];
    if (loadout) loadout.socketedStones = { ...candidate.socketedStones };
    current.talentSets[preset.talentSet] = {
      spec: candidate.talentSpec,
      allocation: { ...candidate.talentAllocation },
    };
    // The candidate's glyphs belong to the mount it rides, so only that
    // mount's list changes - other mounts keep what other presets put on them.
    const riddenMount = current.mounts.entries.find((m) => m.id === preset.mountId);
    if (riddenMount) riddenMount.glyphIds = [...candidate.glyphEquippedIds];
    current.awakening.path = candidate.awakeningPath;
    current.transcendence.unlockedPositions = [...candidate.transcendenceUnlocked];
    persist();
    return true;
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

  /** Patch the Drop Check verdict goal ({ kind?, ehpWeight? }); re-normalised so a bad patch can't persist an invalid goal. */
  function setDropGoal(patch) {
    current.dropGoal = normaliseDropGoal({ ...current.dropGoal, ...patch }, current.class);
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
    setPetCompanion,
    setPetAltarLevel,
    setPetAltarTier,
    setPetSecondaryKey,
    setPetSecondaryValue,
    updatePetStat,
    removePet,
    setMountStar,
    setMountValue,
    addMountGlyph,
    removeMountGlyph,
    setMountGlyph,
    mountsWithGlyph,
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
    setSigilLevel,
    setSigilForgeTier,
    setSigilStatValue,
    setSigilDamageValue,
    toggleSigilOnPreset,
    addOpponent,
    deleteOpponent,
    duplicateOpponent,
    addOpponentFromPreset,
    toggleOpponentSpecialGlyph,
    renameOpponent,
    setOpponentClass,
    setOpponentStat,
    addRunHistoryEntry,
    deleteRunEntry,
    setRunEntryNotes,
    toggleRunEntryPinned,
    completeLinkingSim,
    resetLinkingSim,
    toggleOpponentSigil,
    setOpponentSigilValue,
    addPreset,
    setActivePreset,
    renamePreset,
    deletePreset,
    setPresetLoadout,
    setPresetTalentSet,
    setPresetPet,
    setPresetMount,
    setPresetTotalsMode,
    setPresetManualStat,
    setPresetGoal,
    setPresetLinked,
    setPresetFortressBuff,
    applyOptimizerCandidate,
    startDrop,
    setDropSlot,
    setDropField,
    clearDrop,
    setDropGoal,
    applyDropToLoadout,
    importFromJson,
    exportDownload,
  };
}

export const rosterStore = createRosterStore();
