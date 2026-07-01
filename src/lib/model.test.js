import { it, expect } from 'vitest';
import { newRoster, newCharacter, newLoadout, normaliseRoster } from './model.js';
import { TALENT_TREES } from './talentTreeData.js';

it('newCharacter defaults class to null; newLoadout defaults spec/talentAllocation empty', () => {
  const c = newCharacter('Test');
  expect(c.class).toBe(null);
  const l = newLoadout('Loadout 1');
  expect(l.spec).toBe(null);
  expect(l.talentAllocation).toEqual({});
});

it('newRoster does not carry talent tree content - that is static code data, not persisted', () => {
  const roster = newRoster();
  expect(roster.talentTrees).toBeUndefined();
});

it('normaliseRoster handles an old export that predates class/spec', () => {
  const oldExport = { characters: [{ id: 'x', name: 'Old' }], currentId: 'x', drop: null };
  const roster = normaliseRoster(oldExport);
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

it('normaliseRoster drops talentAllocation entries for talents that no longer exist in the static tree, and clamps over-max ranks', () => {
  const realTalent = TALENT_TREES.marksmanship.tiers[0].talents[0]; // a real placeholder talent
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
            talentAllocation: { [realTalent.id]: 99, 'ghost-talent-id': 3 },
          },
          { name: 'Loadout 2' },
        ],
      },
    ],
    currentId: 'x',
    drop: null,
  };
  const roster = normaliseRoster(raw);
  const allocation = roster.characters[0].loadouts[0].talentAllocation;
  expect(allocation[realTalent.id]).toBe(realTalent.ranks.length); // clamped to maxRank
  expect(allocation['ghost-talent-id']).toBeUndefined(); // dropped, talent doesn't exist
});
