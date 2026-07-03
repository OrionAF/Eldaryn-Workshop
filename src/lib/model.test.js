import { it, expect } from 'vitest';
import { newRoster, newCharacter, newLoadout, newPreset, talentSetLabel, normaliseRoster } from './model.js';
import { TALENT_TREES } from './talentTreeData.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { PRESET_RELIC_CAP, PRESET_SIGIL_CAP } from './constants.js';

it('newCharacter defaults class to null, talent sets empty, one seeded Manual preset', () => {
  const c = newCharacter('Test');
  expect(c.class).toBe(null);
  expect(c.talentSets).toEqual([
    { spec: null, allocation: {} },
    { spec: null, allocation: {} },
  ]);
  expect(c.pets).toEqual([]);
  expect(c.petLevel).toBe(1);
  expect(c.relicLevels).toEqual({});
  expect(c.presets.length).toBe(1);
  expect(c.presets[0].manualTotals).toBe(true); // nothing to calculate from yet
  expect(c.presets[0].loadout).toBe(0);
  expect(c.presets[0].talentSet).toBe(0);
  expect(c.drop).toBe(null);
});

it('newLoadout has no talent/relic fields anymore - gear/stones only', () => {
  const l = newLoadout('Loadout 1');
  expect(l).toEqual({ name: 'Loadout 1', gear: expect.any(Object), stones: expect.any(Object) });
  expect(l.spec).toBeUndefined();
  expect(l.talentAllocation).toBeUndefined();
  expect(l.relics).toBeUndefined();
});

it('talentSetLabel is a fixed, non-renamable label derived from index', () => {
  expect(talentSetLabel(0)).toBe('Set A');
  expect(talentSetLabel(1)).toBe('Set B');
});

it('newPreset defaults: no pet, no relics/sigils, empty manual stats', () => {
  const p = newPreset('Farm');
  expect(p.name).toBe('Farm');
  expect(p.loadout).toBe(0);
  expect(p.talentSet).toBe(0);
  expect(p.petId).toBe(null);
  expect(p.relicIds).toEqual([]);
  expect(p.sigilIds).toEqual([]);
  expect(p.manualTotals).toBe(false);
});

it('newCharacter defaults Awakening to no path/no points', () => {
  const c = newCharacter('Test');
  expect(c.awakening).toEqual({ path: null, points: 0 });
});

it('newCharacter defaults Transcendence to no nodes unlocked', () => {
  const c = newCharacter('Test');
  expect(c.transcendence).toEqual({ unlockedPositions: [] });
});

it('normaliseRoster rejects an invalid Awakening path and clamps over-cap points, forcing points to 0 with no path', () => {
  const raw = { characters: [{ id: 'x', name: 'Test', awakening: { path: 'nonsense', points: 999 } }], currentId: 'x' };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].awakening).toEqual({ path: null, points: 0 });
});

it('normaliseRoster keeps a valid Awakening path and clamps points to the 15-point cap', () => {
  const raw = { characters: [{ id: 'x', name: 'Test', awakening: { path: 'shadow', points: 999 } }], currentId: 'x' };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].awakening).toEqual({ path: 'shadow', points: 15 });
});

it('normaliseRoster drops Transcendence positions that do not belong to the tree, and glyph sockets (always inert)', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        transcendence: { unlockedPositions: ['14:25', '14:24', '999:999', '5:10'] }, // 5:10 is a real glyph socket
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].transcendence.unlockedPositions).toEqual(['14:25', '14:24']);
});

it('normaliseRoster drops everything if the start position itself was never unlocked - it is not granted for free', () => {
  const raw = {
    characters: [{ id: 'x', name: 'Test', class: 'Sentinel', transcendence: { unlockedPositions: ['14:24'] } }],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].transcendence.unlockedPositions).toEqual([]);
});

it('normaliseRoster drops Transcendence positions orphaned from the start (no unbroken adjacency chain)', () => {
  const raw = {
    characters: [{ id: 'x', name: 'Test', class: 'Sentinel', transcendence: { unlockedPositions: ['14:23'] } }],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].transcendence.unlockedPositions).toEqual([]);
});

it('normaliseRoster clears Transcendence for a class with no tree data yet (Warrior)', () => {
  expect(TRANSCENDENCE_TREES.Warrior).toBe(null); // guards this test's premise
  const raw = {
    characters: [{ id: 'x', name: 'Test', class: 'Warrior', transcendence: { unlockedPositions: ['14:24'] } }],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].transcendence.unlockedPositions).toEqual([]);
});

it('newRoster does not carry talent tree content - that is static code data, not persisted', () => {
  const roster = newRoster();
  expect(roster.talentTrees).toBeUndefined();
});

it('normaliseRoster handles a new-shape export that predates class/spec entirely', () => {
  const raw = { characters: [{ id: 'x', name: 'Old' }], currentId: 'x' };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].class).toBe(null);
  expect(roster.characters[0].talentSets[0].spec).toBe(null);
  expect(roster.characters[0].presets.length).toBe(1);
});

it('normaliseRoster rejects an invalid class and a spec that does not belong to the class', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Bad',
        class: 'Wizard', // not a real class
        talentSets: [{ spec: 'arms', allocation: {} }, { spec: null, allocation: {} }], // arms requires Warrior
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].class).toBe(null);
  expect(roster.characters[0].talentSets[0].spec).toBe(null); // invalid without a matching class
});

it('normaliseRoster keeps a valid class+spec combination across both talent sets', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Good',
        class: 'Sentinel',
        talentSets: [{ spec: 'marksmanship', allocation: {} }, { spec: 'disruption', allocation: {} }],
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].class).toBe('Sentinel');
  expect(roster.characters[0].talentSets[0].spec).toBe('marksmanship');
  expect(roster.characters[0].talentSets[1].spec).toBe('disruption');
});

it('normaliseRoster drops talent allocation entries for talents that no longer exist in the static tree, and clamps over-max ranks', () => {
  const realTalent = TALENT_TREES.marksmanship.tiers[0].talents[0];
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        talentSets: [
          { spec: 'marksmanship', allocation: { [realTalent.id]: 99, 'ghost-talent-id': 3 } },
          { spec: null, allocation: {} },
        ],
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  const allocation = roster.characters[0].talentSets[0].allocation;
  expect(allocation[realTalent.id]).toBe(realTalent.ranks.length); // clamped to maxRank
  expect(allocation['ghost-talent-id']).toBeUndefined(); // dropped, talent doesn't exist
});

it('normaliseRoster drops pet entries missing an id or duplicated, defends stats shape', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        pets: [
          { id: 'p1', name: 'Ashfang', rarity: 'Epic', stats: { attack: 100 } },
          { id: 'p1', name: 'Dupe', rarity: 'Common', stats: {} }, // duplicate id, dropped
          { name: 'No Id' }, // missing id, dropped
        ],
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  const pets = roster.characters[0].pets;
  expect(pets.length).toBe(1);
  expect(pets[0].name).toBe('Ashfang');
  expect(pets[0].stats.attack).toBe(100);
});

it('normaliseRoster clamps petLevel to a minimum of 1', () => {
  const raw = { characters: [{ id: 'x', name: 'Test', petLevel: -5 }], currentId: 'x' };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].petLevel).toBe(1);
});

it('normaliseRoster drops relicLevels entries whose defId does not belong to the class, and clamps to maxLevel', () => {
  const realRelic = RELICS_BY_CLASS.Sentinel.find((r) => r.tier === 'bronze'); // maxLevel 10
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        relicLevels: { [realRelic.id]: 999, 'ghost-relic': 5 },
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  const levels = roster.characters[0].relicLevels;
  expect(levels[realRelic.id]).toBe(realRelic.maxLevel); // clamped from 999
  expect(levels['ghost-relic']).toBeUndefined();
});

it("normaliseRoster drops relicLevels that belonged to a different class", () => {
  const warriorRelic = RELICS_BY_CLASS.Warrior[0];
  const raw = {
    characters: [{ id: 'x', name: 'Test', class: 'Sentinel', relicLevels: { [warriorRelic.id]: 5 } }],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].relicLevels).toEqual({});
});

it('normaliseRoster preset: drops a dangling petId/relicIds, dedupes and caps relicIds/sigilIds', () => {
  const realRelic = RELICS_BY_CLASS.Sentinel[0];
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        pets: [{ id: 'p1', name: 'Pet', rarity: 'Common', stats: {} }],
        relicLevels: { [realRelic.id]: 1 },
        presets: [
          {
            id: 'preset-1',
            name: 'Farm',
            loadout: 1,
            talentSet: 1,
            petId: 'ghost-pet', // dangling, dropped
            relicIds: [realRelic.id, realRelic.id, 'ghost-relic', 'a', 'b', 'c'], // deduped + capped at PRESET_RELIC_CAP
            sigilIds: ['s1', 's1', 's2', 's3', 's4'], // deduped + capped at PRESET_SIGIL_CAP
            manualTotals: false,
          },
        ],
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  const preset = roster.characters[0].presets[0];
  expect(preset.id).toBe('preset-1');
  expect(preset.loadout).toBe(1);
  expect(preset.talentSet).toBe(1);
  expect(preset.petId).toBe(null); // dangling reference dropped
  expect(preset.relicIds).toEqual([realRelic.id]); // ghost-relic dropped, dupe collapsed
  expect(preset.relicIds.length).toBeLessThanOrEqual(PRESET_RELIC_CAP);
  expect(preset.sigilIds).toEqual(['s1', 's2', 's3']);
  expect(preset.sigilIds.length).toBeLessThanOrEqual(PRESET_SIGIL_CAP);
});

it('normaliseRoster falls back to one seeded preset when a character has none', () => {
  const raw = { characters: [{ id: 'x', name: 'Test', presets: [] }], currentId: 'x' };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].presets.length).toBe(1);
});

// --- Legacy-format migration (pre-redesign saves) ---
it('normaliseRoster migrates a pre-redesign character (talentAllocation on the loadout is the detector)', () => {
  const realTalent = TALENT_TREES.marksmanship.tiers[0].talents[0];
  const realRelic = RELICS_BY_CLASS.Sentinel[0];
  const legacyRaw = {
    characters: [
      {
        id: 'legacy-1',
        name: 'Legacy Hero',
        class: 'Sentinel',
        loadouts: [
          {
            name: 'Loadout 1',
            gear: { Weapon: { attack: 500 } },
            spec: 'marksmanship',
            talentAllocation: { [realTalent.id]: 2 },
            manualTotals: false,
            profileTotals: { attack: 1000 },
            relics: { entries: [{ defId: realRelic.id, level: 8, equipped: true }] },
          },
          {
            name: 'Loadout 2',
            gear: {},
            spec: null,
            talentAllocation: {},
            manualTotals: true,
            profileTotals: { attack: 2000 },
            relics: { entries: [{ defId: realRelic.id, level: 3, equipped: false }] },
          },
        ],
        sources: {
          pets: { entries: [{ id: 'pet-1', name: 'Ashfang', rarity: 'Epic', level: 12, stats: { attack: 50 } }], activeId: 'pet-1' },
          mounts: { entries: [{ id: 'mount-1', name: 'Beast', rarity: 'Rare', baseHpPct: 5, baseAtkPct: 3 }], activeId: 'mount-1' },
          mountGlyphs: { entries: [{ id: 'g1', tier: 'minor', statKey: 'attack_pct', value: 2, equipped: true }] },
        },
        awakening: { path: 'shadow', points: 5 },
        transcendence: { unlockedPositions: ['14:25'] },
      },
    ],
    currentId: 'legacy-1',
    drop: { slot: 'Weapon', piece: { attack: 999 } }, // old roster-level drop - not migrated
  };

  const roster = normaliseRoster(legacyRaw);
  const c = roster.characters[0];

  expect(c.id).toBe('legacy-1');
  expect(c.class).toBe('Sentinel');
  expect(c.drop).toBe(null); // old roster-level drop is deliberately not carried over

  // Talent sets relocated 1:1 from loadouts[i].spec/talentAllocation.
  expect(c.talentSets[0].spec).toBe('marksmanship');
  expect(c.talentSets[0].allocation[realTalent.id]).toBe(2);
  expect(c.talentSets[1].spec).toBe(null);

  // Relic levels collapse to one character-wide value per defId (max across both loadouts).
  expect(c.relicLevels[realRelic.id]).toBe(8);

  // Two presets seeded, one per old loadout/talent-set index.
  expect(c.presets.length).toBe(2);
  expect(c.presets[0].loadout).toBe(0);
  expect(c.presets[0].talentSet).toBe(0);
  expect(c.presets[0].relicIds).toEqual([realRelic.id]); // was equipped:true on loadout 1
  expect(c.presets[0].manualTotals).toBe(false);
  expect(c.presets[1].relicIds).toEqual([]); // was equipped:false on loadout 2
  expect(c.presets[1].manualTotals).toBe(true);
  expect(c.presets[1].manualStats.attack).toBe(2000);

  // The old character-wide "active pet" becomes petLevel + both presets' petId.
  expect(c.petLevel).toBe(12);
  expect(c.pets.length).toBe(1);
  expect(c.presets[0].petId).toBe('pet-1');
  expect(c.presets[1].petId).toBe('pet-1');

  // Mounts/Glyphs carry over unchanged (already character-wide shape); mountGlyphs renamed to glyphs.
  expect(c.mounts.activeId).toBe('mount-1');
  expect(c.glyphs.entries.length).toBe(1);

  // Character-wide fields untouched by the migration.
  expect(c.awakening).toEqual({ path: 'shadow', points: 5 });
  expect(c.transcendence.unlockedPositions).toEqual(['14:25']);

  // Gear itself carries straight over on the loadout.
  expect(c.loadouts[0].gear.Weapon.attack).toBe(500);
});
