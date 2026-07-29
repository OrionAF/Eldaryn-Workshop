import { it, expect } from 'vitest';
import { newRoster, newCharacter, newLoadout, newPreset, newStoneEntry, talentSetLabel, normaliseRoster, normalisePresetGoal, newRunEntry, RUN_DETAIL_LIMIT, enforceRunHistoryBudget, normaliseLinkingSim } from './model.js';
import { TALENT_TREES } from './talentTreeData.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { SIGILS_BY_CLASS } from './sigilsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { PRESET_RELIC_CAP, PRESET_SIGIL_CAP, SLOTS } from './constants.js';

it('newCharacter defaults class to null, talent sets empty, two seeded linked Calculated presets', () => {
  const c = newCharacter('Test');
  expect(c.class).toBe(null);
  expect(c.talentSets).toEqual([
    { spec: null, allocation: {} },
    { spec: null, allocation: {} },
  ]);
  expect(c.pets).toEqual([]);
  expect(c.petAltar).toEqual({ tier: 1, level: 1 });
  expect(c.relicLevels).toEqual({});
  // Two-preset minimum (goals/linking redesign): both seeded, both linked,
  // goals unassigned - the UI prompts, nothing is silently chosen.
  expect(c.presets.length).toBe(2);
  expect(c.presets[0].manualTotals).toBe(false); // Calculated by default
  expect(c.presets[0].loadout).toBe(0);
  expect(c.presets[0].talentSet).toBe(0);
  expect(c.presets.map((p) => p.goal.kind)).toEqual([null, null]);
  expect(c.presets.map((p) => p.goal.linked)).toEqual([true, true]);
  expect(c.drop).toBe(null);
  expect(c.dropGoal).toEqual({ kind: 'dps-fast', ehpWeight: 0.5 });
});

it('normaliseRoster defaults a missing/unknown dropGoal and clamps ehpWeight', () => {
  const missing = normaliseRoster({ characters: [{ name: 'A', class: 'Warrior' }] });
  expect(missing.characters[0].dropGoal).toEqual({ kind: 'dps-fast', ehpWeight: 0.5 });

  const bogus = normaliseRoster({
    characters: [{ name: 'A', class: 'Warrior', dropGoal: { kind: 'nonsense', ehpWeight: 7 } }],
  });
  expect(bogus.characters[0].dropGoal).toEqual({ kind: 'dps-fast', ehpWeight: 1 });

  // 'hps' was removed from DROP_GOAL_KINDS (goals redesign): stale persisted
  // hps goals coerce to the DPS default, keeping the slider position.
  const staleHps = normaliseRoster({
    characters: [{ name: 'A', class: 'Warrior', dropGoal: { kind: 'hps', ehpWeight: 0.25 } }],
  });
  expect(staleHps.characters[0].dropGoal).toEqual({ kind: 'dps-fast', ehpWeight: 0.25 });

  const valid = normaliseRoster({
    characters: [{ name: 'A', class: 'Warrior', dropGoal: { kind: 'dps-accurate', ehpWeight: 0.25 } }],
  });
  expect(valid.characters[0].dropGoal).toEqual({ kind: 'dps-accurate', ehpWeight: 0.25 });
});

it('normaliseRoster resets a tank dropGoal on a non-Warrior (Warrior-only, like the Simulation Goal toggle)', () => {
  const warrior = normaliseRoster({
    characters: [{ name: 'A', class: 'Warrior', dropGoal: { kind: 'tank', ehpWeight: 0.75 } }],
  });
  expect(warrior.characters[0].dropGoal).toEqual({ kind: 'tank', ehpWeight: 0.75 });

  const sentinel = normaliseRoster({
    characters: [{ name: 'A', class: 'Sentinel', dropGoal: { kind: 'tank', ehpWeight: 0.75 } }],
  });
  expect(sentinel.characters[0].dropGoal.kind).toBe('dps-fast');
  expect(sentinel.characters[0].dropGoal.ehpWeight).toBe(0.75); // slider position survives the reset
});

it('newLoadout has no talent/relic fields anymore - gear + a socketedStones reference map only', () => {
  const l = newLoadout('Loadout 1');
  expect(l).toEqual({ name: 'Loadout 1', gear: expect.any(Object), socketedStones: expect.any(Object) });
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

it('newCharacter defaults stoneInventory to empty, and every loadout starts with no socketed stones', () => {
  const c = newCharacter('Test');
  expect(c.stoneInventory).toEqual([]);
  for (const loadout of c.loadouts) {
    for (const slot of SLOTS) expect(loadout.socketedStones[slot]).toBe(null);
  }
});

it('newStoneEntry defaults quality to 1, copies rolledKeys, defends stats shape', () => {
  const s = newStoneEntry({ type: 'verdant', rolledKeys: ['attack_pct', 'crit'], stats: { attack_pct: 5 } });
  expect(s.type).toBe('verdant');
  expect(s.quality).toBe(1);
  expect(s.rolledKeys).toEqual(['attack_pct', 'crit']);
  expect(s.stats.attack_pct).toBe(5);
  expect(s.stats.crit).toBe(0); // shape-defended, not actually set
});

it('normaliseRoster drops stone inventory entries missing an id/dupe id/invalid type, clamps quality, defends stats shape', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        stoneInventory: [
          { id: 's1', type: 'verdant', quality: -5, rolledKeys: ['attack_pct'], stats: { attack_pct: 10 } },
          { id: 's1', type: 'crimson', rolledKeys: [] }, // duplicate id, dropped
          { id: 's2', type: 'not-a-real-type', rolledKeys: [] }, // invalid type, dropped
          { type: 'azure', rolledKeys: [] }, // missing id, dropped
        ],
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  const stones = roster.characters[0].stoneInventory;
  expect(stones.length).toBe(1);
  expect(stones[0].id).toBe('s1');
  expect(stones[0].quality).toBe(0); // clamped, no negative quality
  expect(stones[0].stats.attack_pct).toBe(10);
});

it('normaliseRoster drops a socketedStones reference to a stone that does not exist', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        loadouts: [{ name: 'Loadout 1', gear: {}, socketedStones: { Weapon: 'ghost-stone' } }],
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].loadouts[0].socketedStones.Weapon).toBe(null);
});

it('normaliseRoster keeps a valid socketedStones reference, and allows the same stone in both loadouts at once', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        stoneInventory: [{ id: 's1', type: 'verdant', quality: 34, rolledKeys: [], stats: {} }],
        loadouts: [
          { name: 'Loadout 1', gear: {}, socketedStones: { Head: 's1' } },
          { name: 'Loadout 2', gear: {}, socketedStones: { Leggings: 's1' } },
        ],
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  const [l1, l2] = roster.characters[0].loadouts;
  expect(l1.socketedStones.Head).toBe('s1');
  expect(l2.socketedStones.Leggings).toBe('s1');
});

it('normaliseRoster drops a duplicate stoneId claiming a second slot within the SAME loadout, keeping only the first (SLOTS order)', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        stoneInventory: [{ id: 's1', type: 'verdant', quality: 1, rolledKeys: [], stats: {} }],
        loadouts: [{ name: 'Loadout 1', gear: {}, socketedStones: { Head: 's1', Leggings: 's1' } }],
      },
    ],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  const loadout = roster.characters[0].loadouts[0];
  expect(loadout.socketedStones.Head).toBe('s1'); // Head comes before Leggings in SLOTS
  expect(loadout.socketedStones.Leggings).toBe(null);
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

it('normaliseRoster repairs glyph entries: legacy saves get Common rarity, invalid specials drop to stat glyphs, valid specials force their tier', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        glyphs: {
          entries: [
            { id: 'g1', tier: 'minor', statKey: 'attack_pct', value: 2, equipped: true }, // pre-rarity save
            { id: 'g2', tier: 'mythic', rarity: 'Eternal', statKey: 'crit', value: 1, equipped: false, special: 'not-a-real-special' },
            { id: 'g3', tier: 'minor', rarity: 'Epic', statKey: 'attack_pct', value: 0, equipped: true, special: 'ember-curse-glyph' },
          ],
        },
      },
    ],
    currentId: 'x',
  };
  const entries = normaliseRoster(raw).characters[0].glyphs.entries;
  expect(entries[0]).toMatchObject({ rarity: 'Common', special: null, statKey: 'attack_pct', value: 2 });
  expect(entries[1]).toMatchObject({ tier: 'mythic', rarity: 'Common', special: null }); // Eternal is not a glyph rarity
  // A major glyph's variant id dictates BOTH its tier and rarity, overriding
  // whatever the save claimed - and the pre-catalogue id is remapped.
  expect(entries[2]).toMatchObject({ special: 'emberhoard-sigil:common', tier: 'major', rarity: 'Common' });
  // Equip state left the inventory entirely - it lives on mount.glyphIds now.
  expect(entries.every((e) => !('equipped' in e))).toBe(true);
});

it('normaliseRoster drops glyph equip state, keeping the inventory (glyphs became mount-bound)', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        glyphs: { entries: [{ id: 'g1', tier: 'minor', rarity: 'Rare', statKey: 'crit', value: 3, equipped: true }] },
      },
    ],
    currentId: 'x',
  };
  const c = normaliseRoster(raw).characters[0];
  expect(c.glyphs.entries).toHaveLength(1); // inventory survives
  expect(c.mounts.entries.every((m) => m.glyphIds.length === 0)).toBe(true); // equips do not
});

it('normaliseRoster drops mount glyphIds that no longer resolve, and enforces the per-mount tier caps', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        glyphs: {
          entries: [
            { id: 'm1', tier: 'minor', rarity: 'Common', statKey: 'crit', value: 1 },
            { id: 'm2', tier: 'minor', rarity: 'Common', statKey: 'crit', value: 1 },
            { id: 'm3', tier: 'minor', rarity: 'Common', statKey: 'crit', value: 1 },
            { id: 'm4', tier: 'minor', rarity: 'Common', statKey: 'crit', value: 1 },
          ],
        },
        mounts: {
          entries: [
            // 4 minors (cap 3), a duplicate, and an id that isn't in the inventory.
            { id: 'night_wolf', star: 1, glyphIds: ['m1', 'm2', 'm1', 'm3', 'm4', 'ghost'] },
          ],
        },
      },
    ],
    currentId: 'x',
  };
  const nightWolf = normaliseRoster(raw).characters[0].mounts.entries.find((m) => m.id === 'night_wolf');
  expect(nightWolf.glyphIds).toEqual(['m1', 'm2', 'm3']);
});

it('the same glyph may sit on any number of mounts at once', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        glyphs: { entries: [{ id: 'g1', tier: 'minor', rarity: 'Common', statKey: 'crit', value: 1 }] },
        mounts: {
          entries: [
            { id: 'night_wolf', star: 1, glyphIds: ['g1'] },
            { id: 'crystal_beast', star: 1, glyphIds: ['g1'] },
          ],
        },
      },
    ],
    currentId: 'x',
  };
  const entries = normaliseRoster(raw).characters[0].mounts.entries;
  expect(entries.find((m) => m.id === 'night_wolf').glyphIds).toEqual(['g1']);
  expect(entries.find((m) => m.id === 'crystal_beast').glyphIds).toEqual(['g1']);
});

it('a mount with no star is not owned; a legacy owned flag migrates to a star', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Sentinel',
        mounts: {
          entries: [
            { id: 'night_wolf' }, // never touched
            { id: 'crystal_beast', owned: true }, // pre-star save
          ],
        },
      },
    ],
    currentId: 'x',
  };
  const entries = normaliseRoster(raw).characters[0].mounts.entries;
  expect(entries.find((m) => m.id === 'night_wolf').star).toBe(0);
  expect(entries.find((m) => m.id === 'crystal_beast').star).toBe(1);
  expect(entries.every((m) => !('owned' in m))).toBe(true);
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

it('normaliseRoster keeps valid Transcendence positions for Warrior now that its tree exists', () => {
  expect(TRANSCENDENCE_TREES.Warrior).not.toBe(null); // guards this test's premise
  const raw = {
    characters: [{ id: 'x', name: 'Test', class: 'Warrior', transcendence: { unlockedPositions: ['14:25'] } }],
    currentId: 'x',
  };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].transcendence.unlockedPositions).toEqual(['14:25']);
});

it('newRoster does not carry talent tree content - that is static code data, not persisted', () => {
  const roster = newRoster();
  expect(roster.talentTrees).toBeUndefined();
});

it('normaliseRoster returns an empty roster (landing page state) for null/missing/empty characters, instead of seeding a default character', () => {
  expect(normaliseRoster(null)).toEqual({ characters: [], currentId: null });
  expect(normaliseRoster({})).toEqual({ characters: [], currentId: null });
  expect(normaliseRoster({ characters: [], currentId: null })).toEqual({ characters: [], currentId: null });
});

it('normaliseRoster handles a new-shape export that predates class/spec entirely', () => {
  const raw = { characters: [{ id: 'x', name: 'Old' }], currentId: 'x' };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].class).toBe(null);
  expect(roster.characters[0].talentSets[0].spec).toBe(null);
  expect(roster.characters[0].presets.length).toBe(2); // topped up to the two-preset minimum
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

it('normaliseRoster clamps the Pet Altar level to a minimum of 1', () => {
  const raw = { characters: [{ id: 'x', name: 'Test', petAltar: { tier: 1, level: -5 } }], currentId: 'x' };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].petAltar).toEqual({ tier: 1, level: 1 });
});

it('normaliseRoster migrates per-pet tier/level into the Pet Altar, taking the highest', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        petLevel: 7, // the older character-wide field
        pets: [
          { id: 'p1', companionId: 'dustmite', tier: 2, level: 14 },
          { id: 'p2', companionId: 'mossbeetle', tier: 3, level: 9 },
        ],
      },
    ],
    currentId: 'x',
  };
  const c = normaliseRoster(raw).characters[0];
  expect(c.petAltar).toEqual({ tier: 3, level: 14 });
  // ...and the per-pet fields are gone.
  expect(c.pets.every((p) => !('tier' in p) && !('level' in p))).toBe(true);
});

it('a catalogue pet takes its rarity from the catalogue, overriding any saved value', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        // Dust Mite is Common (1 secondary slot) - the save claims Mythic (3).
        pets: [{
          id: 'p1',
          companionId: 'dustmite',
          rarity: 'Mythic',
          secondaries: [
            { statKey: 'attack_pct', value: 5 },
            { statKey: 'crit', value: 2 },
            { statKey: 'speed', value: 3 },
          ],
        }],
      },
    ],
    currentId: 'x',
  };
  const [pet] = normaliseRoster(raw).characters[0].pets;
  expect(pet.rarity).toBe('Common');
  expect(pet.secondaries).toHaveLength(1); // trimmed to Common's slot count
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

it('normaliseRoster preset: drops a dangling petId/relicIds/sigilIds, dedupes and caps relicIds/sigilIds', () => {
  const realRelic = RELICS_BY_CLASS.Sentinel[0];
  const sigilIds = SIGILS_BY_CLASS.Sentinel.map((s) => s.id);
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
            // ghost dropped (not in the Sentinel catalogue), dupe collapsed, capped at PRESET_SIGIL_CAP
            sigilIds: [sigilIds[0], sigilIds[0], 'ghost-sigil', sigilIds[1], sigilIds[2], sigilIds[3]],
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
  expect(preset.sigilIds).toEqual([sigilIds[0], sigilIds[1], sigilIds[2]]);
  expect(preset.sigilIds.length).toBeLessThanOrEqual(PRESET_SIGIL_CAP);
});

it('normaliseRoster sigilValues: drops unknown sigils/statKeys, keeps declared values, clamps damage to >= 0', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'Test',
        class: 'Warrior',
        sigilValues: {
          'ghost-sigil': { passive: { attack: 99 } }, // not in the Warrior catalogue, dropped
          'warborn-fury': {
            passive: { attack: 500, crit: 9 }, // crit not declared by warborn-fury's passive, dropped
            active: { attack_pct: 20 },
            damage: -5, // clamped
            tickDamage: 'junk', // coerced
          },
          'withering-touch': { regenDebuffPct: 45.5 }, // level-scaled debuff % survives
          'blade-of-judgment': { regenDebuffPct: 250 }, // clamped to 100
        },
      },
    ],
    currentId: 'x',
  };
  const values = normaliseRoster(raw).characters[0].sigilValues;
  expect(values['ghost-sigil']).toBeUndefined();
  expect(values['warborn-fury'].passive).toEqual({ attack: 500, health: 0 });
  expect(values['warborn-fury'].active).toEqual({ attack_pct: 20, penetration: 0, dmg_reduction: 0 });
  expect(values['warborn-fury'].damage).toBe(0);
  expect(values['warborn-fury'].tickDamage).toBe(0);
  expect(values['warborn-fury'].regenDebuffPct).toBe(0); // defaulted
  expect(values['withering-touch'].regenDebuffPct).toBe(45.5);
  expect(values['blade-of-judgment'].regenDebuffPct).toBe(100);
});

it('normaliseRoster seeds up to the two-preset minimum when a character has none', () => {
  const raw = { characters: [{ id: 'x', name: 'Test', presets: [] }], currentId: 'x' };
  const roster = normaliseRoster(raw);
  expect(roster.characters[0].presets.length).toBe(2);
  expect(roster.characters[0].presets.map((p) => p.goal.linked)).toEqual([true, true]);
});

// --- Preset goals (goals/linking redesign) ---
it('normalisePresetGoal: defaults, kind validation, Warrior-only tank, weights sum to 100', () => {
  // Missing goal entirely (pre-goal saves): unassigned, linked by position.
  expect(normalisePresetGoal(undefined, 'Warrior', 0).kind).toBe(null);
  expect(normalisePresetGoal(undefined, 'Warrior', 0).linked).toBe(true);
  expect(normalisePresetGoal(undefined, 'Warrior', 1).linked).toBe(true);
  expect(normalisePresetGoal(undefined, 'Warrior', 2).linked).toBe(false);

  // Unknown kind -> unassigned; explicit linked survives.
  expect(normalisePresetGoal({ kind: 'nonsense', linked: false }, 'Warrior', 0)).toEqual({
    kind: null,
    name: '',
    ehpWeight: 0.5,
    weights: { damage: 34, mitigation: 33, survivability: 33 },
    linked: false,
  });

  // Tank is Warrior-only; ehpWeight clamps to [0, 1].
  expect(normalisePresetGoal({ kind: 'tank', ehpWeight: 7 }, 'Warrior', 0).kind).toBe('tank');
  expect(normalisePresetGoal({ kind: 'tank', ehpWeight: 7 }, 'Warrior', 0).ehpWeight).toBe(1);
  expect(normalisePresetGoal({ kind: 'tank' }, 'Sentinel', 0).kind).toBe(null);

  // Weights renormalise to sum 100; garbage falls back to the default split.
  const w = normalisePresetGoal({ kind: 'pvp', weights: { damage: 2, mitigation: 1, survivability: 1 } }, 'Sentinel', 0).weights;
  expect(w.damage).toBeCloseTo(50, 9);
  expect(w.mitigation).toBeCloseTo(25, 9);
  expect(w.survivability).toBeCloseTo(25, 9);
  expect(normalisePresetGoal({ kind: 'pvp', weights: { damage: -5 } }, 'Sentinel', 0).weights).toEqual({
    damage: 34,
    mitigation: 33,
    survivability: 33,
  });

  // Custom keeps its display name.
  expect(normalisePresetGoal({ kind: 'custom', name: 'Farm speed' }, 'Sentinel', 0).name).toBe('Farm speed');
});

it('normaliseRoster round-trips an assigned preset goal', () => {
  const raw = {
    characters: [
      {
        id: 'x',
        name: 'T',
        class: 'Warrior',
        presets: [
          { id: 'p1', name: 'Boss', goal: { kind: 'tank', ehpWeight: 0.75, weights: {}, linked: true } },
          { id: 'p2', name: 'Arena', goal: { kind: 'pvp', weights: { damage: 70, mitigation: 20, survivability: 10 }, linked: true } },
        ],
      },
    ],
    currentId: 'x',
  };
  const c = normaliseRoster(raw).characters[0];
  expect(c.presets[0].goal.kind).toBe('tank');
  expect(c.presets[0].goal.ehpWeight).toBe(0.75);
  expect(c.presets[1].goal.kind).toBe('pvp');
  expect(c.presets[1].goal.weights).toEqual({ damage: 70, mitigation: 20, survivability: 10 });
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
          mounts: { entries: [{ id: 'mount-1', name: 'Crystal Beast', rarity: 'Rare', baseHpPct: 5, baseAtkPct: 3 }], activeId: 'mount-1' },
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

  // The old character-wide "active pet" seeds the Pet Altar level + both presets' petId.
  expect(c.petAltar.level).toBe(12);
  expect(c.pets.length).toBe(1);
  expect(c.presets[0].petId).toBe('pet-1');
  expect(c.presets[1].petId).toBe('pet-1');

  // Mounts remap onto the fixed catalogue: the legacy user-created "Crystal
  // Beast" matches the catalogue mount by name, carrying its stats; the old
  // character-wide ridden mount seeds every preset's per-preset mountId.
  // mountGlyphs renamed to glyphs.
  expect(c.mounts.entries.length).toBe(11);
  const crystalBeast = c.mounts.entries.find((m) => m.id === 'crystal_beast');
  // New shape: legacy baseHpPct/baseAtkPct migrate into star + bounded hpPct/atkPct.
  // crystal_beast star 1 ranges are hp [17,19] / atk [10,12], so the legacy 5/3
  // (below the real game range) clamp up into range.
  // star 1 IS "owned" now - the separate flag is gone.
  expect(crystalBeast).toMatchObject({ rarity: 'Uncommon', star: 1, hpPct: 17, atkPct: 10 });
  expect(c.presets[0].mountId).toBe('crystal_beast');
  expect(c.presets[1].mountId).toBe('crystal_beast');
  expect(c.glyphs.entries.length).toBe(1);

  // Character-wide fields untouched by the migration.
  expect(c.awakening).toEqual({ path: 'shadow', points: 5 });
  expect(c.transcendence.unlockedPositions).toEqual(['14:25']);

  // Gear itself carries straight over on the loadout.
  expect(c.loadouts[0].gear.Weapon.attack).toBe(500);
});

// --- PVP Opponents ---

it('newCharacter starts with no PVP opponents; normalise defaults missing field', () => {
  expect(newCharacter('Test').pvpOpponents).toEqual([]);
  const roster = newRoster();
  delete roster.characters[0].pvpOpponents;
  expect(normaliseRoster(roster).characters[0].pvpOpponents).toEqual([]);
});

it('normaliseRoster repairs opponents: drops dupes/no-id, validates class, caps + filters sigilIds, defends stats shape', () => {
  const roster = newRoster();
  const warriorSigils = SIGILS_BY_CLASS.Warrior.map((s) => s.id);
  roster.characters[0].pvpOpponents = [
    { id: 'o1', name: 'Rival', class: 'Warrior', stats: { attack: 5000, junk: 1 }, sigilIds: [...warriorSigils, 'nope'], sigilValues: { [warriorSigils[0]]: { passive: {}, active: {}, damage: -5, tickDamage: 0 } } },
    { id: 'o1', name: 'Dupe' },
    { name: 'No id' },
    { id: 'o2', class: 'NotAClass', sigilIds: warriorSigils.slice(0, 2) },
  ];
  const chars = normaliseRoster(roster).characters[0];
  expect(chars.pvpOpponents.map((o) => o.id)).toEqual(['o1', 'o2']);
  const o1 = chars.pvpOpponents[0];
  expect(o1.stats.attack).toBe(5000);
  expect(o1.sigilIds.length).toBe(PRESET_SIGIL_CAP); // capped, 'nope' dropped
  expect(o1.sigilIds.every((id) => warriorSigils.includes(id))).toBe(true);
  const o2 = chars.pvpOpponents[1];
  expect(o2.class).toBe(null);
  expect(o2.sigilIds).toEqual([]); // no class -> no catalogue -> no sigils
});

it('normaliseRoster opponents: keeps catalogue special glyphs, drops unknown ids, defaults missing', () => {
  const roster = newRoster();
  roster.characters[0].pvpOpponents = [
    { id: 'o1', name: 'Glyphed', class: 'Sentinel', specialGlyphIds: ['ember-curse-glyph', 'made-up-glyph', 'ember-curse-glyph'] },
    { id: 'o2', name: 'Legacy', class: 'Warrior' }, // pre-glyph save
  ];
  const opponents = normaliseRoster(roster).characters[0].pvpOpponents;
  // The pre-catalogue id is remapped to its real variant (and de-duplicated).
  expect(opponents[0].specialGlyphIds).toEqual(['emberhoard-sigil:common']);
  expect(opponents[1].specialGlyphIds).toEqual([]);
});

// --- Run history (auto-saved runs) + linkingSim ---

/** A raw run entry at a controllable timestamp (t sortable, e.g. 1..N). */
function rawRun(id, kind, t, extra = {}) {
  return {
    id,
    kind,
    at: `2026-07-19T00:00:${String(t).padStart(2, '0')}.000Z`,
    name: `Run ${id}`,
    headline: { score: t },
    detail: { payload: t },
    ...extra,
  };
}

it('newCharacter starts with empty runHistory and a null linkingSim; normalise defaults both', () => {
  const c = newCharacter('Test');
  expect(c.runHistory).toEqual([]);
  expect(c.linkingSim).toBe(null);
  const roster = newRoster();
  delete roster.characters[0].linkingSim;
  roster.characters[0].runHistory = 'garbage';
  const norm = normaliseRoster(roster).characters[0];
  expect(norm.runHistory).toEqual([]);
  expect(norm.linkingSim).toBe(null);
});

it('normaliseRoster runHistory: drops no-id/dupe/unknown-kind, coerces fields, sorts newest-first', () => {
  const roster = newRoster();
  roster.characters[0].runHistory = [
    rawRun('a', 'sim', 1),
    rawRun('a', 'opt', 2), // dupe id
    rawRun('b', 'mystery', 3), // unknown kind
    { kind: 'sim' }, // no id
    rawRun('c', 'pvp-matrix', 5, { name: 7, goalKind: 'nope', headline: 'bad', detail: null }),
    rawRun('d', 'opt', 4, { goalKind: 'tank', pinned: true }),
  ];
  const history = normaliseRoster(roster).characters[0].runHistory;
  expect(history.map((r) => r.id)).toEqual(['c', 'd', 'a']); // newest first
  expect(history[0]).toMatchObject({ kind: 'pvp-matrix', name: 'Run', goalKind: null, headline: {}, detail: null });
  expect(history[1]).toMatchObject({ goalKind: 'tank', pinned: true });
  expect(history[2].detail).toEqual({ payload: 1 });
});

it('normalise compacts detail beyond the newest RUN_DETAIL_LIMIT per kind; pinned exempt and not counted', () => {
  const roster = newRoster();
  const entries = [];
  for (let t = 1; t <= RUN_DETAIL_LIMIT + 3; t++) entries.push(rawRun(`s${t}`, 'sim', t));
  entries.push(rawRun('pinned-oldest', 'sim', 0, { pinned: true }));
  entries.push(rawRun('other-kind', 'opt', 0));
  roster.characters[0].runHistory = entries;
  const history = normaliseRoster(roster).characters[0].runHistory;

  const sims = history.filter((r) => r.kind === 'sim' && !r.pinned);
  expect(sims.filter((r) => r.detail !== null).length).toBe(RUN_DETAIL_LIMIT); // newest 50 keep detail
  expect(sims.slice(-3).every((r) => r.detail === null)).toBe(true); // the 3 oldest unpinned compacted
  expect(history.find((r) => r.id === 'pinned-oldest').detail).not.toBe(null); // pinned keeps detail
  expect(history.find((r) => r.id === 'other-kind').detail).not.toBe(null); // per-kind limit
});

it('legacy savedResults migrate into runHistory exactly once (absence of the field is the trigger)', () => {
  const roster = newRoster();
  delete roster.characters[0].runHistory;
  roster.characters[0].savedResults = [
    {
      id: 'r1',
      kind: 'sim',
      name: 'Old sim',
      savedAt: '2026-07-14T10:00:00.000Z',
      notes: 'note',
      pinned: true,
      summary: { presetId: 'p9', presetName: 'Boss', meanDps: 12.5, iterations: 500, durationSeconds: 60, totalDamage: { p5: 1, p95: 9 } },
    },
    { id: 'r2', kind: 'opt', name: 'Old opt', savedAt: '2026-07-15T10:00:00.000Z', summary: { goal: 'Tank Score', baselineScore: 10, bestScore: 12, improvementPct: 20 } },
    { id: 'r3', kind: 'pvp-sim', name: 'Old duel', savedAt: '2026-07-16T10:00:00.000Z', summary: { opponentName: 'Rival', winRate: 61.2 } },
  ];
  const migrated = normaliseRoster(roster).characters[0];
  expect(migrated.runHistory.map((r) => r.id)).toEqual(['r3', 'r2', 'r1']); // newest-first by savedAt
  const sim = migrated.runHistory.find((r) => r.id === 'r1');
  expect(sim).toMatchObject({
    kind: 'sim',
    at: '2026-07-14T10:00:00.000Z',
    name: 'Old sim',
    notes: 'note',
    pinned: true,
    presetId: 'p9',
    presetName: 'Boss',
    headline: { meanDps: 12.5, p5: 1, p95: 9, iterations: 500, durationSeconds: 60 },
  });
  expect(sim.detail).toEqual(roster.characters[0].savedResults[0].summary);
  expect(migrated.runHistory.find((r) => r.id === 'r2').headline).toMatchObject({ unit: 'Tank Score', baseline: 10, best: 12, improvementPct: 20 });
  expect(migrated.runHistory.find((r) => r.id === 'r3').headline).toMatchObject({ opponentName: 'Rival', winRate: 61.2 });

  // Idempotent: once runHistory exists (even empty), savedResults are ignored.
  const again = normaliseRoster({ characters: [{ ...migrated, runHistory: [] }], currentId: migrated.id }).characters[0];
  expect(again.runHistory).toEqual([]);
});

it('enforceRunHistoryBudget drops detail oldest-first, then whole rows beyond the per-kind cap; pinned exempt', () => {
  const entries = [];
  for (let t = 9; t >= 1; t--) entries.push({ ...newRunEntry('sim', { detail: { blob: 'x'.repeat(100) } }), id: `e${t}`, at: `t${t}` });
  entries[0].pinned = true; // newest ('e9') pinned
  const trimmed = enforceRunHistoryBudget(entries, { byteBudget: 1400, maxRowsPerKind: 100 });
  expect(trimmed.length).toBe(9); // stage 1 sufficed - no rows dropped
  const compacted = trimmed.filter((e) => e.detail === null).map((e) => e.id);
  expect(compacted).not.toContain('e9'); // pinned keeps detail
  expect(compacted).toContain('e1'); // oldest lost detail first

  const rows = [];
  for (let t = 0; t < 10; t++) rows.push({ ...newRunEntry('sim', {}), id: `r${t}`, at: `t${9 - t}`, detail: null });
  rows[9].pinned = true; // oldest row pinned
  const capped = enforceRunHistoryBudget(rows, { byteBudget: 1, maxRowsPerKind: 4 });
  expect(capped.filter((e) => !e.pinned).length).toBe(4); // newest 4 unpinned kept
  expect(capped.some((e) => e.id === 'r9')).toBe(true); // pinned survives the row cap
});

it('normaliseLinkingSim: null without a completedAt string; passthrough of unknown keys otherwise; presets coerced', () => {
  expect(normaliseLinkingSim(null)).toBe(null);
  expect(normaliseLinkingSim('done')).toBe(null);
  expect(normaliseLinkingSim({ done: true })).toBe(null);

  // Unknown/forward keys pass through; a missing presets field becomes [].
  const outcome = { completedAt: '2026-07-19T12:00:00.000Z', lockedPath: 'shadow', futureField: { a: 1 } };
  expect(normaliseLinkingSim(outcome)).toEqual({ ...outcome, presets: [] });

  // presets is coerced to an array of plain objects; malformed entries dropped.
  const withPresets = {
    completedAt: '2026-07-19T12:00:00.000Z',
    presets: [{ presetId: 'p1', goalUnit: 'DPS' }, { goalUnit: 'no id' }, 'garbage', null],
  };
  expect(normaliseLinkingSim(withPresets).presets).toEqual([{ presetId: 'p1', goalUnit: 'DPS' }]);
  expect(normaliseLinkingSim({ completedAt: 'x', presets: 'not-an-array' }).presets).toEqual([]);

  const roster = newRoster();
  roster.characters[0].linkingSim = outcome;
  expect(normaliseRoster(roster).characters[0].linkingSim).toEqual({ ...outcome, presets: [] });
});
