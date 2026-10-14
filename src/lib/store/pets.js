// store/pets.js - Pets mutators (B3). Every mutator ends with persist() via ctx.edit. Preset -> pet
// selection is setPresetPet in store/presets.js; anything that removes a pet reconciles so presets
// that referenced it fall back to no pet.
import {
  PET_MAX_LEVEL, PET_MAX_TIER, MAX_OWNED_PETS, PET_SECONDARY_RANGES,
  newPet, secondarySlots, clampSecondaryValue,
} from '../model/pets.js';
import { petSpeciesById } from '../game/pets.js';
import { available } from '../game/classes.js';

const clampInt = (v, min, max) => Math.max(min, Math.min(Math.round(Number(v)) || min, max));

export function createPetsStore(ctx) {
  const find = (c, petId) => c.pets.owned.find((p) => p.id === petId) ?? null;

  /** @returns {string|null} the new pet's id, or null for an unknown species or a full collection (100). */
  function addPet(speciesId) {
    return ctx.edit((c) => {
      if (c.pets.owned.length >= MAX_OWNED_PETS) return null;
      const pet = newPet(speciesId);
      if (!pet) return null;
      c.pets.owned.push(pet);
      return pet.id;
    });
  }

  /** Remove a pet; presets using it fall back to no pet. */
  function removePet(petId) {
    return ctx.edit((c) => {
      const i = c.pets.owned.findIndex((p) => p.id === petId);
      if (i < 0) return false;
      c.pets.owned.splice(i, 1);
      ctx.reconcile(c);
      return true;
    });
  }

  /** Change a pet's species; rarity follows, surplus secondaries are dropped. */
  function setPetSpecies(petId, speciesId) {
    return ctx.edit((c) => {
      const pet = find(c, petId);
      const s = petSpeciesById(speciesId);
      if (!pet || !s) return false;
      pet.species = s.id;
      pet.rarity = s.rarity;
      pet.secondaries = pet.secondaries.slice(0, s.secondaryStatCount);
      return true;
    });
  }

  /**
   * Set secondary slot `index` (an existing slot, or the next free one) to `type`. A type already on
   * the pet, a class-unavailable type or a slot beyond the species' count is refused. Keeps the old
   * value when the slot already had one, else the type's minimum.
   */
  function setPetSecondaryType(petId, index, type) {
    return ctx.edit((c) => {
      const pet = find(c, petId);
      if (!pet || !PET_SECONDARY_RANGES[type] || !available(type, c.class)) return false;
      if (!Number.isInteger(index) || index < 0 || index > pet.secondaries.length || index >= secondarySlots(pet.species)) return false;
      if (pet.secondaries.some((s, i) => i !== index && s.type === type)) return false;
      const prev = pet.secondaries[index];
      pet.secondaries[index] = { type, value: clampSecondaryValue(type, prev ? prev.value : 0) };
      return true;
    });
  }

  function setPetSecondaryValue(petId, index, value) {
    return ctx.edit((c) => {
      const s = find(c, petId)?.secondaries[index];
      if (!s) return false;
      s.value = clampSecondaryValue(s.type, value);
      return true;
    });
  }

  function removePetSecondary(petId, index) {
    return ctx.edit((c) => {
      const pet = find(c, petId);
      if (!pet || !pet.secondaries[index]) return false;
      pet.secondaries.splice(index, 1);
      return true;
    });
  }

  function setPetAltarLevel(level) {
    return ctx.edit((c) => {
      c.pets.altar.level = clampInt(level, 1, PET_MAX_LEVEL);
    });
  }

  /**
   * Changing the altar tier WIPES the collection (the game's behaviour) and nulls every preset's
   * petId. The UI must confirm first. Same tier is a no-op. Returns whether anything changed.
   */
  function setPetAltarTier(tier) {
    return ctx.edit((c) => {
      const t = clampInt(tier, 1, PET_MAX_TIER);
      if (t === c.pets.altar.tier) return false;
      c.pets.altar.tier = t;
      c.pets.owned = [];
      for (const p of c.presets) p.petId = null;
      return true;
    });
  }

  return { addPet, removePet, setPetSpecies, setPetSecondaryType, setPetSecondaryValue, removePetSecondary, setPetAltarLevel, setPetAltarTier };
}
