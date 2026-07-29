/**
 * petsData.js - static Companion (pet) catalogue, derived from the scraped
 * player database (EldarynTracker/eldaryn.db, `companions` +
 * `companion_secondary` tables). Same principle as relicsData.js/mountsData.js:
 * fixed game data lives in code; only the player's selection (which companion,
 * its rarity/tier/level, and chosen secondary rolls) is persisted.
 *
 * THE DERIVATIONS ARE IN docs/Reference/Notes/big-rework-v1-notes.md
 * ("Pet primary stats", "Pet secondary rolls", "Pet tier-1 / tier-2 pairs"):
 * the deterministic primary-stat curve and its tier multiplier, why
 * secondaries are ranges rather than curves, and how the pair structure lets
 * two unscraped companions inherit a partner's curve. Do not re-derive any of
 * it from eldaryn.db, and do not restate it here.
 *
 * The one thing to carry in your head while reading this file: a pet has NO
 * tier or level of its own. The character-wide Pet Altar tiers and levels the
 * entire collection at once, which is why every stat function here takes the
 * altar rather than the pet (data-model.md §1).
 */

import { offensiveStats } from './dps.js';
import { RARITIES } from './constants.js';

/**
 * Companion primary-stat curves. Field meanings:
 *   slope/icpt  tier-1-normalised linear fit (see the notes doc)
 *   rarity      drives the secondary-slot count and the card colour
 *   petTier     which Pet Altar tier the pet is OBTAINABLE at - 1 = only while
 *               the altar is tier 1, 2 = from altar tier 2 upwards
 *   pairId      links the two halves of each tier-1/tier-2 pair
 */
export const COMPANION_DEFS = [
  { id: 'ancientdrake', name: 'Ancient Drake', rarity: 'Ancient', petTier: 1, pairId: 'primaldrake', attack: { slope: 364.0, icpt: 4836.0 }, health: { slope: 1050.0, icpt: 13950.0 } },
  { id: 'astralgryphon', name: 'Astral Gryphon', rarity: 'Legendary', petTier: 2, pairId: 'celestialgryphon', attack: { slope: 161.0, icpt: 2139.0 }, health: { slope: 476.0, icpt: 6324.0 } },
  { id: 'astralseraph', name: 'Astral Seraph', rarity: 'Mythic', petTier: 1, pairId: 'starseraph', attack: { slope: 294.0, icpt: 3906.0 }, health: { slope: 665.0, icpt: 8835.0 } },
  { id: 'blazefox', name: 'Blaze Fox', rarity: 'Uncommon', petTier: 2, pairId: 'emberfox', attack: { slope: 35.0, icpt: 465.0 }, health: { slope: 52.6667, icpt: 697.0 } },
  { id: 'bloodwyvern', name: 'Blood Wyvern', rarity: 'Epic', petTier: 1, pairId: 'gorewyvern', attack: { slope: 91.0, icpt: 1209.0 }, health: { slope: 266.0, icpt: 3534.0 } },
  { id: 'celestialgryphon', name: 'Celestial Gryphon', rarity: 'Legendary', petTier: 1, pairId: 'astralgryphon', attack: { slope: 161.0, icpt: 2139.0 }, health: { slope: 476.0, icpt: 6324.0 } },
  { id: 'crystalserpent', name: 'Crystal Serpent', rarity: 'Rare', petTier: 1, pairId: 'prismnaga', attack: { slope: 36.4, icpt: 483.3 }, health: { slope: 210.0, icpt: 2790.0 } },
  { id: 'dustmite', name: 'Dust Mite', rarity: 'Common', petTier: 1, pairId: 'duststalker', attack: { slope: 16.8514, icpt: 222.6757 }, health: { slope: 24.4189, icpt: 325.4595 } },
  { id: 'duststalker', name: 'Dust Stalker', rarity: 'Common', petTier: 2, pairId: 'dustmite', attack: { slope: 16.6667, icpt: 223.3333 }, health: { slope: 24.3333, icpt: 325.6667 } },
  { id: 'elderphoenix', name: 'Elder Phoenix', rarity: 'Mythic', petTier: 1, pairId: 'sunphoenix', attack: { slope: 245.0, icpt: 3255.0 }, health: { slope: 700.0, icpt: 9300.0 } },
  { id: 'emberfox', name: 'Ember Fox', rarity: 'Uncommon', petTier: 1, pairId: 'blazefox', attack: { slope: 35.0, icpt: 465.0 }, health: { slope: 52.4762, icpt: 697.3571 } },
  { id: 'flametoad', name: 'Flame Toad', rarity: 'Common', petTier: 1, pairId: 'pyretoad', attack: { slope: 8.3, icpt: 111.5 }, health: { slope: 49.0, icpt: 651.0 } },
  { id: 'frostwyrm', name: 'Frost Wyrm', rarity: 'Legendary', petTier: 1, pairId: 'rimewyrm', attack: { slope: 112.0, icpt: 1488.0 }, health: { slope: 644.0, icpt: 8556.0 } },
  { id: 'gloombat', name: 'Gloom Bat', rarity: 'Uncommon', petTier: 1, pairId: 'gloomwing', attack: { slope: 19.5774, icpt: 260.1255 }, health: { slope: 112.0, icpt: 1488.0 } },
  // Never scraped - curve inherited from its tier-1 partner, Gloom Bat.
  { id: 'gloomwing', name: 'Gloomwing', rarity: 'Uncommon', petTier: 2, pairId: 'gloombat', attack: { slope: 19.5774, icpt: 260.1255 }, health: { slope: 112.0, icpt: 1488.0 } },
  { id: 'gorewyvern', name: 'Gore Wyvern', rarity: 'Epic', petTier: 2, pairId: 'bloodwyvern', attack: { slope: 91.0, icpt: 1209.0 }, health: { slope: 266.0, icpt: 3534.0 } },
  { id: 'helldrake', name: 'Hell Drake', rarity: 'Legendary', petTier: 2, pairId: 'infernaldrake', attack: { slope: 210.0, icpt: 2790.0 }, health: { slope: 308.0, icpt: 4092.0 } },
  { id: 'infernaldrake', name: 'Infernal Drake', rarity: 'Legendary', petTier: 1, pairId: 'helldrake', attack: { slope: 210.0, icpt: 2790.0 }, health: { slope: 308.0, icpt: 4092.0 } },
  { id: 'ironbastion', name: 'Iron Bastion', rarity: 'Epic', petTier: 2, pairId: 'irongolem', attack: { slope: 63.0, icpt: 837.0 }, health: { slope: 364.0, icpt: 4836.0 } },
  { id: 'irongolem', name: 'Iron Golem', rarity: 'Epic', petTier: 1, pairId: 'ironbastion', attack: { slope: 63.0, icpt: 837.0 }, health: { slope: 364.0, icpt: 4836.0 } },
  { id: 'mossbeetle', name: 'Moss Beetle', rarity: 'Common', petTier: 1, pairId: 'mosswarden', attack: { slope: 12.5, icpt: 167.3 }, health: { slope: 38.5, icpt: 511.3 } },
  { id: 'mosswarden', name: 'Moss Warden', rarity: 'Common', petTier: 2, pairId: 'mossbeetle', attack: { slope: 12.3333, icpt: 167.6667 }, health: { slope: 38.3333, icpt: 511.6667 } },
  { id: 'primaldrake', name: 'Primal Drake', rarity: 'Ancient', petTier: 2, pairId: 'ancientdrake', attack: { slope: 364.0, icpt: 4836.0 }, health: { slope: 1050.0, icpt: 13950.0 } },
  { id: 'prismnaga', name: 'Prism Naga', rarity: 'Rare', petTier: 2, pairId: 'crystalserpent', attack: { slope: 36.4, icpt: 483.4 }, health: { slope: 210.0, icpt: 2790.0 } },
  // Never scraped - curve inherited from its tier-1 partner, Flame Toad.
  { id: 'pyretoad', name: 'Pyre Toad', rarity: 'Common', petTier: 2, pairId: 'flametoad', attack: { slope: 8.3, icpt: 111.5 }, health: { slope: 49.0, icpt: 651.0 } },
  { id: 'rimewyrm', name: 'Rime Wyrm', rarity: 'Legendary', petTier: 2, pairId: 'frostwyrm', attack: { slope: 112.0, icpt: 1488.0 }, health: { slope: 644.0, icpt: 8556.0 } },
  { id: 'shadowlynx', name: 'Shadow Lynx', rarity: 'Rare', petTier: 1, pairId: 'umbralynx', attack: { slope: 50.4, icpt: 669.3 }, health: { slope: 147.0, icpt: 1953.0 } },
  { id: 'starseraph', name: 'Star Seraph', rarity: 'Mythic', petTier: 2, pairId: 'astralseraph', attack: { slope: 294.0, icpt: 3906.0 }, health: { slope: 665.0, icpt: 8835.0 } },
  { id: 'stormhawk', name: 'Storm Hawk', rarity: 'Rare', petTier: 1, pairId: 'stormraptor', attack: { slope: 66.5, icpt: 883.3 }, health: { slope: 98.0, icpt: 1302.0 } },
  { id: 'stormraptor', name: 'Storm Raptor', rarity: 'Rare', petTier: 2, pairId: 'stormhawk', attack: { slope: 66.5, icpt: 883.3 }, health: { slope: 98.0, icpt: 1302.0 } },
  { id: 'sunphoenix', name: 'Sun Phoenix', rarity: 'Mythic', petTier: 2, pairId: 'elderphoenix', attack: { slope: 245.0, icpt: 3255.0 }, health: { slope: 700.0, icpt: 9300.0 } },
  { id: 'thornbacklizard', name: 'Thornback Lizard', rarity: 'Uncommon', petTier: 1, pairId: 'thornfang', attack: { slope: 26.55, icpt: 353.3 }, health: { slope: 84.0, icpt: 1116.0 } },
  // Listed as "Thornfang Lizard" in the rarity table; the short catalogue name
  // is kept because the id is persisted and the art file matches it.
  { id: 'thornfang', name: 'Thornfang', rarity: 'Uncommon', petTier: 2, pairId: 'thornbacklizard', attack: { slope: 26.55, icpt: 353.3 }, health: { slope: 84.0, icpt: 1116.0 } },
  { id: 'umbralynx', name: 'Umbra Lynx', rarity: 'Rare', petTier: 2, pairId: 'shadowlynx', attack: { slope: 50.4, icpt: 669.3 }, health: { slope: 147.0, icpt: 1953.0 } },
  { id: 'voidspider', name: 'Void Spider', rarity: 'Epic', petTier: 1, pairId: 'voidweaver', attack: { slope: 119.0, icpt: 1581.0 }, health: { slope: 175.0, icpt: 2325.0 } },
  { id: 'voidweaver', name: 'Void Weaver', rarity: 'Epic', petTier: 2, pairId: 'voidspider', attack: { slope: 119.0, icpt: 1581.0 }, health: { slope: 175.0, icpt: 2325.0 } },
];

export const COMPANION_MAX_TIER = 10;
export const COMPANION_MAX_LEVEL = 50;

/**
 * Base ATK/HP multiplier for a Pet Altar tier.
 *
 *   multiplier(tier) = tier^2 - tier + 1     ->  1, 3, 7, 13, 21, 31, 43, 57, 73, 91
 *
 * Derived from the Evolve Rebalance patch notes, which published five of these
 * (T2 x3, T3 x7, T4 x13, T6 x31, T8 x57) but not T5 or T7. The published
 * values have first differences 2, 4, 6, ... - a constant SECOND difference of
 * 2, which is exactly a quadratic - and t^2-t+1 reproduces all five with zero
 * residual while also giving the required T1 x1. So T5 = x21 and T7 = x43 are
 * derived, not guessed: five points over-determine a three-parameter curve.
 *
 * Replaces the old exponential 3^(tier-1). Only the BASE ATK/HP multiplier
 * changed - secondary rolls never scaled with tier and still don't.
 */
export function companionTierMultiplier(tier) {
  const t = Math.max(1, Math.min(Math.round(Number(tier)) || 1, COMPANION_MAX_TIER));
  return t * t - t + 1;
}

/**
 * Which companions can be obtained at a given Pet Altar tier. Tier-1 pets are
 * only available while the altar is tier 1; from tier 2 up you can only get
 * the tier-2 pets. (Raising the altar tier wipes the collection - see
 * rosterStore.setPetAltarTier - so this is also what a rebuilt collection can
 * be drawn from.)
 *
 * Ordered by rarity ASCENDING (Common first, Ancient last) then by name, which
 * is the order the Add Pet dropdown wants - it matches how the game lists them
 * and puts the pets you can realistically get at the top.
 */
export function companionsForAltarTier(altarTier) {
  const wanted = (Math.round(Number(altarTier)) || 1) <= 1 ? 1 : 2;
  return COMPANION_DEFS.filter((d) => d.petTier === wanted).toSorted(
    (a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || a.name.localeCompare(b.name),
  );
}

const COMPANION_BY_ID = new Map(COMPANION_DEFS.map((d) => [d.id, d]));

/** Look up a companion def by id (null if unknown). */
export function companionById(id) {
  return COMPANION_BY_ID.get(id) || null;
}

/**
 * A companion's derived primary stat at a given tier/level.
 * `statKey` is 'attack' or 'health'. Returns a rounded integer, matching the
 * in-game display. Tier/level are clamped to the valid ranges.
 */
export function companionStat(def, statKey, tier, level) {
  if (!def) return 0;
  const curve = def[statKey];
  if (!curve) return 0;
  const l = Math.max(1, Math.min(Math.round(level) || 1, COMPANION_MAX_LEVEL));
  return Math.round(companionTierMultiplier(tier) * (curve.slope * l + curve.icpt));
}

/**
 * The pool of secondary stats a companion can roll, with the observed global
 * min..max range and slider step. statKey references STAT_FIELDS (constants.js).
 * Crit Damage (crit_mult) steps by 1; every other secondary steps by 0.1.
 * Ranges are the empirical envelope across all scraped companions.
 *
 * A `manual: true` entry has NO trustworthy envelope (its roll was rescaled by
 * a patch and never re-sourced), so it carries no `max`, renders as a typed
 * field instead of a slider, and is only sanitised - never clamped upward.
 */
export const SECONDARY_STAT_RANGES = [
  { statKey: 'attack_pct', label: 'Attack %', min: 0.1, max: 21.0, step: 0.1 },
  { statKey: 'health_pct', label: 'Health %', min: 0.1, max: 22.6, step: 0.1 },
  { statKey: 'crit', label: 'Crit Chance', min: 0.1, max: 7.3, step: 0.1 },
  { statKey: 'crit_mult', label: 'Crit Damage', min: 1, max: 48, step: 1 },
  { statKey: 'double_hit', label: 'Double Hit', min: 1.0, max: 12.1, step: 0.1 },
  { statKey: 'speed', label: 'Attack Speed', min: 0.1, max: 32.0, step: 0.1 },
  { statKey: 'lifesteal', label: 'Lifesteal', min: 0.2, max: 12.1, step: 0.1 },
  // Manual since the Penetration Rework rescaled this roll: the old 0.1..14.6
  // envelope was scraped pre-patch and the new one hasn't been re-sourced, so
  // type whatever the game shows rather than sliding within a stale range.
  { statKey: 'penetration', label: 'Penetration', min: 0, step: 0.1, manual: true },
  { statKey: 'hp_regen', label: 'HP Regen', min: 0.1, max: 5.2, step: 0.1 },
  { statKey: 'spell_damage', label: 'Spell Damage', min: 2.6, max: 30.7, step: 0.1 },
  { statKey: 'block_chance', label: 'Block Chance', min: 1.0, max: 5.6, step: 0.1 },
  { statKey: 'dmg_reduction', label: 'DMG Reduction', min: 0.5, max: 6.1, step: 0.1 },
  { statKey: 'spell_resist', label: 'Spell Resist', min: 1.0, max: 11.1, step: 0.1 },
  { statKey: 'miss_chance', label: 'Miss Chance', min: 0.4, max: 7.7, step: 0.1 },
  { statKey: 'blind_chance', label: 'Blind Chance', min: 0.1, max: 7.3, step: 0.1 },
  { statKey: 'paralyze_chance', label: 'Paralyze Chance', min: 0.2, max: 1.2, step: 0.1 },
];

const SECONDARY_BY_KEY = new Map(SECONDARY_STAT_RANGES.map((s) => [s.statKey, s]));

/** Range/step descriptor for a secondary statKey (null if it isn't a pet secondary). */
export function secondaryRange(statKey) {
  return SECONDARY_BY_KEY.get(statKey) || null;
}

/**
 * How many secondary-stat slots a pet of the given rarity has.
 * Common = 1; Uncommon..Legendary = 2; Mythic and above = 3.
 */
export const PET_SECONDARY_SLOTS_BY_RARITY = {
  Common: 1,
  Uncommon: 2,
  Rare: 2,
  Epic: 2,
  Legendary: 2,
  Mythic: 3,
  Ancient: 3,
  Divine: 3,
  Eternal: 3,
};

/** Secondary-slot count for a rarity (defaults to 1 for unknown rarities). */
export function petSecondarySlots(rarity) {
  return PET_SECONDARY_SLOTS_BY_RARITY[rarity] ?? 1;
}

/**
 * A pet's rarity. It is catalogue data now, not a user choice - only a custom
 * (companionId-less) pet still carries its own, defaulting to Common.
 */
export function petRarity(pet) {
  const def = pet?.companionId ? companionById(pet.companionId) : null;
  return def?.rarity ?? pet?.rarity ?? 'Common';
}

/** Secondary-slot count for a pet, via its catalogue rarity. */
export function petSlotsFor(pet) {
  return petSecondarySlots(petRarity(pet));
}

/**
 * Clamp a secondary value to its stat's range and quantise to its step.
 * A `manual` stat has no upper bound to clamp against, so it is only floored
 * at its min and rounded - the typed number survives verbatim.
 */
export function clampSecondaryValue(statKey, value) {
  const r = SECONDARY_BY_KEY.get(statKey);
  if (!r) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return r.min;
  if (r.manual) return Math.max(r.min, Math.round(n * 1000) / 1000);
  const clamped = Math.max(r.min, Math.min(n, r.max));
  const steps = Math.round((clamped - r.min) / r.step);
  return Math.round((r.min + steps * r.step) * 1000) / 1000;
}

/**
 * Resolve a persisted PetEntry to its full OffensiveStats contribution.
 *
 * Tier and level are the CHARACTER-WIDE Pet Altar's, not the pet's: the altar
 * tiers and levels every pet together, so they are passed in rather than read
 * off the entry. Custom/legacy pets (companionId null) still fall back to
 * their hand-entered `stats`.
 */
export function petStats(pet, altar) {
  const def = pet?.companionId ? companionById(pet.companionId) : null;
  if (!def) return offensiveStats(pet?.stats || {});
  const tier = altar?.tier ?? 1;
  const level = altar?.level ?? 1;
  const overrides = {
    attack: companionStat(def, 'attack', tier, level),
    health: companionStat(def, 'health', tier, level),
  };
  for (const s of pet.secondaries || []) {
    if (!secondaryRange(s?.statKey)) continue;
    overrides[s.statKey] = (overrides[s.statKey] || 0) + (Number(s.value) || 0);
  }
  return offensiveStats(overrides);
}
