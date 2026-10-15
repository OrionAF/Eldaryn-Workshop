// search/patch.js (A2): the single write path from an optimiser candidate to a character (redesign
// plan A.11). Pure: the input character is never mutated; untouched pieces are shared with it.
// Used by the legality oracle's round-trip (search/legality.js) and by the store's apply mutator
// (store/apply.js), so what is checked is exactly what gets written.
//
// A candidate's writes fall in three scopes (data-model.md §2):
//   preset     the preset's own choices (gear set, talent set, pet, mount, relics, sigils, board link)
//   character  the chosen talent set's allocation and the activation conditions (one per owned sigil)
//   mount      the sockets of the candidate's mount
// The Candidate shape: docs/Reference/simulation.md §Build space.
import { DEFAULT_CONDITION } from '../model/sigils.js';
import { resolveTranscendencePreset } from '../model/legality.js';

export const SCOPES = Object.freeze(['preset', 'character', 'mount']);

/** The preset fields a candidate sets. */
export const PRESET_FIELDS = Object.freeze([
  'equipmentSet', 'talentSet', 'petId', 'mountId', 'relicIds', 'sigilSpecies',
  'utilitySigilSpecies', 'ancientSigilSpecies', 'transcendencePresetId',
]);

const copySockets = (g) => ({ minor: [...(g.minor ?? [])], major: [...(g.major ?? [])], mythic: [...(g.mythic ?? [])] });

/**
 * The writes a candidate stands for, grouped by scope. The board link is written only when the
 * candidate's board differs from the one the preset already resolves to, so a null link stays null
 * while it resolves to the same board (#56).
 * @returns {{preset: Object, character: {talentAllocation: {talentSet: 0|1, allocation: Object}|null,
 *   sigilConditions: Record<string, string>}, mount: {mountId: string, glyphs: Object}|null}}
 */
export function candidateWrites(character, presetId, cand) {
  const preset = character.presets.find((p) => p.id === presetId);
  if (!preset) throw new Error(`Unknown preset ${presetId}`);
  const resolved = resolveTranscendencePreset(character, preset)?.id ?? null;
  const link = cand.transcendencePresetId === resolved ? preset.transcendencePresetId ?? null : cand.transcendencePresetId;
  return {
    preset: {
      equipmentSet: cand.equipmentSet,
      talentSet: cand.talentSet,
      petId: cand.petId,
      mountId: cand.mountId,
      relicIds: [...cand.relicIds],
      sigilSpecies: [...cand.sigilSpecies],
      utilitySigilSpecies: cand.utilitySigilSpecies,
      ancientSigilSpecies: cand.ancientSigilSpecies,
      transcendencePresetId: link,
    },
    character: {
      talentAllocation: cand.talentAllocation ? { talentSet: cand.talentSet, allocation: { ...cand.talentAllocation } } : null,
      sigilConditions: { ...(cand.sigilConditions ?? {}) },
    },
    mount: cand.mountGlyphs && cand.mountId ? { mountId: cand.mountId, glyphs: copySockets(cand.mountGlyphs) } : null,
  };
}

/**
 * Write `cand` onto preset `presetId` of `character`. Returns a new character; normalisation and
 * reconcile are the caller's (store/apply.js normalises; the legality oracle compares before and after).
 * @param {Object} character  a normalised v2 Character (not mutated)
 * @param {string} presetId
 * @param {Object} cand  a Candidate (search/space.js)
 * @param {{include?: string[]}} [opts]  the scopes to write (default all); an excluded group is skipped
 */
export function applyCandidate(character, presetId, cand, { include = SCOPES } = {}) {
  const w = candidateWrites(character, presetId, cand);
  const on = new Set(include);
  const out = { ...character };
  if (on.has('preset')) {
    out.presets = character.presets.map((p) => (p.id === presetId ? { ...p, ...w.preset } : p));
  }
  if (on.has('character')) {
    const ta = w.character.talentAllocation;
    if (ta) out.talentSets = character.talentSets.map((s, i) => (i === ta.talentSet ? { ...s, allocation: ta.allocation } : s));
    const conds = Object.entries(w.character.sigilConditions);
    if (conds.length) {
      const owned = { ...(character.sigils?.owned ?? {}) };
      for (const [sp, cond] of conds) {
        if (!owned[sp]) continue;
        const { condition: _old, ...rest } = owned[sp];
        owned[sp] = cond && cond !== DEFAULT_CONDITION ? { ...rest, condition: cond } : rest;
      }
      out.sigils = { ...character.sigils, owned };
    }
  }
  if (on.has('mount') && w.mount) {
    out.mounts = (character.mounts ?? []).map((m) => (m.id === w.mount.mountId ? { ...m, glyphs: w.mount.glyphs } : m));
  }
  return out;
}
