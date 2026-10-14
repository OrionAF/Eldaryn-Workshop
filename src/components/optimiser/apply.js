// optimiser/apply.js - write a searched candidate onto a preset through the existing store mutators.
// The search offers only glyphs not socketed on other mounts, so setMountSocket (which moves a glyph) is safe.
import { MOUNT_GLYPH_SOCKETS } from '../../lib/model/mounts.js';

/** Raise ranks until nothing more can be placed: tier gating may refuse a rank until earlier tiers are filled. */
function applyAllocation(store, setIndex, allocation) {
  store.resetTalentSet(setIndex);
  let pending = Object.entries(allocation).filter(([, r]) => r > 0);
  for (let pass = 0; pass < 40 && pending.length; pass++) {
    const next = [];
    for (const [id, rank] of pending) {
      for (let r = 1; r <= rank; r++) {
        if (!store.setTalentSetRank(setIndex, id, r)) {
          next.push([id, rank]);
          break;
        }
      }
    }
    if (next.length === pending.length) break;
    pending = next;
  }
}

/**
 * @param {object} store rosterStore
 * @param {string} presetId
 * @param {object} candidate search candidate (plain JSON)
 * @param {object} preset the preset as it is now (to clear stale sigil conditions)
 */
export function applyCandidate(store, presetId, candidate, preset) {
  const c = candidate;
  store.setPresetEquipmentSet(presetId, c.equipmentSet);
  store.setPresetTalentSet(presetId, c.talentSet);
  if (c.talentAllocation) applyAllocation(store, c.talentSet, c.talentAllocation);
  store.setPresetPet(presetId, c.petId);
  store.setPresetMount(presetId, c.mountId);
  if (c.mountGlyphs && c.mountId) {
    for (const pass of ['clear', 'set']) {
      for (const tier of Object.keys(MOUNT_GLYPH_SOCKETS)) {
        (c.mountGlyphs[tier] ?? []).forEach((gid, i) => {
          if (pass === 'clear' && gid == null) store.setMountSocket(c.mountId, tier, i, null);
          if (pass === 'set' && gid != null) store.setMountSocket(c.mountId, tier, i, gid);
        });
      }
    }
  }
  store.setPresetRelics(presetId, c.relicIds);
  store.setPresetSigils(presetId, { species: c.sigilSpecies, utility: c.utilitySigilSpecies, ancient: c.ancientSigilSpecies });
  for (const sp of Object.keys(preset?.sigilConditions ?? {})) {
    if (!(sp in c.sigilConditions)) store.setPresetSigilCondition(presetId, sp, null);
  }
  for (const [sp, cond] of Object.entries(c.sigilConditions ?? {})) store.setPresetSigilCondition(presetId, sp, cond);
  store.setPresetTranscendence(presetId, c.transcendencePresetId);
}
