// store/presets.js (M1): preset CRUD plus the per-preset reference setters (equipment set, talent set,
// pet, mount, relics, sigils, transcendence). Setters write the id and let reconcile repair anything
// that does not resolve, so a bad id never persists. Every mutator ends with persist().
// Domain slices add their own domain mutators in their store files, not here.
import { newPreset, MIN_PRESETS, MAX_PRESETS, PRESET_RELIC_CAP, PRESET_SIGIL_CAP } from '../model/presets.js';
import { newId } from '../model/character.js';

const uniq = (ids, cap) => [...new Set((ids ?? []).filter((x) => typeof x === 'string' && x))].slice(0, cap);

export function createPresetsStore(ctx) {
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

  /** Refuses below the two-preset minimum. */
  function deletePreset(presetId) {
    return ctx.edit((c) => {
      if (c.presets.length <= MIN_PRESETS) return false;
      const idx = c.presets.findIndex((p) => p.id === presetId);
      if (idx === -1) return false;
      c.presets.splice(idx, 1);
      if (c.activePresetId === presetId) c.activePresetId = c.presets[0].id;
      return true;
    });
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

  /**
   * @deprecated Conditions are character-wide (M1): this writes the same value for every preset and
   * ignores `presetId`. Use setSigilCondition. Removed with the old screens (U12). conditionId null clears it.
   */
  // eslint-disable-next-line no-unused-vars
  function setPresetSigilCondition(presetId, species, conditionId) {
    ctx.edit((c) => {
      const own = c.sigils.owned[species];
      if (!own) return;
      if (conditionId && conditionId !== 'ON_COOLDOWN') own.condition = conditionId;
      else delete own.condition;
      ctx.reconcile(c);
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
    deletePreset,
    setActivePreset,
    renamePreset,
    setPresetEquipmentSet,
    setPresetTalentSet,
    setPresetPet,
    setPresetMount,
    setPresetRelics,
    setPresetSigils,
    setPresetSigilCondition,
    setPresetTranscendence,
  };
}
