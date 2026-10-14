// presetLabels.js (C1b): plain-text names for the things a preset references by id, shared by the
// preset card and editor. Every lookup tolerates a dangling id (reconcile normally prevents one).
import { petDisplayName } from '../../lib/game/pets.js';
import { mountBySpecies } from '../../lib/game/mountsGlyphs.js';
import { sigilBySpecies } from '../../lib/game/sigils.js';
import { relicById } from '../../lib/game/relics.js';
import { talentSpec } from '../../lib/game/talents.js';

export const SET_LABELS = { 1: 'Gear Set 1', 2: 'Gear Set 2' };

export function petLabel(character, petId) {
  const pet = character.pets.owned.find((p) => p.id === petId);
  if (!pet) return null;
  return petDisplayName(pet.species, character.pets.altar.tier >= 2) ?? pet.species;
}

export function mountLabel(character, mountId) {
  const m = character.mounts.find((x) => x.id === mountId);
  if (!m) return null;
  return `${mountBySpecies(m.species)?.name ?? m.species} Lv${m.level}`;
}

export const sigilLabel = (species) => sigilBySpecies(species)?.name ?? species;
export const relicLabel = (id) => relicById(id)?.name ?? id;

export function talentSetLabel(character, index) {
  const set = character.talentSets[index];
  const letter = index === 0 ? 'Set A' : 'Set B';
  return set?.spec ? `${letter} · ${talentSpec(set.spec)?.name ?? set.spec}` : `${letter} · no spec`;
}

export function transcendenceLabel(character, id) {
  return character.transcendence.presets.find((p) => p.id === id)?.name ?? null;
}

/** Count of filled item slots in an equipment set. */
export function filledSlots(character, setKey) {
  return Object.values(character.equipment?.[setKey]?.items ?? {}).filter(Boolean).length;
}
