import { describe, it, expect, beforeEach } from 'vitest';
import { createContext } from './context.js';
import { createCharactersStore } from './characters.js';
import { newCharacter } from '../model/index.js';

// A fresh store per test, so the session-only undo slot starts empty.
let roster;
let saves;
let store;
const ids = () => roster.characters.map((c) => c.id);

beforeEach(() => {
  const chars = [newCharacter('A', 'WARRIOR'), newCharacter('B', 'MYSTIC'), newCharacter('C', 'WARRIOR')];
  roster = { characters: chars, currentId: chars[2].id };
  saves = 0;
  store = createCharactersStore(
    createContext({ getRoster: () => roster, setRoster: (r) => (roster = r), persist: () => (saves += 1) }),
  );
});

describe('restoreDeletedCharacter', () => {
  it('returns null and does not persist when nothing was deleted', () => {
    expect(store.restoreDeletedCharacter()).toBeNull();
    expect(saves).toBe(0);
  });

  it('puts a deleted middle character back at the same index with the same data, and persists', () => {
    const before = JSON.parse(JSON.stringify(roster.characters[1]));
    expect(store.deleteCharacter(before.id)).toBe(true);
    expect(ids()).not.toContain(before.id);
    saves = 0;
    expect(store.restoreDeletedCharacter()).toBe(before.id);
    expect(ids()[1]).toBe(before.id);
    expect(roster.characters[1].name).toBe('B');
    expect(roster.characters[1].class).toBe('MYSTIC');
    expect(roster.characters[1].presets.map((p) => p.id)).toEqual(before.presets.map((p) => p.id));
    expect(roster.currentId).toBe(ids()[2]); // B was not current, so the selection stays on C
    expect(saves).toBe(1);
  });

  it('re-selects the character when it was the current one', () => {
    const c = roster.currentId;
    store.deleteCharacter(c);
    expect(roster.currentId).not.toBe(c);
    store.restoreDeletedCharacter();
    expect(roster.currentId).toBe(c);
    expect(ids()[2]).toBe(c);
  });

  it('is one step: a second restore does nothing', () => {
    const b = ids()[1];
    store.deleteCharacter(b);
    expect(store.restoreDeletedCharacter()).toBe(b);
    const after = ids();
    expect(store.restoreDeletedCharacter()).toBeNull();
    expect(ids()).toEqual(after);
  });

  it('after two deletes only the latest comes back', () => {
    const [a, b, c] = ids();
    store.deleteCharacter(b);
    store.deleteCharacter(c);
    expect(store.restoreDeletedCharacter()).toBe(c);
    expect(ids()).toEqual([a, c]);
    expect(store.restoreDeletedCharacter()).toBeNull();
  });

  it('gives a fresh id when the old one is taken, so ids stay unique', () => {
    const b = ids()[1];
    store.deleteCharacter(b);
    const d = store.addCharacter('D', 'WARRIOR');
    roster.characters.find((ch) => ch.id === d).id = b; // an id clash
    const restored = store.restoreDeletedCharacter();
    expect(restored).not.toBe(b);
    expect(new Set(ids()).size).toBe(ids().length);
    expect(roster.characters.find((ch) => ch.id === restored).name).toBe('B');
  });

  it('a refused delete (the last character) leaves nothing to restore', () => {
    store.deleteCharacter(ids()[0]);
    store.restoreDeletedCharacter();
    roster.characters = [roster.characters[0]];
    roster.currentId = roster.characters[0].id;
    expect(store.deleteCharacter(ids()[0])).toBe(false);
    expect(store.restoreDeletedCharacter()).toBeNull();
    expect(ids()).toHaveLength(1);
  });

  it('restores at the end when the roster has shrunk below the old index', () => {
    const c = ids()[2];
    store.deleteCharacter(c);
    roster.characters = [roster.characters[0]]; // the roster changed since (an import, say)
    expect(store.restoreDeletedCharacter()).toBe(c);
    expect(ids()).toHaveLength(2);
    expect(ids()[1]).toBe(c);
  });
});

describe('duplicateCharacter', () => {
  it('copies a character under a new id, names it "<name> copy", selects it and persists', () => {
    const src = roster.characters[0];
    saves = 0;
    const id = store.duplicateCharacter(src.id);
    const copy = roster.characters.at(-1);
    expect(copy.id).toBe(id);
    expect(copy.id).not.toBe(src.id);
    expect(copy.name).toBe('A copy');
    expect(copy.class).toBe(src.class);
    expect(copy.level).toBe(src.level);
    expect(copy.presets.map((p) => p.id)).toEqual(src.presets.map((p) => p.id));
    expect(roster.characters).toHaveLength(4);
    expect(roster.currentId).toBe(id);
    expect(saves).toBe(1);
  });

  it('makes names unique on repeated duplication', () => {
    store.duplicateCharacter(roster.characters[0].id);
    store.duplicateCharacter(roster.characters[0].id);
    expect(roster.characters.map((c) => c.name).slice(-2)).toEqual(['A copy', 'A copy 2']);
  });

  it('is a deep copy: editing the copy leaves the original alone', () => {
    const src = roster.characters[0];
    store.duplicateCharacter(src.id);
    const copy = roster.characters.at(-1);
    copy.presets[0].name = 'Changed';
    copy.baseResidual.attack = 999;
    expect(src.presets[0].name).not.toBe('Changed');
    expect(src.baseResidual.attack).not.toBe(999);
  });

  it('returns null and changes nothing for an unknown id', () => {
    saves = 0;
    expect(store.duplicateCharacter('nope')).toBeNull();
    expect(roster.characters).toHaveLength(3);
    expect(saves).toBe(0);
  });
});
