// store/pets.js - Pets mutators (B3, Pet Cores). Every mutator ends with persist() via ctx.edit. Preset ->
// core selection is setPresetPet in store/presets.js; anything that removes a core reconciles so presets
// that referenced it fall back to no pet.
import {
  PET_MAX_LEVEL, PET_MAX_TIER, MAX_OWNED_CORES,
  newCore, coreSlots, coreRarityName, coreBaseMid, coreSecondaryRangePoints, clampSecondaryValue,
} from '../model/pets.js';
import { available } from '../game/classes.js';

const clampInt = (v, min, max) => Math.max(min, Math.min(Math.round(Number(v)) || min, max));

export function createPetsStore(ctx) {
  const find = (c, coreId) => c.pets.cores.find((p) => p.id === coreId) ?? null;

  /** @returns {string|null} the new core's id, or null for an unknown rarity or a full collection (100). */
  function addCore(rarity) {
    return ctx.edit((c) => {
      if (c.pets.cores.length >= MAX_OWNED_CORES) return null;
      const core = newCore(rarity);
      if (!core) return null;
      c.pets.cores.push(core);
      return core.id;
    });
  }

  /** Copy a core (same rarity, bases and secondaries) under a new id. Null for an unknown id or a full collection. */
  function duplicateCore(coreId) {
    return ctx.edit((c) => {
      const src = find(c, coreId);
      if (!src || c.pets.cores.length >= MAX_OWNED_CORES) return null;
      const copy = { ...newCore(src.rarity), baseAttack: src.baseAttack, baseHp: src.baseHp, secondaries: src.secondaries.map((s) => ({ ...s })) };
      c.pets.cores.push(copy);
      return copy.id;
    });
  }

  /** Remove a core; presets using it fall back to no pet. */
  function removeCore(coreId) {
    return ctx.edit((c) => {
      const i = c.pets.cores.findIndex((p) => p.id === coreId);
      if (i < 0) return false;
      c.pets.cores.splice(i, 1);
      ctx.reconcile(c);
      return true;
    });
  }

  /** Change a core's rarity: its bases reset to the new rarity's middle, surplus secondaries are dropped. */
  function setCoreRarity(coreId, rarity) {
    return ctx.edit((c) => {
      const core = find(c, coreId);
      const name = coreRarityName(rarity);
      if (!core || !name) return false;
      if (name === core.rarity) return false;
      const mid = coreBaseMid(name);
      core.rarity = name;
      core.baseAttack = mid.attack;
      core.baseHp = mid.hp;
      core.secondaries = core.secondaries.slice(0, coreSlots(name));
      return true;
    });
  }

  /** Set a core's base Attack or HP (`stat` 'attack' | 'hp'): a whole number >= 0. */
  function setCoreBase(coreId, stat, value) {
    return ctx.edit((c) => {
      const core = find(c, coreId);
      const n = Math.round(Number(value));
      if (!core || !Number.isFinite(n) || n < 0 || (stat !== 'attack' && stat !== 'hp')) return false;
      core[stat === 'attack' ? 'baseAttack' : 'baseHp'] = n;
      return true;
    });
  }

  /**
   * Set secondary slot `index` (an existing slot, or the next free one) to `type`. A type already on
   * the core, a class-unavailable type or a slot beyond the rarity's count is refused. Keeps the old
   * value when the slot already had one, else the type's minimum.
   */
  function setCoreSecondaryType(coreId, index, type) {
    return ctx.edit((c) => {
      const core = find(c, coreId);
      if (!core || !coreSecondaryRangePoints(type) || !available(type, c.class)) return false;
      if (!Number.isInteger(index) || index < 0 || index > core.secondaries.length || index >= coreSlots(core.rarity)) return false;
      if (core.secondaries.some((s, i) => i !== index && s.type === type)) return false;
      const prev = core.secondaries[index];
      core.secondaries[index] = { type, value: clampSecondaryValue(type, prev ? prev.value : 0) };
      return true;
    });
  }

  function setCoreSecondaryValue(coreId, index, value) {
    return ctx.edit((c) => {
      const s = find(c, coreId)?.secondaries[index];
      if (!s) return false;
      s.value = clampSecondaryValue(s.type, value);
      return true;
    });
  }

  function removeCoreSecondary(coreId, index) {
    return ctx.edit((c) => {
      const core = find(c, coreId);
      if (!core || !core.secondaries[index]) return false;
      core.secondaries.splice(index, 1);
      return true;
    });
  }

  function setPetAltarLevel(level) {
    return ctx.edit((c) => {
      c.pets.altar.level = clampInt(level, 1, PET_MAX_LEVEL);
    });
  }

  /**
   * Changing the altar tier WIPES every core (the game's evolve, Game/pet-cores.md §4) and nulls every
   * preset's petId. The UI must confirm first. Same tier is a no-op. Returns whether anything changed.
   */
  function setPetAltarTier(tier) {
    return ctx.edit((c) => {
      const t = clampInt(tier, 1, PET_MAX_TIER);
      if (t === c.pets.altar.tier) return false;
      c.pets.altar.tier = t;
      c.pets.cores = [];
      for (const p of c.presets) p.petId = null;
      return true;
    });
  }

  return { addCore, duplicateCore, removeCore, setCoreRarity, setCoreBase, setCoreSecondaryType, setCoreSecondaryValue, removeCoreSecondary, setPetAltarLevel, setPetAltarTier };
}
