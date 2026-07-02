import { it, expect } from 'vitest';
import { newRoster, newCharacter, newLoadout, normaliseRoster } from './model.js';
import { TALENT_TREES } from './talentTreeData.js';
import { RELICS_BY_CLASS, RELIC_EQUIP_CAP } from './relicsData.js';

it('newCharacter defaults class to null; newLoadout defaults spec/talentAllocation/relics empty', () => {
  const c = newCharacter('Test');
  expect(c.class).toBe(null);
  const l = newLoadout('Loadout 1');
  expect(l.spec).toBe(null);
  expect(l.talentAllocation).toEqual({});
  expect(l.relics).toEqual({ entries: [] });
});

it('newCharacter defaults Awakening to no path/no points', () => {
  const c = newCharacter('Test');
  expect(c.awakening).toEqual({ path: null, points: 0 });
});

it('normaliseRoster rejects an invalid Awakening path and clamps over-cap points, forcing points to 0 with no path', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        awakening: { path: 'nonsense', points: 999 },
      },
    ],
    currentId: 'x',
    drop: null,
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].awakening).toEqual({ path: null, points: 0 });
});

it('normaliseRoster keeps a valid Awakening path and clamps points to the 15-point cap', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        awakening: { path: 'shadow', points: 999 },
      },
    ],
    currentId: 'x',
    drop: null,
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].awakening).toEqual({ path: 'shadow', points: 15 });
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
        loadouts: [{ name: 'Loadout 1', spec: 'arms' }, { name: 'Loadout 2' }], // arms requires Warrior
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

it('normaliseRoster drops relic entries whose defId does not belong to the class, de-dupes, and clamps level to maxLevel', () => {
  const realRelic = RELICS_BY_CLASS.Sentinel.find((r) => r.tier === 'bronze'); // maxLevel 10
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        loadouts: [
          {
            name: 'Loadout 1',
            relics: {
              entries: [
                { defId: realRelic.id, level: 999, equipped: false },
                { defId: realRelic.id, level: 1, equipped: false }, // duplicate, dropped
                { defId: 'ghost-relic', level: 5, equipped: false }, // doesn't exist, dropped
              ],
            },
          },
          { name: 'Loadout 2' },
        ],
      },
    ],
    currentId: 'x',
    drop: null,
  };
  const roster = normaliseRoster(raw);
  const entries = roster.characters[0].loadouts[0].relics.entries;
  expect(entries.length).toBe(1);
  expect(entries[0].defId).toBe(realRelic.id);
  expect(entries[0].level).toBe(realRelic.maxLevel); // clamped from 999
});

it('normaliseRoster caps equipped relics at RELIC_EQUIP_CAP per loadout, unmarking the excess', () => {
  const relics = RELICS_BY_CLASS.Warrior.slice(0, RELIC_EQUIP_CAP + 2);
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Warrior',
        loadouts: [
          {
            name: 'Loadout 1',
            relics: { entries: relics.map((r) => ({ defId: r.id, level: 1, equipped: true })) },
          },
          { name: 'Loadout 2' },
        ],
      },
    ],
    currentId: 'x',
    drop: null,
  };
  const roster = normaliseRoster(raw);
  const entries = roster.characters[0].loadouts[0].relics.entries;
  expect(entries.length).toBe(relics.length); // all kept (just unmarked, not dropped)
  expect(entries.filter((e) => e.equipped).length).toBe(RELIC_EQUIP_CAP);
});

it("normaliseRoster drops a loadout's relics that belonged to a different class", () => {
  const warriorRelic = RELICS_BY_CLASS.Warrior[0];
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel', // Warrior relic no longer applies
        loadouts: [
          { name: 'Loadout 1', relics: { entries: [{ defId: warriorRelic.id, level: 5, equipped: true }] } },
          { name: 'Loadout 2' },
        ],
      },
    ],
    currentId: 'x',
    drop: null,
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].loadouts[0].relics.entries).toEqual([]);
});
