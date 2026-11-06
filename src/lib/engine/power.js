// engine/power.js - Combat Power: the client's calculatePowerBreakdown / calculateTotalPower and the
// gear quality it reads (calculateStatQuality / calculateItemQuality). Formula, constants and what the
// two real profiles prove: Game/stats.md §8; quality: Game/gear.md §5. Pure; imports L1 and the Pet Core
// source (its power term, Game/pet-cores.md §7).
//
//   PowerInput = {
//     level, equipment: [{rarity, itemLevel, quality, realm}|null], sigils: [{rarity, level}],
//     sigilAltarTier, enchants: [{quality, amplifyLevel}], transcendenceNodeCount,
//     pet: {rarity, altarLevel, tier}|null (the equipped Pet Core and the Core Altar), mount: {rarity, stars}|null,
//     relics: [{tier, level, maxLevel}], talentPointsSpent, awakeningPoints,
//   }
// Rarity and relic tier keys are the client's upper-case enums (`EPIC`, `GOLD`).
import { POWER_CONFIG } from '../game/stats.js';
import { ascensionEffectiveLevel, itemStatLevel as statLevelOf, calculateStatQuality, calculateItemQuality } from '../game/gear.js';
import { coreTotalPower } from './sources/petCore.js';

export { ascensionEffectiveLevel };

/** The breakdown's terms, in the client's summing order. */
export const POWER_TERMS = Object.freeze(['equipment', 'sigils', 'enchants', 'transcendence', 'pet', 'mount', 'relics', 'talents', 'awakening', 'level']);

/** gear.md §3 itemStatLevel of a Power input item ({itemLevel, realm}). */
export const itemStatLevel = (item) => statLevelOf(item.itemLevel, item.realm);

// gear.md §5 quality lives in L1 (game/gear.js) so the model can derive an item's quality too.
export { calculateStatQuality, calculateItemQuality };

const nz = (v) => (v == null ? 0 : v); // the client's `?? 0`

/**
 * calculatePowerBreakdown (stats.md §8): the unrounded terms, each term rounded for display, and
 * `power`, the rounded sum of the unrounded terms.
 * @param {Object} input  PowerInput (header)
 * @param {Object} [config]  TOTAL_POWER_CONFIG (default: data/stats.json powerConfig)
 * @returns {{power: number, terms: Record<string, number>, exact: Record<string, number>}}
 */
export function calculatePowerBreakdown(input, config = POWER_CONFIG) {
  const c = config;
  const max0 = (v) => Math.max(0, v);
  let equipment = 0;
  for (const item of input.equipment ?? []) {
    if (!item) continue;
    const rarity = nz(c.EQUIP_RARITY_POWER[item.rarity]);
    const ilvl = 1 + c.EQUIP_ILVL_WEIGHT * (ascensionEffectiveLevel(itemStatLevel(item)) / 100);
    equipment += rarity * ilvl * (1 + c.EQUIP_QUALITY_WEIGHT * (nz(item.quality) / 100));
  }
  const altar = c.ALTAR_TIER_BASE ** max0(nz(input.sigilAltarTier) - 1);
  let sigils = 0;
  for (const s of input.sigils ?? []) {
    sigils += nz(c.SIGIL_RARITY_POWER[s.rarity]) * (Math.min(s.level, c.SIGIL_MAX_LEVEL) / c.SIGIL_MAX_LEVEL) * altar;
  }
  let enchants = 0;
  for (const e of input.enchants ?? []) {
    const q = c.ENCHANT_QUALITY_FLOOR + (1 - c.ENCHANT_QUALITY_FLOOR) * (max0(e.quality) / 100);
    enchants += c.ENCHANT_SOCKET_POWER * q * (1 + c.ENCHANT_AMPLIFY_WEIGHT * max0(e.amplifyLevel));
  }
  const transcendence = c.TRANSCENDENCE_PER_NODE * max0(input.transcendenceNodeCount);
  // since 2.9.1 the pet term is the core's petV2TotalPower (fed through an Ancient-equivalent V1 pet)
  const pet = input.pet ? coreTotalPower(input.pet.rarity, input.pet.altarLevel, input.pet.tier) : 0;
  let mount = 0;
  if (input.mount) mount = nz(c.MOUNT_RARITY_POWER[input.mount.rarity]) * (1 + c.MOUNT_STAR_WEIGHT * max0(input.mount.stars - 1));
  let relics = 0;
  for (const r of input.relics ?? []) {
    relics += nz(c.RELIC_TIER_POWER[r.tier]) * (r.maxLevel > 0 ? Math.min(r.level, r.maxLevel) / r.maxLevel : 0);
  }
  const talents = c.TALENT_PER_POINT * max0(input.talentPointsSpent);
  const awakening = c.AWAKENING_PER_POINT * max0(input.awakeningPoints);
  const level = c.LEVEL_POWER * max0(input.level);
  const exact = { equipment, sigils, enchants, transcendence, pet, mount, relics, talents, awakening, level };
  const power = Math.round(POWER_TERMS.reduce((s, k) => s + exact[k], 0));
  return { power, terms: Object.fromEntries(POWER_TERMS.map((k) => [k, Math.round(exact[k])])), exact };
}

/** calculateTotalPower(input).power. */
export const calculateTotalPower = (input, config) => calculatePowerBreakdown(input, config).power;
