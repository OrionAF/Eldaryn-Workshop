// Pet Core source (a3, Pets V2): the equipped core's flat Attack/HP and altar-scaled secondaries.
// Pure; takes plain values (no model/store). Facts: docs/Reference/Game/pet-cores.md §2-§4, §7.
// The tier table and altar-XP walk live in game/petCores.js (the profile import needs them too).
import {
  CORE_STAT_GROWTH, CORE_MAX_ALTAR_LEVEL, CORE_TIER_STAT_MULT, CORE_POWER,
  normalizeCoreTier, tierTableValue, coreAltarTierXpMultiplier, coreAltarXpRequired, coreAltarProgress,
} from '../../game/petCores.js';
import { emptyPetBonuses, petSecondaryValue, secondaryKey } from './pet.js';

export { normalizeCoreTier, coreAltarTierXpMultiplier, coreAltarXpRequired, coreAltarProgress };

// port of coreTierStatMultiplier L1064700
export const coreTierStatMultiplier = (tier) => tierTableValue(CORE_TIER_STAT_MULT.table, CORE_TIER_STAT_MULT.growth, tier);

/**
 * port of calculateCoreBonuses L1218673. A null core gives all zeros (calculatePetV2Bonuses L1218779).
 * Secondaries are in the client's units (multiplier deltas for Attack Speed, Crit Damage, Minion
 * Attack Speed); PVP_ATTACK, PVP_DEFENSE, OBLIVION_POWER and unknown types are ignored (§2).
 * @param {{baseAttack:number, baseHp:number, secondaryStats?: {type:string, value:number}[]}|null} core
 * @param {number} altarLevel 1..50
 * @param {number} tier
 * @returns {import('../types.js').PetBonuses}
 */
export function calculateCoreBonuses(core, altarLevel, tier) {
  const out = emptyPetBonuses();
  if (!core) return out;
  const growth = 1 + (altarLevel - 1) * CORE_STAT_GROWTH;
  const mult = coreTierStatMultiplier(tier);
  out.flatAttack = Math.floor(core.baseAttack * growth * mult);
  out.flatHp = Math.floor(core.baseHp * growth * mult);
  for (const s of core.secondaryStats ?? []) {
    const key = secondaryKey(s.type);
    if (!(key in out) || key === 'flatAttack' || key === 'flatHp') continue;
    out[key] += petSecondaryValue(s.value, altarLevel);
  }
  return out;
}

// port of coreTpTierK L1065087: past the table it follows the stat multiplier
function coreTpTierK(tier) {
  const t = normalizeCoreTier(tier);
  const k = CORE_POWER.tierK;
  if (t <= k.length) return k[t - 1];
  return (k[k.length - 1] * coreTierStatMultiplier(t)) / coreTierStatMultiplier(k.length);
}

// port of coreTpLevelSlope L1065117
const coreTpLevelSlope = (tier) => CORE_POWER.levelSlope[Math.min(normalizeCoreTier(tier), CORE_POWER.levelSlope.length) - 1];

/**
 * port of petV2TotalPower L1218970. Total Power feeds it through an Ancient-equivalent pet
 * (powerPetForTarget L1219031) whose V1 term equals this value, so it is the pet term itself.
 * `rarity` is the upper-case enum.
 */
export function coreTotalPower(rarity, altarLevel, tier) {
  const t = normalizeCoreTier(tier);
  const p = CORE_POWER.rarityPower[rarity] ?? 0;
  const L = Math.min(altarLevel, CORE_MAX_ALTAR_LEVEL);
  if (t === 1) return (p * coreTpTierK(1) * Math.max(0, L)) / CORE_MAX_ALTAR_LEVEL;
  return p * coreTpTierK(t) * CORE_POWER.levelBase ** ((L - CORE_MAX_ALTAR_LEVEL) / coreTpLevelSlope(t));
}
