// store/presets.js (M1): preset CRUD plus the per-preset reference setters (equipment set, talent set,
// pet, mount, relics, sigils, transcendence). Setters write the id and let reconcile repair anything
// that does not resolve, so a bad id never persists. Every mutator ends with persist().
// Domain slices add their own domain mutators in their store files, not here.
import { newPreset, normalisePreset, MIN_PRESETS, MAX_PRESETS, PRESET_RELIC_CAP, PRESET_SIGIL_CAP } from '../model/presets.js';
import { newId } from '../model/character.js';

const uniq = (ids, cap) => [...new Set((ids ?? []).filter((x) => typeof x === 'string' && x))].slice(0, cap);

export function createPresetsStore(ctx) {
  // The last deleted preset, for the one-step Undo on its toast. Session only, never persisted.
  let lastDeleted = null;

  /** @returns {string|null} the new preset's id, or null at the 8-preset cap. It becomes the active preset. */
  function addPreset(name) {
    return ctx.edit((c) => {
      if (c.presets.length >= MAX_PRESETS) return null;
      const p = newPreset(name?.trim() || `Preset ${c.presets.length + 1}`);
      c.presets.push(p);
      c.activePresetId = p.id;
      return p.id;
    });
  }

  /** Copy of an existing preset (new id, " copy" suffix, becomes active). Null at the cap. */
  function duplicatePreset(presetId) {
    return ctx.edit((c) => {
      const src = ctx.findPreset(presetId, c);
      if (!src || c.presets.length >= MAX_PRESETS) return null;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = newId('p');
      copy.name = `${src.name} copy`;
      c.presets.splice(c.presets.indexOf(src) + 1, 0, copy);
      c.activePresetId = copy.id;
      return copy.id;
    });
  }

  /** Swap a preset with its neighbour (delta -1 = left, +1 = right). False when it cannot move. Ids and the active preset are untouched. */
  function movePreset(presetId, delta) {
    return ctx.edit((c) => {
      const from = c.presets.findIndex((p) => p.id === presetId);
      const to = from + (delta < 0 ? -1 : 1);
      if (from === -1 || to < 0 || to >= c.presets.length) return false;
      [c.presets[from], c.presets[to]] = [c.presets[to], c.presets[from]];
      return true;
    });
  }

  /** Refuses below the two-preset minimum. */
  function deletePreset(presetId) {
    return ctx.edit((c) => {
      if (c.presets.length <= MIN_PRESETS) return false;
      const idx = c.presets.findIndex((p) => p.id === presetId);
      if (idx === -1) return false;
      lastDeleted = {
        characterId: c.id,
        preset: JSON.parse(JSON.stringify(c.presets[idx])),
        index: idx,
        wasActive: c.activePresetId === presetId,
        ownedOblivionSheet: c.oblivion?.sheet?.presetId === presetId,
      };
      c.presets.splice(idx, 1);
      if (c.activePresetId === presetId) c.activePresetId = c.presets[0].id;
      ctx.reconcile(c); // a preset that owned the Oblivion sheet must not stay named by it
      return true;
    });
  }

  /**
   * Whether restoreDeletedPreset has something to bring back, and whether its character has room.
   * @param {string} [presetId] the deleted preset's id: 'none' when the slot holds a later delete
   */
  function deletedPresetStatus(presetId) {
    if (!lastDeleted) return 'none';
    if (presetId !== undefined && lastDeleted.preset.id !== presetId) return 'none';
    const c = ctx.findCharacter(lastDeleted.characterId);
    if (!c) return 'none';
    return c.presets.length >= MAX_PRESETS ? 'full' : 'ready';
  }

  /**
   * Undo the last deletePreset, into the character it came from: back at its old place (a fresh id if
   * its id is taken by now), active again if it was, and owner of the Oblivion sheet again if it was and
   * nothing took the sheet since. References that no longer resolve are dropped by reconcile. One step
   * only. At the 8-preset cap it refuses and keeps the slot, so deleting another preset frees room.
   * @param {string} [presetId] the deleted preset's id; refuses when a later delete replaced the slot
   * @returns {string|null} the restored preset's id
   */
  function restoreDeletedPreset(presetId) {
    if (deletedPresetStatus(presetId) !== 'ready') return null;
    const { characterId, preset, index, wasActive, ownedOblivionSheet } = lastDeleted;
    lastDeleted = null;
    const c = ctx.findCharacter(characterId);
    const p = normalisePreset(preset, index);
    if (c.presets.some((x) => x.id === p.id)) p.id = newId('p');
    c.presets.splice(Math.min(index, c.presets.length), 0, p);
    if (wasActive) c.activePresetId = p.id;
    const sheet = c.oblivion?.sheet;
    if (ownedOblivionSheet && sheet && !sheet.presetId) sheet.presetId = p.id;
    ctx.reconcile(c);
    ctx.persist();
    return p.id;
  }

  function setActivePreset(presetId) {
    ctx.edit((c) => {
      if (c.presets.some((p) => p.id === presetId)) c.activePresetId = presetId;
    });
  }

  function renamePreset(presetId, name) {
    if (!name || !name.trim()) return;
    ctx.editPreset(presetId, (p) => {
      p.name = name.trim();
    });
  }

  function setPresetEquipmentSet(presetId, set) {
    ctx.editPreset(presetId, (p) => {
      p.equipmentSet = set === 2 ? 2 : 1;
    });
  }

  function setPresetTalentSet(presetId, index) {
    ctx.editPreset(presetId, (p) => {
      p.talentSet = index === 1 ? 1 : 0;
    });
  }

  function setPresetPet(presetId, petId) {
    ctx.editPreset(presetId, (p) => {
      p.petId = petId || null;
    });
  }

  function setPresetMount(presetId, mountId) {
    ctx.editPreset(presetId, (p) => {
      p.mountId = mountId || null;
    });
  }

  function setPresetRelics(presetId, relicIds) {
    ctx.editPreset(presetId, (p) => {
      p.relicIds = uniq(relicIds, PRESET_RELIC_CAP); // reconcile clamps to the character's slot cap
    });
  }

  /** Partial update of the preset's sigil picks: { species?: string[], utility?: string|null, ancient?: string|null }. */
  function setPresetSigils(presetId, { species, utility, ancient } = {}) {
    ctx.editPreset(presetId, (p) => {
      if (species !== undefined) p.sigilSpecies = uniq(species, PRESET_SIGIL_CAP);
      if (utility !== undefined) p.utilitySigilSpecies = utility || null;
      if (ancient !== undefined) p.ancientSigilSpecies = ancient || null;
    });
  }

  function setPresetTranscendence(presetId, transcendencePresetId) {
    ctx.editPreset(presetId, (p) => {
      p.transcendencePresetId = transcendencePresetId || null;
    });
  }

  return {
    addPreset,
    duplicatePreset,
    movePreset,
    deletePreset,
    deletedPresetStatus,
    restoreDeletedPreset,
    setActivePreset,
    renamePreset,
    setPresetEquipmentSet,
    setPresetTalentSet,
    setPresetPet,
    setPresetMount,
    setPresetRelics,
    setPresetSigils,
    setPresetTranscendence,
  };
}
