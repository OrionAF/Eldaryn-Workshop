import { it, expect } from 'vitest';
import { tankMetrics, tankScoreFromTotals, createTankObjective, TANK_PROFILES } from './tankObjective.js';
import { offensiveStats, computeHps } from './dps.js';
import { newCharacter } from './model.js';
import { optimize, SEARCH_DIMENSIONS } from './optimizer.js';

// --- tankMetrics ------------------------------------------------------------

it('tankMetrics: EHP divides by what DMG Reduction lets through; sustain divides self-HPS by the landed fraction', () => {
  const totals = offensiveStats({ health: 10000, dmg_reduction: 50, block_chance: 50, hp_regen: 10 });
  const m = tankMetrics(totals);
  expect(m.ehp).toBeCloseTo(20000); // 10000 / (1 - 0.5)
  expect(m.selfHps).toBeCloseTo(1000); // 10% of max health per second, no lifesteal (attack 0)
  expect(m.landedFraction).toBeCloseTo(0.25); // (1 - 0.5) * (1 - 0.5)
  expect(m.sustainDps).toBeCloseTo(4000); // out-heals a 4000 raw DPS stream
});

it('tankMetrics: Block improves sustain but never EHP (spikes/abilities may be unblockable)', () => {
  const noBlock = tankMetrics(offensiveStats({ health: 10000, dmg_reduction: 50, hp_regen: 10 }));
  const block = tankMetrics(offensiveStats({ health: 10000, dmg_reduction: 50, block_chance: 80, hp_regen: 10 }));
  expect(block.ehp).toBeCloseTo(noBlock.ehp);
  expect(block.sustainDps).toBeGreaterThan(noBlock.sustainDps);
});

it('tankMetrics: lifesteal sustain flows in through computeHps (scales with own DPS)', () => {
  const totals = offensiveStats({ health: 10000, attack: 500, speed: 100, lifesteal: 10, dmg_reduction: 20 });
  const m = tankMetrics(totals);
  expect(m.selfHps).toBeCloseTo(computeHps(totals).total_hps);
  expect(m.selfHps).toBeGreaterThan(0);
  expect(m.sustainDps).toBeCloseTo(m.selfHps / 0.8);
});

it('tankScoreFromTotals is the geometric blend of the tankMetrics pair', () => {
  const totals = offensiveStats({ health: 10000, dmg_reduction: 50, hp_regen: 10 });
  const m = tankMetrics(totals);
  expect(tankScoreFromTotals(totals, 0.5)).toBeCloseTo(Math.sqrt((1 + m.ehp) * (1 + m.sustainDps)));
  expect(tankScoreFromTotals(totals, 1)).toBeCloseTo(1 + m.ehp);
  expect(tankScoreFromTotals(totals, 0)).toBeCloseTo(1 + m.sustainDps);
});

// --- createTankObjective ------------------------------------------------------

function warriorWith(gear) {
  const c = newCharacter('Tank Tester');
  c.class = 'Warrior';
  c.loadouts[0].gear.Chest = { ...c.loadouts[0].gear.Chest, ...gear };
  return c;
}

it('ehpWeight=1 ranks the bigger HP pool first; ehpWeight=0 ranks the sustain build first', () => {
  const hpChar = warriorWith({ health: 50000 });
  const sustainChar = warriorWith({ health: 10000, hp_regen: 10 });

  const pureEhp = createTankObjective({ ehpWeight: 1 });
  const pureSustain = createTankObjective({ ehpWeight: 0 });

  expect(pureEhp(hpChar, hpChar.presets[0])).toBeGreaterThan(pureEhp(sustainChar, sustainChar.presets[0]));
  expect(pureSustain(sustainChar, sustainChar.presets[0])).toBeGreaterThan(pureSustain(hpChar, hpChar.presets[0]));
});

it('TANK_PROFILES expose valid ehpWeights and the objective clamps out-of-range weights', () => {
  for (const p of TANK_PROFILES) {
    expect(p.ehpWeight).toBeGreaterThanOrEqual(0);
    expect(p.ehpWeight).toBeLessThanOrEqual(1);
  }
  const c = warriorWith({ health: 10000, hp_regen: 5 });
  const clamped = createTankObjective({ ehpWeight: 7 })(c, c.presets[0]);
  const atOne = createTankObjective({ ehpWeight: 1 })(c, c.presets[0]);
  expect(clamped).toBeCloseTo(atOne);
});

// --- integration with optimize() ---------------------------------------------

it('optimize() with the tank objective picks the survivability loadout where the DPS objective would not', async () => {
  const character = newCharacter('Tank Warrior');
  character.class = 'Warrior';
  character.loadouts[0].gear.Weapon.attack = 1000; // pure damage
  character.loadouts[1].gear.Weapon.health = 20000; // pure survivability
  character.loadouts[1].gear.Weapon.hp_regen = 10;
  const preset = character.presets[0];
  preset.loadout = 0; // currently running the DPS loadout

  const onlyLoadouts = Object.fromEntries(SEARCH_DIMENSIONS.map((d) => [d.key, d.key === 'loadouts']));
  const result = await optimize({
    character,
    preset,
    objective: createTankObjective({ ehpWeight: 0.5 }),
    searchDimensions: onlyLoadouts,
  });

  expect(result.best.candidate.preset.loadout).toBe(1);
  expect(result.best.score).toBeGreaterThan(result.baseline.score);
});
