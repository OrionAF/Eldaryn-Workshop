import { describe, it, expect } from 'vitest';
import {
  COMPANION_DEFS,
  companionById,
  companionStat,
  petStats,
  SECONDARY_STAT_RANGES,
  secondaryRange,
  petSecondarySlots,
  clampSecondaryValue,
  companionsForAltarTier,
  companionTierMultiplier,
  COMPANION_MAX_TIER,
} from './petsData.js';
import { RARITIES } from './constants.js';

describe('companion primary-stat curves', () => {
  it('has 36 companions with unique ids - 18 tier-1/tier-2 pairs', () => {
    expect(COMPANION_DEFS.length).toBe(36);
    expect(new Set(COMPANION_DEFS.map((d) => d.id)).size).toBe(36);
  });

  it('every companion pairs with exactly one partner across the tier split', () => {
    const byId = new Map(COMPANION_DEFS.map((d) => [d.id, d]));
    for (const def of COMPANION_DEFS) {
      const partner = byId.get(def.pairId);
      expect(partner, `${def.id} has no partner`).toBeTruthy();
      expect(partner.pairId).toBe(def.id); // links both ways
      expect(partner.petTier).not.toBe(def.petTier); // one per tier
      expect(partner.rarity).toBe(def.rarity); // a pair shares its rarity
    }
    expect(COMPANION_DEFS.filter((d) => d.petTier === 1)).toHaveLength(18);
    expect(COMPANION_DEFS.filter((d) => d.petTier === 2)).toHaveLength(18);
  });

  it('pair members share one stat curve, so the tier-2 half of an unscraped pair is safe', () => {
    const byId = new Map(COMPANION_DEFS.map((d) => [d.id, d]));
    // Pyre Toad and Gloomwing were never scraped; they inherit their partner's.
    for (const id of ['pyretoad', 'gloomwing']) {
      const def = byId.get(id);
      const partner = byId.get(def.pairId);
      expect(def.attack).toEqual(partner.attack);
      expect(def.health).toEqual(partner.health);
    }
  });

  it('offers only tier-1 pets at altar tier 1, and only tier-2 pets above it', () => {
    expect(companionsForAltarTier(1).every((d) => d.petTier === 1)).toBe(true);
    expect(companionsForAltarTier(2).every((d) => d.petTier === 2)).toBe(true);
    expect(companionsForAltarTier(6).every((d) => d.petTier === 2)).toBe(true);
    expect(companionsForAltarTier(1)).toHaveLength(18);
  });

  it('orders the offer by rarity ascending - Common first, Ancient last', () => {
    for (const tier of [1, 2]) {
      const ranks = companionsForAltarTier(tier).map((d) => RARITIES.indexOf(d.rarity));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
    const tier1 = companionsForAltarTier(1);
    expect(tier1[0].rarity).toBe('Common');
    expect(tier1[tier1.length - 1].rarity).toBe('Ancient');
    // Ties break by name, so the order is stable and readable.
    const commons = tier1.filter((d) => d.rarity === 'Common').map((d) => d.name);
    expect(commons).toEqual([...commons].sort());
  });

  it('reproduces known scraped rows exactly (Ancient Drake tier 1)', () => {
    const def = companionById('ancientdrake');
    // From eldaryn.db: tier 1, level 50 => attack 23036, health 66450.
    expect(companionStat(def, 'attack', 1, 50)).toBe(23036);
    expect(companionStat(def, 'health', 1, 50)).toBe(66450);
    expect(companionStat(def, 'attack', 1, 46)).toBe(21580);
  });

  it('reproduces every tier multiplier the Evolve Rebalance published', () => {
    // Five published values; T5 and T7 were not given and are derived from the
    // quadratic they pin (constant second difference of 2).
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(companionTierMultiplier)).toEqual([
      1, 3, 7, 13, 21, 31, 43, 57, 73, 91,
    ]);
  });

  it('scales base Attack/Health by the tier multiplier (Astral Gryphon)', () => {
    const def = companionById('astralgryphon');
    // The scraped tier-1 row is the fit; tier 3 is now x7, not x9.
    const tier1Attack = companionStat(def, 'attack', 1, 10);
    expect(companionStat(def, 'attack', 3, 10)).toBe(tier1Attack * 7);
    expect(companionStat(def, 'health', 3, 10)).toBe(companionStat(def, 'health', 1, 10) * 7);
    // Tier 2 is unchanged by the rebalance - still exactly x3.
    expect(companionStat(def, 'attack', 2, 10)).toBe(tier1Attack * 3);
  });

  it('grows gently now - tier 8 is x57, not the old x2187', () => {
    const def = companionById('astralgryphon');
    const tier1 = companionStat(def, 'attack', 1, 10);
    expect(companionStat(def, 'attack', 8, 10)).toBe(tier1 * 57);
    // Each step up is a smaller RELATIVE gain than the last, which is the
    // whole point of the rebalance.
    const ratio = (t) => companionTierMultiplier(t) / companionTierMultiplier(t - 1);
    for (let t = 3; t <= COMPANION_MAX_TIER; t += 1) expect(ratio(t)).toBeLessThan(ratio(t - 1));
  });

  it('clamps tier/level into the valid range', () => {
    const def = companionById('primaldrake');
    expect(companionStat(def, 'attack', 0, 0)).toBe(companionStat(def, 'attack', 1, 1));
    expect(companionStat(def, 'attack', 99, 99)).toBe(companionStat(def, 'attack', COMPANION_MAX_TIER, 50));
    expect(companionTierMultiplier(0)).toBe(1);
    expect(companionTierMultiplier(99)).toBe(companionTierMultiplier(COMPANION_MAX_TIER));
  });

  it('returns 0 for an unknown companion', () => {
    expect(companionById('nope')).toBeNull();
    expect(companionStat(null, 'attack', 1, 1)).toBe(0);
  });
});

describe('petStats resolver', () => {
  it('derives Attack/Health for a catalogue pet and adds secondaries', () => {
    const pet = {
      id: 'p1',
      companionId: 'ancientdrake',
      rarity: 'Ancient',
      secondaries: [{ statKey: 'attack_pct', value: 12.5 }, { statKey: 'crit_mult', value: 30 }],
      stats: {},
    };
    // Tier/level come from the Pet Altar, not the pet.
    const s = petStats(pet, { tier: 1, level: 50 });
    expect(s.attack).toBe(23036);
    expect(s.health).toBe(66450);
    expect(s.attack_pct).toBe(12.5);
    expect(s.crit_mult).toBe(30);
  });

  it('falls back to hand-entered stats for a custom pet', () => {
    const pet = { id: 'p2', companionId: null, stats: { attack: 999, crit: 5 } };
    const s = petStats(pet);
    expect(s.attack).toBe(999);
    expect(s.crit).toBe(5);
  });
});

describe('secondary stat ranges', () => {
  it('covers 16 stats, Crit Damage stepping by 1 and the rest by 0.1', () => {
    expect(SECONDARY_STAT_RANGES.length).toBe(16);
    expect(secondaryRange('crit_mult').step).toBe(1);
    expect(secondaryRange('attack_pct').step).toBe(0.1);
    expect(secondaryRange('not_a_stat')).toBeNull();
  });

  it('clamps and quantises secondary values to the range/step', () => {
    expect(clampSecondaryValue('attack_pct', 999)).toBe(21.0);
    expect(clampSecondaryValue('attack_pct', -5)).toBe(0.1);
    expect(clampSecondaryValue('crit_mult', 30.7)).toBe(31);
  });

  it('leaves a manual secondary unclamped above - only floored and rounded', () => {
    const pen = secondaryRange('penetration');
    expect(pen.manual).toBe(true);
    expect(pen.max).toBeUndefined();
    // Well past the old scraped 14.6 envelope: the typed number survives.
    expect(clampSecondaryValue('penetration', 40)).toBe(40);
    expect(clampSecondaryValue('penetration', 3.27)).toBe(3.27);
    expect(clampSecondaryValue('penetration', -5)).toBe(0);
    expect(clampSecondaryValue('penetration', 'nope')).toBe(0);
  });

  it('slots per rarity: Common 1, Uncommon-Legendary 2, Mythic+ 3', () => {
    expect(petSecondarySlots('Common')).toBe(1);
    expect(petSecondarySlots('Uncommon')).toBe(2);
    expect(petSecondarySlots('Legendary')).toBe(2);
    expect(petSecondarySlots('Mythic')).toBe(3);
    expect(petSecondarySlots('Eternal')).toBe(3);
  });
});
