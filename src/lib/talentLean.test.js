import { it, expect } from 'vitest';
import { talentLean, OFFENSE_STATKEYS, DEFENSE_STATKEYS } from './talentLean.js';
import { TALENT_TREES } from './talentTreeData.js';

/** Find a talent id in a spec whose statKey is in the given set. */
function talentWith(spec, statKeySet) {
  for (const tier of TALENT_TREES[spec].tiers) {
    for (const t of tier.talents) if (statKeySet.has(t.statKey)) return t;
  }
  return null;
}

it('sums allocated points into offense/defense buckets by each talent statKey', () => {
  const offense = talentWith('arms', OFFENSE_STATKEYS); // e.g. Sharpened Blade (attack_pct)
  const defense = talentWith('arms', DEFENSE_STATKEYS); // e.g. Vampiric Strikes (lifesteal)
  expect(offense).not.toBeNull();
  expect(defense).not.toBeNull();

  const lean = talentLean({ spec: 'arms', allocation: { [offense.id]: 5, [defense.id]: 1 } });
  expect(lean.offense).toBe(5);
  expect(lean.defense).toBe(1);
  expect(lean.label).toBe('leans offensive');
});

it('labels a defensive-heavy build and a balanced build', () => {
  const offense = talentWith('arms', OFFENSE_STATKEYS);
  const defense = talentWith('arms', DEFENSE_STATKEYS);
  expect(talentLean({ spec: 'arms', allocation: { [offense.id]: 1, [defense.id]: 3 } }).label).toBe('leans defensive');
  expect(talentLean({ spec: 'arms', allocation: { [offense.id]: 2, [defense.id]: 2 } }).label).toBe('balanced');
});

it('ignores unknown talent ids and empty/zero allocations', () => {
  expect(talentLean({ spec: 'arms', allocation: { 'not-a-talent': 5 } })).toEqual({ offense: 0, defense: 0, label: 'no talents allocated' });
  expect(talentLean({ spec: null, allocation: {} }).label).toBe('no talents allocated');
  expect(talentLean(undefined).label).toBe('no talents allocated');
});

it('offense and defense stat sets are disjoint', () => {
  for (const k of OFFENSE_STATKEYS) expect(DEFENSE_STATKEYS.has(k)).toBe(false);
});
