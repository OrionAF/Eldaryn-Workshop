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

// port of coreTpTierK (2.9.3 L1064369)
const coreTpTierK = (tier) => coreTierStatMultiplier(tier) ** CORE_POWER.statExponent;

/**
 * port of petV2TotalPower (2.9.3 L1218425; pet-cores.md §7). Total Power feeds it through an
 * Ancient-equivalent pet (powerPetForTarget) whose V1 term equals this value, so it is the pet term itself.
 * `rarity` is the upper-case enum.
 */
export function coreTotalPower(rarity, altarLevel, tier) {
  const t = normalizeCoreTier(tier);
  const p = CORE_POWER.rarityPower[rarity] ?? 0;
  const L = Math.min(altarLevel, CORE_MAX_ALTAR_LEVEL);
  if (t === 1) return (p * coreTpTierK(1) * Math.max(0, L)) / CORE_MAX_ALTAR_LEVEL;
  const growth = (lv) => 1 + (lv - 1) * CORE_STAT_GROWTH;
  const levelFrac = (growth(Math.max(1, L)) / growth(CORE_MAX_ALTAR_LEVEL)) ** CORE_POWER.statExponent;
  return p * coreTpTierK(t) * levelFrac;
}
