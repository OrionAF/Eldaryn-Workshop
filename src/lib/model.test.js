import { it, expect } from 'vitest';
import { newRoster, newCharacter, newLoadout, normaliseRoster, newTalent, newTier } from './model.js';
import { TALENT_TREE_KEYS } from './constants.js';

it('newRoster seeds all 4 talent trees empty', () => {
  const roster = newRoster();
  expect(Object.keys(roster.talentTrees).sort()).toEqual([...TALENT_TREE_KEYS].sort());
  for (const key of TALENT_TREE_KEYS) {
    expect(roster.talentTrees[key]).toEqual({ description: '', tiers: [] });
  }
});

it('newCharacter defaults class to null; newLoadout defaults spec/talentAllocation empty', () => {
  const c = newCharacter('Test');
  expect(c.class).toBe(null);
  const l = newLoadout('Loadout 1');
  expect(l.spec).toBe(null);
  expect(l.talentAllocation).toEqual({});
});

it('normaliseRoster fills in talentTrees for an old export that predates the field', () => {
  const oldExport = { characters: [{ id: 'x', name: 'Old' }], currentId: 'x', drop: null };
  const roster = normaliseRoster(oldExport);
  expect(Object.keys(roster.talentTrees).sort()).toEqual([...TALENT_TREE_KEYS].sort());
  expect(roster.characters[0].class).toBe(null);
  expect(roster.characters[0].loadouts[0].spec).toBe(null);
});

it('normaliseRoster rejects an invalid class and a spec that does not belong to the class', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Bad',
        class: 'Wizard', // not a real class
        loadouts: [{ name: 'Loadout 1', spec: 'fury' }, { name: 'Loadout 2' }], // fury requires Warrior
      },
    ],
    currentId: 'x',
    drop: null,
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].class).toBe(null); // invalid class rejected
  expect(roster.characters[0].loadouts[0].spec).toBe(null); // spec invalid without a matching class
});

it('normaliseRoster keeps a valid class+spec combination', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Good',
        class: 'Sentinel',
        loadouts: [{ name: 'Loadout 1', spec: 'marksmanship' }, { name: 'Loadout 2', spec: 'disruption' }],
      },
    ],
    currentId: 'x',
    drop: null,
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].class).toBe('Sentinel');
  expect(roster.characters[0].loadouts[0].spec).toBe('marksmanship');
  expect(roster.characters[0].loadouts[1].spec).toBe('disruption');
});

it('normaliseRoster drops talentAllocation entries for talents that no longer exist, and clamps over-max ranks', () => {
  const talent = newTalent({ name: 'Sharp Aim', ranks: [2, 4, 6] }); // maxRank 3
  const tier = newTier({ threshold: 0, talents: [talent] });
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        loadouts: [
          {
            name: 'Loadout 1',
            spec: 'marksmanship',
            talentAllocation: { [talent.id]: 99, 'ghost-talent-id': 3 },
          },
          { name: 'Loadout 2' },
        ],
      },
    ],
    currentId: 'x',
    drop: null,
    talentTrees: { marksmanship: { description: '', tiers: [tier] } },
  };
  const roster = normaliseRoster(raw);
  const allocation = roster.characters[0].loadouts[0].talentAllocation;
  expect(allocation[talent.id]).toBe(3); // clamped to maxRank
  expect(allocation['ghost-talent-id']).toBeUndefined(); // dropped, talent doesn't exist
});
