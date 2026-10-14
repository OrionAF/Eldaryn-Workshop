import { describe, it, expect, beforeEach } from 'vitest';
import { rosterStore as store } from './rosterStore.svelte.js';
import { mergeStores } from './store/context.js';
import { KEY, KEY_V1 } from './storage.js';
import { relicsForClass } from './game/relics.js';
const WR = relicsForClass('WARRIOR').map((r) => r.id);

/** Fresh single character (the store is a singleton): add one, delete the rest. */
function reset() {
  const id = store.addCharacter('Test', 'WARRIOR');
  for (const c of [...store.roster.characters]) if (c.id !== id) store.deleteCharacter(c.id);
  localStorage.clear();
  return id;
}

const saved = () => JSON.parse(localStorage.getItem(KEY));

describe('characters', () => {
  beforeEach(reset);

  it('addCharacter makes it current, takes an optional class, and persists to the v2 key', () => {
    const id = store.addCharacter('Mira', 'NECROMANCER');
    expect(store.current.id).toBe(id);
    expect(store.current).toMatchObject({ name: 'Mira', class: 'NECROMANCER', level: 100 });
    expect(saved().schemaVersion).toBe(2);
    expect(saved().characters.find((c) => c.id === id).name).toBe('Mira');
    expect(localStorage.getItem(KEY_V1)).toBeNull();
  });

  it('creates a character for each of the four classes', () => {
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      store.addCharacter(cls, cls);
      expect(store.current.class).toBe(cls);
      expect(store.current.presets).toHaveLength(2);
    }
  });

  it('rename, select and delete (never the last character)', () => {
    const first = store.current.id;
    const second = store.addCharacter('Two');
    store.renameCharacter(second, '  Renamed ');
    expect(store.current.name).toBe('Renamed');
    store.renameCharacter(second, '   ');
    expect(store.current.name).toBe('Renamed');
    store.selectCharacter(first);
    expect(store.current.id).toBe(first);
    expect(store.deleteCharacter(second)).toBe(true);
    expect(store.deleteCharacter(first)).toBe(false);
    expect(store.roster.characters).toHaveLength(1);
  });

  it('setCharacterClass accepts v1 spellings, no-ops on the same class, and clears with null', () => {
    const id = store.current.id;
    store.setCharacterClass(id, 'Sentinel');
    expect(store.current.class).toBe('SENTINEL');
    store.setCharacterClass(id, 'nonsense');
    expect(store.current.class).toBeNull();
    expect(saved().characters.find((c) => c.id === id).class).toBeNull();
  });

  it('a class change keeps identity, level and presets', () => {
    const id = store.current.id;
    store.setCharacterLevel(60);
    store.renamePreset(store.current.presets[0].id, 'Keep me');
    store.setCharacterClass(id, 'MYSTIC');
    expect(store.current).toMatchObject({ id, level: 60, class: 'MYSTIC' });
    expect(store.current.presets[0].name).toBe('Keep me');
  });

  it('setCharacterLevel clamps; setBaseResidual merges and validates', () => {
    store.setCharacterLevel(500);
    expect(store.current.level).toBe(100);
    store.setBaseResidual({ attack: 42, hp: -1 });
    expect(store.current.baseResidual).toMatchObject({ attack: 42, hp: 100, critDamage: 1.5 });
  });

  it('setOblivionUnlocked toggles the flag and re-locking resets the active realm', () => {
    expect(store.current.oblivion.unlocked).toBe(false);
    store.setOblivionUnlocked(true);
    expect(store.current.oblivion.unlocked).toBe(true);
    store.current.oblivion.activeRealm = 'oblivion';
    store.setOblivionUnlocked(false);
    expect(store.current.oblivion).toMatchObject({ unlocked: false, activeRealm: 'base' });
    expect(saved().characters[0].oblivion.unlocked).toBe(false);
  });

  it('importFromJson replaces the roster from v2 and from v1 JSON, and rejects bad JSON', () => {
    store.addCharacter('Throwaway');
    const v2 = JSON.stringify({ schemaVersion: 2, characters: [{ id: 'imp', name: 'Imported', class: 'SENTINEL' }], currentId: 'imp' });
    store.importFromJson(v2);
    expect(store.roster.characters).toHaveLength(1);
    expect(store.current).toMatchObject({ id: 'imp', class: 'SENTINEL' });
    expect(store.current.presets).toHaveLength(2);

    const v1 = JSON.stringify({ characters: [{ id: 'v1c', name: 'Old', class: 'Warrior', presets: [] }], currentId: 'v1c' });
    store.importFromJson(v1);
    expect(store.current).toMatchObject({ id: 'v1c', class: 'WARRIOR' });
    expect(() => store.importFromJson('{bad')).toThrow();
    expect(store.current.id).toBe('v1c');
  });
});

describe('game profile import', () => {
  beforeEach(reset);

  it('importFromJson adds a game profile as a new selected character, keeping the others', () => {
    const before = store.roster.characters.map((c) => c.id);
    const profile = JSON.stringify({ player: { name: 'Test', class: 'SENTINEL', level: 61 }, equipment: {} });
    expect(store.importFromJson(profile)).toEqual({ kind: 'profile', name: 'Test (imported)' });
    expect(store.roster.characters).toHaveLength(before.length + 1);
    expect(store.roster.characters.slice(0, before.length).map((c) => c.id)).toEqual(before);
    expect(store.current).toMatchObject({ name: 'Test (imported)', class: 'SENTINEL', level: 61 });
    expect(saved().currentId).toBe(store.current.id);
    expect(store.importFromJson(JSON.stringify({ schemaVersion: 2, characters: [{ id: 'z', name: 'Z' }], currentId: 'z' }))).toEqual({ kind: 'roster', name: null });
  });
});

describe('presets', () => {
  beforeEach(reset);

  it('starts with 2, adds up to 8 (null at the cap), the new preset becomes active', () => {
    expect(store.current.presets).toHaveLength(2);
    let last;
    for (let i = 0; i < 6; i++) {
      last = store.addPreset();
      expect(last).toBeTruthy();
      expect(store.current.activePresetId).toBe(last);
    }
    expect(store.current.presets).toHaveLength(8);
    expect(store.addPreset('nine')).toBeNull();
    expect(store.duplicatePreset(last)).toBeNull();
    expect(store.current.presets).toHaveLength(8);
  });

  it('deletePreset refuses below two and moves the active preset', () => {
    const [a, b] = store.current.presets.map((p) => p.id);
    expect(store.deletePreset(a)).toBe(false);
    const c = store.addPreset('C');
    expect(store.current.activePresetId).toBe(c);
    expect(store.deletePreset(c)).toBe(true);
    expect(store.current.activePresetId).toBe(a);
    expect(store.deletePreset('missing')).toBe(false);
    expect(store.current.presets.map((p) => p.id)).toEqual([a, b]);
  });

  it('duplicatePreset copies with a fresh id right after the source', () => {
    const [a] = store.current.presets.map((p) => p.id);
    store.setPresetRelics(a, WR.slice(0, 2));
    const copy = store.duplicatePreset(a);
    expect(copy).not.toBe(a);
    expect(store.current.presets[1]).toMatchObject({ id: copy, name: 'Preset 1 copy', relicIds: WR.slice(0, 2) });
  });

  it('setters write valid values: sets are enums, relics/sigils are capped and de-duplicated', () => {
    const a = store.current.presets[0].id;
    store.setPresetEquipmentSet(a, 2);
    store.setPresetTalentSet(a, 1);
    store.setPresetRelics(a, [WR[0], WR[1], WR[1], WR[2], WR[3], WR[4]]);
    // Sigil picks are legality-checked by model/sigils.js (B5): owned, class-legal, slot-unlocked.
    for (const sp of ['DEFENSE_STANCE', 'BERSERK_STANCE', 'CATACLYSM', 'IRON_BASTION']) store.setSigilLevel(sp, 3);
    store.setSigilOwned('FLAMEBORN', true);
    store.setPresetSigils(a, { species: ['DEFENSE_STANCE', 'BERSERK_STANCE', 'CATACLYSM', 'IRON_BASTION'], utility: 'u', ancient: 'FLAMEBORN' });
    store.setPresetSigilCondition(a, 'CATACLYSM', 'ENEMY_HP_BELOW_40');
    store.setPresetSigilCondition(a, 'IRON_BASTION', 'MY_HP_BELOW_40'); // 4th pick is capped away, so its condition goes too
    store.setPresetSigilCondition(a, 'DEFENSE_STANCE', 'MY_HP_BELOW_40'); // auras take no condition
    const p = store.current.presets[0];
    expect(p).toMatchObject({
      equipmentSet: 2,
      talentSet: 1,
      relicIds: WR.slice(0, 4),
      sigilSpecies: ['DEFENSE_STANCE', 'BERSERK_STANCE', 'CATACLYSM'],
      utilitySigilSpecies: null, // a Warrior has no utility slot
      ancientSigilSpecies: 'FLAMEBORN',
    });
    expect(p.sigilConditions).toEqual({ CATACLYSM: 'ENEMY_HP_BELOW_40' });
    store.setPresetEquipmentSet(a, 9);
    expect(store.current.presets[0].equipmentSet).toBe(1);
  });

  it('references to domain objects that do not exist are reconciled away (stub domains)', () => {
    const a = store.current.presets[0].id;
    store.setPresetPet(a, 'ghost');
    store.setPresetMount(a, 'ghost');
    store.setPresetTranscendence(a, 'ghost');
    expect(store.current.presets[0]).toMatchObject({ petId: null, mountId: null, transcendencePresetId: null });
    store.setPresetTranscendence(a, 'default'); // the default transcendence preset always exists
    expect(store.current.presets[0].transcendencePresetId).toBe('default');
  });

  it('rename / setActive ignore bad input', () => {
    const [a, b] = store.current.presets.map((p) => p.id);
    store.renamePreset(a, '  ');
    expect(store.current.presets[0].name).toBe('Preset 1');
    store.setActivePreset(b);
    store.setActivePreset('nope');
    expect(store.current.activePresetId).toBe(b);
  });

  it('every mutator persists: the v2 blob always matches the live roster', () => {
    const a = store.current.presets[0].id;
    store.renamePreset(a, 'Persisted');
    expect(saved().characters[0].presets[0].name).toBe('Persisted');
    store.setPresetRelics(a, [WR[0]]);
    expect(saved().characters[0].presets[0].relicIds).toEqual([WR[0]]);
  });
});

describe('sheets', () => {
  beforeEach(reset);

  it('set, clear and persist a preset sheet; non-stat keys are dropped', () => {
    const a = store.current.presets[0].id;
    store.setPresetSheet(a, { totalCritChance: 25, bogus: 1 });
    const sheet = store.current.presets[0].sheet;
    expect(sheet.values).toEqual({ totalCritChance: 25 });
    expect(typeof sheet.enteredAt).toBe('string');
    expect(saved().characters[0].presets[0].sheet.values.totalCritChance).toBe(25);
    store.clearPresetSheet(a);
    expect(store.current.presets[0].sheet).toBeNull();
  });

  it('the Oblivion sheet lives on character.oblivion', () => {
    store.setOblivionSheet({ totalOblivionPower: 170 });
    expect(store.current.oblivion.sheet.values.totalOblivionPower).toBe(170);
    store.setOblivionSheet(null);
    expect(store.current.oblivion.sheet).toBeNull();
  });
});

describe('facade', () => {
  it('exposes live roster / current getters', () => {
    reset();
    const before = store.current.id;
    const id = store.addCharacter('Live');
    expect(store.current.id).toBe(id);
    expect(store.roster.currentId).toBe(id);
    expect(before).not.toBe(id);
  });

  it('mergeStores throws on a duplicate mutator name and keeps getters live', () => {
    expect(() => mergeStores({ a() {} }, { a() {} })).toThrow(/Duplicate store mutator "a"/);
    let n = 0;
    const merged = mergeStores({ get n() { return n; } }, { b() {} });
    n = 5;
    expect(merged.n).toBe(5);
  });
});
