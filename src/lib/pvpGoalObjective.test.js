import { it, expect } from 'vitest';
import {
  pvpFactorMetrics,
  pvpGoalScoreFromTotals,
  createPvpGoalObjective,
  REF_BLOCK,
  REF_PEN,
  REF_MISS,
  REF_SPELL_SHARE,
} from './pvpGoalObjective.js';
import { offensiveStats, computeDps, computeHps, pvpEffect } from './dps.js';
import { PVP_HEALTH_MULTIPLIER } from './pvpSimulation.js';
import { newCharacter } from './model.js';
import { optimize, SEARCH_DIMENSIONS } from './optimizer.js';

// --- Maximum Damage ---------------------------------------------------------

it('maxDamage: with no crit/pen/pvp_attack it is computeDps scaled by the reference-block miss of damage', () => {
  const totals = offensiveStats({ attack: 1000, speed: 100 });
  const m = pvpFactorMetrics(totals);
  expect(m.maxDamage).toBeCloseTo((1 - REF_BLOCK) * computeDps(totals));
});

it('maxDamage: Penetration recovers part of the reference-blocked share', () => {
  const noPen = pvpFactorMetrics(offensiveStats({ attack: 1000, speed: 100 })).maxDamage;
  const pen = pvpFactorMetrics(offensiveStats({ attack: 1000, speed: 100, penetration: 60 })).maxDamage;
  expect(pen).toBeGreaterThan(noPen);
  // Full 100% pen with no crit would exactly cancel the block loss.
  const fullPen = pvpFactorMetrics(offensiveStats({ attack: 1000, speed: 100, penetration: 100 })).maxDamage;
  expect(fullPen).toBeCloseTo(computeDps(offensiveStats({ attack: 1000, speed: 100, penetration: 100 })));
});

it('maxDamage: PVP Attack multiplies through the duel chain r/(r+200)', () => {
  const base = pvpFactorMetrics(offensiveStats({ attack: 1000, speed: 100 })).maxDamage;
  const buffed = pvpFactorMetrics(offensiveStats({ attack: 1000, speed: 100, pvp_attack: 200 })).maxDamage;
  expect(buffed / base).toBeCloseTo(1 + pvpEffect(200) / 100); // 200/(200+200) = +50%
});

it('maxDamage: the sigilActiveDps increment is added unscaled by block (spells are unblockable)', () => {
  const totals = offensiveStats({ attack: 1000, speed: 100 });
  const withSigils = pvpFactorMetrics(totals, { sigilActiveDps: 500 });
  const without = pvpFactorMetrics(totals);
  expect(withSigils.maxDamage - without.maxDamage).toBeCloseTo(500);
});

// --- Damage Mitigation ------------------------------------------------------

it('mitigation: exactly 1 with no defensive stats (the whole stream lands)', () => {
  const m = pvpFactorMetrics(offensiveStats({ attack: 1000, health: 10000 }));
  expect(m.mitigation).toBeCloseTo(1);
  expect(m.landedFraction).toBeCloseTo(1);
});

it('mitigation: a worked example composes miss-free block/DR/spell-resist layers', () => {
  const m = pvpFactorMetrics(offensiveStats({ block_chance: 50, dmg_reduction: 20, spell_resist: 40 }));
  // swings: (1 - 0.5*(1 - REF_PEN)) * 0.8 ; spells: 0.6 * 0.8
  const swingLanded = (1 - 0.5 * (1 - REF_PEN)) * 0.8;
  const spellLanded = 0.6 * 0.8;
  expect(m.landedFraction).toBeCloseTo((1 - REF_SPELL_SHARE) * swingLanded + REF_SPELL_SHARE * spellLanded);
  expect(m.mitigation).toBeCloseTo(1 / m.landedFraction);
});

it('mitigation: every defensive stat raises it monotonically', () => {
  // speed 100 so the blind/paralyze proc rate is nonzero.
  const base = pvpFactorMetrics(offensiveStats({ speed: 100 })).mitigation;
  for (const key of ['miss_chance', 'blind_chance', 'paralyze_chance', 'block_chance', 'dmg_reduction', 'spell_resist', 'pvp_defense']) {
    const m = pvpFactorMetrics(offensiveStats({ speed: 100, [key]: 20 })).mitigation;
    expect(m, key).toBeGreaterThan(base);
  }
});

it('mitigation: Attack Speed buys mitigation through Blind/Paralyze uptime, and only then', () => {
  const slowNoBlind = pvpFactorMetrics(offensiveStats({ speed: 100 })).mitigation;
  const fastNoBlind = pvpFactorMetrics(offensiveStats({ speed: 300 })).mitigation;
  expect(fastNoBlind).toBeCloseTo(slowNoBlind); // no control stats - speed is worthless here

  const slowBlind = pvpFactorMetrics(offensiveStats({ speed: 100, blind_chance: 30 })).mitigation;
  const fastBlind = pvpFactorMetrics(offensiveStats({ speed: 300, blind_chance: 30 })).mitigation;
  expect(fastBlind).toBeGreaterThan(slowBlind);

  const slowPara = pvpFactorMetrics(offensiveStats({ speed: 100, paralyze_chance: 8 })).mitigation;
  const fastPara = pvpFactorMetrics(offensiveStats({ speed: 300, paralyze_chance: 8 })).mitigation;
  expect(fastPara).toBeGreaterThan(slowPara);
});

it('mitigation: the reference miss discounts my proc rate (REF_MISS enemy dodge)', () => {
  // Sanity on the constant itself, so a tuning change is a conscious test edit.
  expect(REF_MISS).toBeGreaterThan(0);
  expect(REF_MISS).toBeLessThan(0.5);
});

// --- Survivability ----------------------------------------------------------

it('survivability: the 8x PVP pool plus 30s of un-multiplied self-healing', () => {
  const totals = offensiveStats({ health: 10000, hp_regen: 10 });
  const m = pvpFactorMetrics(totals);
  // Regen only: unconditional and pool-proportional, so it is health*regen/100
  // regardless of how the lifesteal term is derived.
  expect(m.selfHps).toBeCloseTo(1000);
  // Pool x8 (pvpSimulation's PVP multiplier), healing left at 1x - the game
  // sizes HP Regen off ORIGINAL max HP, so a Health point now buys 8x what it
  // used to relative to a point of recovery.
  expect(m.survivability).toBeCloseTo(PVP_HEALTH_MULTIPLIER * 10000 + 1000 * 30);
});

it('survivability: lifesteal (and thus Attack Speed) contributes through own DPS', () => {
  const slow = pvpFactorMetrics(offensiveStats({ health: 10000, attack: 1000, lifesteal: 10, speed: 100 }));
  const fast = pvpFactorMetrics(offensiveStats({ health: 10000, attack: 1000, lifesteal: 10, speed: 200 }));
  expect(fast.survivability).toBeGreaterThan(slow.survivability);
});

// --- Lifesteal leeches off post-chain swing damage, not raw DPS -------------

it('selfHps: lifesteal leeches off the SAME swing damage the damage factor reports, not raw computeDps', () => {
  // Penetration 0 => the whole reference block is eaten; pvp_attack 200 => x1.5.
  const totals = offensiveStats({ health: 10000, attack: 1000, speed: 100, lifesteal: 20 });
  const m = pvpFactorMetrics(totals);
  const swing = (1 - REF_BLOCK) * computeDps(totals);
  expect(m.selfHps).toBeCloseTo(swing * 0.2);
  // The old, undefended form over-credited by exactly the block loss.
  expect(m.selfHps).toBeLessThan(computeHps(totals).total_hps);
  expect(computeHps(totals).total_hps / m.selfHps).toBeCloseTo(1 / (1 - REF_BLOCK));
});

it('selfHps: Penetration and PVP Attack raise lifesteal, because they raise landed damage', () => {
  const base = offensiveStats({ health: 10000, attack: 1000, speed: 100, lifesteal: 20 });
  const withPen = pvpFactorMetrics(offensiveStats({ ...base, penetration: 100 })).selfHps;
  const withPvpAtk = pvpFactorMetrics(offensiveStats({ ...base, pvp_attack: 200 })).selfHps;
  const plain = pvpFactorMetrics(base).selfHps;
  expect(withPen).toBeCloseTo(plain / (1 - REF_BLOCK));
  expect(withPvpAtk).toBeCloseTo(plain * (1 + pvpEffect(200) / 100));
});

it('selfHps: sigil damage does NOT lifesteal (pureDamage bypasses onLandedHit in the duel engine)', () => {
  const totals = offensiveStats({ health: 10000, attack: 1000, speed: 100, lifesteal: 20 });
  const without = pvpFactorMetrics(totals).selfHps;
  const withSigils = pvpFactorMetrics(totals, { sigilActiveDps: 5000 }).selfHps;
  expect(withSigils).toBeCloseTo(without);
});

// --- The blend --------------------------------------------------------------

it('pvpGoalScoreFromTotals: extreme sliders reduce to single-factor ranking', () => {
  const totals = offensiveStats({ attack: 1000, health: 10000, block_chance: 40 });
  const m = pvpFactorMetrics(totals);
  expect(pvpGoalScoreFromTotals(totals, { damage: 100, mitigation: 0, survivability: 0 })).toBeCloseTo(1 + m.maxDamage);
  expect(pvpGoalScoreFromTotals(totals, { damage: 0, mitigation: 100, survivability: 0 })).toBeCloseTo(1 + m.mitigation);
  expect(pvpGoalScoreFromTotals(totals, { damage: 0, mitigation: 0, survivability: 100 })).toBeCloseTo(1 + m.survivability);
});

it('pvpGoalScoreFromTotals: the balanced blend is the weighted geometric mean; garbage weights fall back to even', () => {
  const totals = offensiveStats({ attack: 1000, health: 10000 });
  const m = pvpFactorMetrics(totals);
  const even = Math.cbrt((1 + m.maxDamage) * (1 + m.mitigation) * (1 + m.survivability));
  const seeded =
    Math.pow(1 + m.maxDamage, 0.34) * Math.pow(1 + m.mitigation, 0.33) * Math.pow(1 + m.survivability, 0.33);
  expect(pvpGoalScoreFromTotals(totals, { damage: 34, mitigation: 33, survivability: 33 })).toBeCloseTo(seeded);
  expect(pvpGoalScoreFromTotals(totals, null)).toBeCloseTo(even);
  expect(pvpGoalScoreFromTotals(totals, { damage: -5, mitigation: 0, survivability: 0 })).toBeCloseTo(even);
});

it('slider direction flips which of two builds ranks higher', () => {
  const glassCannon = offensiveStats({ attack: 5000, speed: 200, crit: 50, crit_mult: 250, health: 5000 });
  const fortress = offensiveStats({ attack: 500, health: 100000, hp_regen: 20, dmg_reduction: 30 });
  const dmgW = { damage: 100, mitigation: 0, survivability: 0 };
  const survW = { damage: 0, mitigation: 20, survivability: 80 };
  expect(pvpGoalScoreFromTotals(glassCannon, dmgW)).toBeGreaterThan(pvpGoalScoreFromTotals(fortress, dmgW));
  expect(pvpGoalScoreFromTotals(fortress, survW)).toBeGreaterThan(pvpGoalScoreFromTotals(glassCannon, survW));
});

// --- createPvpGoalObjective + optimize() -------------------------------------

it('optimize() under damage-heavy vs survivability-heavy weights picks opposite loadouts', async () => {
  const character = newCharacter('PVP Sentinel');
  character.class = 'Sentinel';
  character.loadouts[0].gear.Weapon.attack = 2000; // pure damage
  character.loadouts[1].gear.Weapon.health = 50000; // pure survivability
  character.loadouts[1].gear.Weapon.hp_regen = 10;
  const preset = character.presets[0];

  const onlyLoadouts = Object.fromEntries(SEARCH_DIMENSIONS.map((d) => [d.key, d.key === 'loadouts']));
  const run = (weights, startLoadout) => {
    preset.loadout = startLoadout;
    return optimize({
      character,
      preset,
      objective: createPvpGoalObjective({ weights }),
      searchDimensions: onlyLoadouts,
    });
  };

  const dmgResult = await run({ damage: 100, mitigation: 0, survivability: 0 }, 1);
  expect(dmgResult.best.candidate.preset.loadout).toBe(0);

  const survResult = await run({ damage: 0, mitigation: 0, survivability: 100 }, 0);
  expect(survResult.best.candidate.preset.loadout).toBe(1);
});
