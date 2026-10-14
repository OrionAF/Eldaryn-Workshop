// L1 catalogue: pet species, rarity weights and altar XP tables. Lookups only.
// Sources: Game/pets.md; data/pets.json (species and altar tables: decompile L1187824-1190344).
import petsData from '../../data/game/pets.json';

export const PET_SPECIES = petsData.species;
/** Rarity weight rows keyed by totalPetsPurchased (see rarityWeightsNote in the JSON). */
export const PET_RARITY_WEIGHTS = petsData.rarityWeightsPct;
export const PET_ALTAR_XP_NEEDED_BY_TIER = petsData.altarXpNeededPerLevel;
export const PET_ALTAR_TOTAL_XP_TO_MAX = petsData.altarTotalXpToMax;

const speciesMap = new Map(PET_SPECIES.map((p) => [p.id, p]));

/** Pet species entry by id (e.g. 'FLAME_TOAD'), or null. */
export const petSpeciesById = (id) => speciesMap.get(id) ?? null;

/** Display name for a species at an evolved tier (evolved names replace the base name). */
export const petDisplayName = (id, evolved = false) => {
  const s = speciesMap.get(id);
  if (!s) return null;
  return evolved ? s.evolvedName : s.name;
};
