import { describe, it, expect } from 'vitest';
import {
  DOMAINS,
  SCHEMA_VERSION,
  emptyRoster,
  newRoster,
  newCharacter,
  normaliseRoster,
  normaliseCharacter,
  migrateCharacterFromV1,
  getCurrent,
  isV1Roster,
} from './index.js';
import { migratePresetsFromV1, reconcilePresets, normalisePresets, defaultPresets, MAX_PRESETS, MIN_PRESETS } from './presets.js';
import { normaliseSheet, normaliseBaseResidual, normaliseClass } from './character.js';
import { CLASSES } from '../game/classes.js';

const V1_CHARACTER = {
  id: 'old1',
  name: 'Aria',
  class: 'Warrior',
  loadouts: [{ gear: {} }, { gear: {} }],
  drop: { slot: 'weapon' },
  presets: [
    { id: 'a', name: 'Arms', loadout: 0, talentSet: 0, petId: 'pet1', mountId: 'night_wolf', relicIds: ['r1', 'r2', 'r3', 'r4', 'r5'], sigilIds: ['s1', 's2'], manualTotals: true },
    { id: 'b', name: 'Prot', loadout: 1, talentSet: 1, petId: null, mountId: null, relicIds: [], sigilIds: [] },
  ],
  activePresetId: 'b',
};

describe('roster', () => {
  it('newRoster / emptyRoster carry schemaVersion 2', () => {
    expect(SCHEMA_VERSION).toBe(2);
    expect(newRoster().schemaVersion).toBe(2);
    expect(emptyRoster()).toEqual({ schemaVersion: 2, characters: [], currentId: null });
  });

  it('round-trips through normaliseRoster unchanged (idempotent), through JSON too', () => {
    const r = newRoster();
    expect(normaliseRoster(r)).toEqual(r);
    expect(normaliseRoster(JSON.parse(JSON.stringify(r)))).toEqual(r);
    const twice = normaliseRoster(normaliseRoster(r));
    expect(twice).toEqual(r);
  });

  it('junk input gives the empty roster, never throws', () => {
    for (const junk of [null, undefined, 5, 'x', [], {}, { characters: 'no' }, { characters: [] }, { characters: [null, 3] }]) {
      expect(normaliseRoster(junk)).toEqual(emptyRoster());
    }
  });

  it('repairs currentId and duplicate character ids', () => {
    const a = newCharacter('A');
    const b = { ...newCharacter('B'), id: a.id };
    const r = normaliseRoster({ schemaVersion: 2, characters: [a, b], currentId: 'gone' });
    expect(new Set(r.characters.map((c) => c.id)).size).toBe(2);
    expect(r.currentId).toBe(a.id);
    expect(getCurrent(r).id).toBe(a.id);
  });

  it('isV1Roster is true only for schemaVersion-less rosters', () => {
    expect(isV1Roster({ characters: [] })).toBe(true);
    expect(isV1Roster({ schemaVersion: 2, characters: [] })).toBe(false);
    expect(isV1Roster(null)).toBe(false);
  });
});

describe('character', () => {
  it('4-class creation: every class makes a valid, normalise-stable character', () => {
    for (const cls of CLASSES) {
      const c = newCharacter('X', cls);
      expect(c.class).toBe(cls);
      expect(c.level).toBe(100);
      expect(normaliseCharacter(c)).toEqual(c);
    }
    expect(newCharacter('X').class).toBeNull();
  });

  it('class accepts v1 spellings and rejects the rest', () => {
    expect(normaliseClass('Sentinel')).toBe('SENTINEL');
    expect(normaliseClass('druid')).toBeNull();
    expect(normaliseClass(3)).toBeNull();
  });

  it('every domain is registered once and contributes its fields', () => {
    expect(new Set(DOMAINS.map((d) => d.name)).size).toBe(16);
    const c = newCharacter('X', 'MYSTIC');
    for (const key of ['equipment', 'enchantStones', 'oblivionEnchantStones', 'talentSets', 'pets', 'mounts', 'glyphs', 'sigils', 'relics', 'awakening', 'transcendence', 'fortress', 'skills', 'attunementBans', 'oblivion', 'drop', 'opponents', 'runs', 'presets', 'activePresetId', 'baseResidual']) {
      expect(c, key).toHaveProperty(key);
    }
    expect(c.transcendence.presets[0].id).toBe('default');
  });

  it('level is clamped to 1..100 and base residual defaults to the client base stats', () => {
    expect(normaliseCharacter({ level: 0 }).level).toBe(1);
    expect(normaliseCharacter({ level: 250 }).level).toBe(100);
    expect(normaliseCharacter({ level: 'abc' }).level).toBe(100);
    expect(normaliseCharacter({}).baseResidual).toEqual({ attack: 10, hp: 100, attackSpeed: 1, critChance: 0, critDamage: 1.5 });
    expect(normaliseBaseResidual({ attack: 25, hp: -4, critChance: 'x' })).toEqual({ attack: 25, hp: 100, attackSpeed: 1, critChance: 0, critDamage: 1.5 });
  });

  it('oblivion normalises for real: locked realms cannot be active', () => {
    const c = normaliseCharacter({ oblivion: { unlocked: false, activeRealm: 'oblivion', level: 500 } });
    expect(c.oblivion).toEqual({ unlocked: false, level: 100, activeRealm: 'base', sheet: null });
    const u = normaliseCharacter({ oblivion: { unlocked: true, activeRealm: 'oblivion', level: 7 } });
    expect(u.oblivion).toMatchObject({ unlocked: true, activeRealm: 'oblivion', level: 7 });
  });

  it('sheets keep only finite total*/raw* numbers', () => {
    expect(normaliseSheet({ values: { totalCritChance: 12.5, rawCritChance: 30, evil: 3, totalAttack: NaN, totalHp: '9' }, enteredAt: 'x' })).toEqual({
      values: { totalCritChance: 12.5, rawCritChance: 30 },
      enteredAt: 'x',
    });
    expect(normaliseSheet({ values: {} })).toBeNull();
    expect(normaliseSheet(null)).toBeNull();
  });
});

describe('presets', () => {
  it('default is two presets using set 1 / set 2, active = first', () => {
    const d = defaultPresets();
    expect(d.presets.map((p) => [p.equipmentSet, p.talentSet])).toEqual([[1, 0], [2, 1]]);
    expect(d.activePresetId).toBe(d.presets[0].id);
  });

  it('normalise enforces 2..8 presets, unique ids, caps and enums', () => {
    expect(normalisePresets({ presets: [] }).presets).toHaveLength(MIN_PRESETS);
    const many = Array.from({ length: 12 }, () => ({ id: 'same', relicIds: ['a', 'a', 'b', 'c', 'd', 'e'], sigilSpecies: ['1', '2', '3', '4'], equipmentSet: 7, talentSet: 9 }));
    const out = normalisePresets({ presets: many, activePresetId: 'nope' });
    expect(out.presets).toHaveLength(MAX_PRESETS);
    expect(new Set(out.presets.map((p) => p.id)).size).toBe(MAX_PRESETS);
    expect(out.presets[0].relicIds).toEqual(['a', 'b', 'c', 'd']);
    expect(out.presets[0].sigilSpecies).toEqual(['1', '2', '3']);
    expect([out.presets[0].equipmentSet, out.presets[0].talentSet]).toEqual([1, 0]);
    expect(out.activePresetId).toBe(out.presets[0].id);
  });

  it('reconcile nulls references that do not resolve and keeps ones that do', () => {
    const c = newCharacter('X', 'WARRIOR');
    c.pets.owned = [{ id: 'pet-1' }];
    c.mounts = [{ id: 'm-1' }];
    c.transcendence.presets.push({ id: 'tp2', name: 'Two', allocatedNodeIds: [] });
    const [p] = c.presets;
    Object.assign(p, { petId: 'pet-1', mountId: 'ghost', transcendencePresetId: 'tp2', sigilSpecies: ['wolf'], sigilConditions: { wolf: 'low-hp', gone: 'x' } });
    reconcilePresets(c);
    expect(p).toMatchObject({ petId: 'pet-1', mountId: null, transcendencePresetId: 'tp2' });
    expect(p.sigilConditions).toEqual({ wolf: 'low-hp' });
    p.transcendencePresetId = 'zzz';
    reconcilePresets(c);
    expect(p.transcendencePresetId).toBeNull();
  });
});

describe('v1 migration contract (plan §3)', () => {
  it('core fields migrate; presets keep their equipment/talent set and active preset', () => {
    const c = migrateCharacterFromV1(V1_CHARACTER);
    expect(c).toMatchObject({ id: 'old1', name: 'Aria', class: 'WARRIOR', level: 100, activePresetId: 'b' });
    expect(c.presets.map((p) => [p.id, p.name, p.equipmentSet, p.talentSet])).toEqual([['a', 'Arms', 1, 0], ['b', 'Prot', 2, 1]]);
    expect(c.drop).toBeNull(); // dropped on purpose
    expect(normaliseCharacter(c)).toEqual(c);
  });

  it('stubbed domains give null / empty preset references', () => {
    const c = migrateCharacterFromV1(V1_CHARACTER);
    expect(c.presets[0]).toMatchObject({ petId: null, mountId: null, relicIds: [] , transcendencePresetId: 'default' });
  });

  it('migratePresetsFromV1 remaps through idMaps, drops unmapped ids, caps relics and sigils', () => {
    const idMaps = {
      pets: { pet1: 'pet-NEW' },
      mounts: { night_wolf: 'mount-NEW' },
      relics: { r1: 'RelA', r2: 'RelB', r3: 'RelC', r4: 'RelD', r5: 'RelE' },
      sigils: { s1: 'wolf' },
      transcendence: { '*': 'default' },
    };
    const { presets } = migratePresetsFromV1(V1_CHARACTER, idMaps);
    expect(presets[0]).toMatchObject({
      petId: 'pet-NEW',
      mountId: 'mount-NEW',
      relicIds: ['RelA', 'RelB', 'RelC', 'RelD'],
      sigilSpecies: ['wolf'], // s2 unmapped -> dropped
      transcendencePresetId: 'default',
    });
    expect(presets[1].petId).toBeNull();
  });

  it('a migrated reference survives reconcile when the domain data holds it', () => {
    const { presets } = migratePresetsFromV1(V1_CHARACTER, { pets: { pet1: 'pet-NEW' }, mounts: { night_wolf: 'mount-NEW' } });
    const c = { ...newCharacter('X', 'WARRIOR'), presets, pets: { altar: { level: 1, tier: 1 }, owned: [{ id: 'pet-NEW' }] }, mounts: [{ id: 'mount-NEW' }] };
    reconcilePresets(c);
    expect(c.presets[0]).toMatchObject({ petId: 'pet-NEW', mountId: 'mount-NEW' });
  });

  it('empty or missing v1 presets fall back to the two defaults', () => {
    expect(migratePresetsFromV1({}, {}).presets).toHaveLength(2);
    expect(migratePresetsFromV1({ presets: [] }, {}).presets).toHaveLength(2);
  });

  it('normaliseRoster dispatches a v1 roster through the migration', () => {
    const r = normaliseRoster({ characters: [V1_CHARACTER], currentId: 'old1' });
    expect(r.schemaVersion).toBe(2);
    expect(r.characters[0].class).toBe('WARRIOR');
    expect(r.currentId).toBe('old1');
  });

  it('each stub domain migrate returns {value, idMap}', () => {
    for (const d of DOMAINS) {
      const out = d.migrate(V1_CHARACTER);
      expect(out, d.name).toHaveProperty('value');
      expect(out.idMap, d.name).toEqual(d.name === 'transcendence' ? { '*': 'default' } : {});
    }
  });
});
