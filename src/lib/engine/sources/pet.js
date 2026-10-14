// Pet source (a3): the equipped pet's flat Attack/HP and altar-scaled secondaries.
// Pure; takes plain values (no model/store). Facts: docs/Reference/Game/pets.md §4-§6.
import { petSpeciesById, PET_ALTAR_XP_NEEDED_BY_TIER } from '../../game/pets.js';

/** STAT_GROWTH_PER_LEVEL, SECONDARY_GROWTH_PER_LEVEL, TIER_STAT_MULT, MAX_TIER, MAX_ALTAR_LEVEL (pets.md §1). */
const STAT_GROWTH = 0.07;
const SECONDARY_GROWTH = 0.02;
const TIER_STAT_MULT = 3;
const MAX_TIER = 8;
const MAX_ALTAR_LEVEL = 50;

/**
 * SecondaryStatType enum name -> camelCase bonus key (ATTACK_SPEED -> attackSpeed). Matches every
 * key of PetBonuses / StoneBonuses / MountBonuses (pets.md §5). Shared by the other sources.
 * @param {string} type
 */
export const secondaryKey = (type) =>
  String(type)
    .toLowerCase()
    .replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** A zeroed PetBonuses (the 28-key set, L1221760). @returns {import('../types.js').PetBonuses} */
export const emptyPetBonuses = () => ({
  flatAttack: 0, flatHp: 0, attackSpeed: 0, doubleHit: 0, critChance: 0, critDamage: 0,
  hpRegen: 0, lifesteal: 0, healthPercent: 0, attackPercent: 0, damageReduction: 0,
  blockChance: 0, missChance: 0, blindChance: 0, paralyzeChance: 0, penetration: 0,
  spellDamage: 0, spellResist: 0, spellCritChance: 0, spellVamp: 0, disruptionChance: 0,
  fearChance: 0, minionAttack: 0, minionHealth: 0, minionCritChance: 0, minionLifesteal: 0,
  soulLink: 0, minionAttackSpeed: 0,
});

const clampTier = (t) => Math.max(1, Math.min(MAX_TIER, Math.floor(t || 1)));

// port of tierStatMultiplier L1187858-1187892: 1 + (3-1)(t-1) + (t-1)(t-2)
export function tierStatMultiplier(tier) {
  const t = clampTier(tier);
  return 1 + (TIER_STAT_MULT - 1) * (t - 1) + (t - 1) * (t - 2);
}

// port of getPetBonusAttack L1188403-1188440 (baseAttack from the species entry)
export function petFlatAttack(baseAttack, altarLevel, tier = 1) {
  return Math.floor(baseAttack * (1 + (altarLevel - 1) * STAT_GROWTH) * tierStatMultiplier(tier));
}

// port of getPetBonusHp L1188441-1188478
export function petFlatHp(baseHp, altarLevel, tier = 1) {
  return Math.floor(baseHp * (1 + (altarLevel - 1) * STAT_GROWTH) * tierStatMultiplier(tier));
}

// port of getPetSecondaryStatValue L1188479-1188497 (tier does not enter)
export function petSecondaryValue(value, altarLevel) {
  return parseFloat((value * (1 + (altarLevel - 1) * SECONDARY_GROWTH)).toFixed(2));
}

/**
 * Altar level from total XP and tier (pets.md §6; XP table is the catalogue's per-level need).
 * port of getAltarProgress L1187977-1188048, need() L1187925-1187975
 * @returns {{level:number, xp:number, need:number}}
 */
export function altarProgress(totalXp, tier = 1) {
  const need = PET_ALTAR_XP_NEEDED_BY_TIER[String(clampTier(tier))];
  let level = 1;
  let xp = Math.max(0, Math.floor(totalXp || 0));
  while (level < MAX_ALTAR_LEVEL && xp >= need[level - 1]) {
    xp -= need[level - 1];
    level += 1;
  }
  if (level >= MAX_ALTAR_LEVEL) xp = 0;
  return { level, xp, need: level >= MAX_ALTAR_LEVEL ? Infinity : need[level - 1] };
}

/**
 * port of calculatePetBonuses L1221320-1221766, on resolved inputs. A missing pet or unknown
 * species gives all zeros (L1221342-1221368).
 * @param {{species: string|{baseAttack:number, baseHp:number}|null, secondaryStats?: {type:string, value:number}[],
 *          altarLevel?: number, tier?: number, altar?: {totalXp:number, tier:number}}|null} pet
 *   `altarLevel` wins when given; otherwise it is derived from `altar` (level 1 if neither).
 * @returns {import('../types.js').PetBonuses}
 */
export function calculatePetBonuses(pet) {
  const out = emptyPetBonuses();
  if (!pet || !pet.species) return out;
  const def = typeof pet.species === 'string' ? petSpeciesById(pet.species) : pet.species;
  if (!def) return out;
  const tier = clampTier(pet.tier ?? pet.altar?.tier ?? 1);
  const level = pet.altarLevel ?? (pet.altar ? altarProgress(pet.altar.totalXp, tier).level : 1);
  out.flatAttack = petFlatAttack(def.baseAttack, level, tier);
  out.flatHp = petFlatHp(def.baseHp, level, tier);
  for (const s of pet.secondaryStats ?? []) {
    const key = secondaryKey(s.type);
    // the pet calculator ignores PVP_ATTACK, PVP_DEFENSE, OBLIVION_POWER and unknown types (pets.md §5)
    if (!(key in out) || key === 'flatAttack' || key === 'flatHp') continue;
    out[key] += petSecondaryValue(s.value, level);
  }
  return out;
}
