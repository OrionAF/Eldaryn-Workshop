import { it, expect } from 'vitest';
import { ARCHETYPES_BY_CLASS, scaleArchetype, archetypeVariants, generateGauntlet } from './pvpArchetypes.js';
import { STAT_FIELDS } from './constants.js';

const capOf = (key) => STAT_FIELDS.find((f) => f.key === key)?.cap;

it('scaleArchetype splits the budget into Attack/Health and keeps class-inappropriate stats at zero', () => {
  const berserker = ARCHETYPES_BY_CLASS.Warrior[0];
  const opp = scaleArchetype(berserker, 'Warrior', 100000);
  expect(opp.class).toBe('Warrior');
  expect(opp.stats.attack).toBe(Math.round(100000 * berserker.attackShare));
  expect(opp.stats.health).toBe(Math.round(100000 * berserker.healthShare));
  expect(opp.stats.attack + opp.stats.health).toBe(100000);
  // A Warrior archetype never sets Sentinel-only control stats.
  expect(opp.stats.miss_chance).toBe(0);
  expect(opp.stats.blind_chance).toBe(0);
  expect(opp.archetypeId).toBe('w-berserker');
});

it('scaleArchetype clamps over-cap secondaries to the hard cap', () => {
  const overcapped = { id: 'x', name: 'X', attackShare: 0.5, healthShare: 0.5, secondaries: { crit: 200, dmg_reduction: 999 } };
  const opp = scaleArchetype(overcapped, 'Warrior', 10000);
  expect(opp.stats.crit).toBe(capOf('crit')); // 90
  expect(opp.stats.dmg_reduction).toBe(capOf('dmg_reduction')); // 60
});

it('archetypeVariants: base first (un-jittered), deterministic, and variants differ from the base', () => {
  const arch = ARCHETYPES_BY_CLASS.Sentinel[0];
  const a = archetypeVariants(arch, 'Sentinel', 80000, 7, 3);
  const b = archetypeVariants(arch, 'Sentinel', 80000, 7, 3);
  expect(a.length).toBe(3);
  expect(a).toEqual(b); // same seed -> identical
  // Base equals a direct scale; variants are jittered off it.
  expect(a[0].stats).toEqual(scaleArchetype(arch, 'Sentinel', 80000).stats);
  expect(a[1].stats).not.toEqual(a[0].stats);
  expect(a[1].name).toContain('v2');
});

it('generateGauntlet spans both classes: (Warrior + Sentinel archetypes) x variants, all tagged', () => {
  const totalArchetypes = ARCHETYPES_BY_CLASS.Warrior.length + ARCHETYPES_BY_CLASS.Sentinel.length;
  const opps = generateGauntlet({ budget: 50000, seed: 1, variantsPerArchetype: 2 });
  expect(opps.length).toBe(totalArchetypes * 2);
  expect(opps.some((o) => o.class === 'Warrior')).toBe(true);
  expect(opps.some((o) => o.class === 'Sentinel')).toBe(true);
  expect(opps.every((o) => typeof o.archetypeId === 'string' && o.stats)).toBe(true);
  // Distinct archetype ids equal the catalogue size.
  expect(new Set(opps.map((o) => o.archetypeId)).size).toBe(totalArchetypes);
});

// The catalogue must not park a secondary at or above its hard cap.
it('every catalogued secondary survives the hard caps unchanged', () => {
  for (const [characterClass, archetypes] of Object.entries(ARCHETYPES_BY_CLASS)) {
    for (const arch of archetypes) {
      const opp = scaleArchetype(arch, characterClass, 100000);
      for (const [key, value] of Object.entries(arch.secondaries)) {
        expect(opp.stats[key], `${arch.id}.${key}`).toBe(value);
      }
    }
  }
});

it('jitter is not silently eaten by the caps: variants of one archetype actually differ', () => {
  // The Penetrator is the case that failed - 85 Penetration against a cap of
  // 70 gave every variant the same clamped 70.
  const pen = ARCHETYPES_BY_CLASS.Warrior.find((a) => a.id === 'w-penetrator');
  const variants = archetypeVariants(pen, 'Warrior', 100000, 3, 4);
  const pens = variants.map((v) => v.stats.penetration);
  expect(new Set(pens).size).toBe(pens.length);
  for (const p of pens) expect(p).toBeLessThanOrEqual(capOf('penetration'));
});
