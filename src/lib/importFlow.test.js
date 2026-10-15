import { describe, it, expect, beforeEach, vi } from 'vitest';
import profile from './__fixtures__/real/profile-warrior-l72.json';
import lootBag from './__fixtures__/real/drop-batch.json';
import {
  importFlow,
  loadImportText,
  confirmImport,
  closeImport,
  setImportMode,
  undoLastUpdate,
  takeHandoff,
  resetImportFlow,
} from './importFlow.svelte.js';
import { rosterStore } from './rosterStore.svelte.js';
import { KEY, KEY_V1 } from './storage.js';
import { normaliseCharacter } from './model/index.js';

const text = (v) => JSON.stringify(v);

beforeEach(() => {
  localStorage.clear();
  resetImportFlow();
  rosterStore.roster.characters.splice(0);
  rosterStore.addCharacter('Aria', 'WARRIOR');
});

describe('junk import', () => {
  it('shows the specific error and leaves the roster exactly as it was', () => {
    const before = text(rosterStore.roster);
    for (const [junk, re] of [
      ['{nope', /not valid JSON/],
      ['{"hello":1}', /Valid JSON, but not a roster backup/],
      ['', /empty/],
      [text({ schemaVersion: 2, characters: [] }), /no characters/],
    ]) {
      expect(loadImportText(junk)).toBe(false);
      expect(importFlow.error).toMatch(re);
      expect(importFlow.plan).toBeNull();
      expect(confirmImport()).toBe(false); // nothing to confirm
    }
    expect(text(rosterStore.roster)).toBe(before);
  });
});

describe('game profile', () => {
  it('defaults to Create when no character has the name, and Create appends one', () => {
    expect(loadImportText(text(profile))).toBe(true);
    expect(importFlow.mode).toBe('create');
    const n = rosterStore.roster.characters.length;
    expect(confirmImport()).toBe(true);
    expect(rosterStore.roster.characters).toHaveLength(n + 1);
    expect(importFlow.open).toBe(false);
  });

  it('defaults to Update when the name matches; Update keeps presets, opponents and runs, and Undo restores', () => {
    loadImportText(text(profile));
    const name = importFlow.plan.character.name;
    closeImport();
    const id = rosterStore.current.id;
    rosterStore.renameCharacter(id, name);
    const presetNames = rosterStore.current.presets.map((p) => p.name);
    rosterStore.current.opponents.push({ id: 'o1', name: 'Rival', class: 'MYSTIC', spec: null, sheet: { values: { totalAttack: 1 }, enteredAt: 'x' }, sigils: [] });
    const snapshot = text(normaliseCharacter(JSON.parse(text(rosterStore.current)))); // the opponent above as the model holds it

    loadImportText(text(profile));
    expect(importFlow.mode).toBe('update');
    expect(importFlow.plan.match.id).toBe(id);
    const count = rosterStore.roster.characters.length;
    expect(confirmImport()).toBe(true);

    expect(rosterStore.roster.characters).toHaveLength(count); // no new character
    expect(rosterStore.current.id).toBe(id);
    expect(rosterStore.current.presets.map((p) => p.name)).toEqual(presetNames);
    expect(rosterStore.current.opponents).toHaveLength(1);
    expect(rosterStore.current.level).toBe(profile.player.level);
    expect(importFlow.undo?.name).toBe(name);

    expect(undoLastUpdate()).toBe(true);
    expect(text(rosterStore.current)).toBe(snapshot);
    expect(importFlow.undo).toBeNull();
    expect(undoLastUpdate()).toBe(false); // one step only
  });

  it('"Add as a new character" on a matching name still creates one', () => {
    loadImportText(text(profile));
    const name = importFlow.plan.character.name;
    closeImport();
    rosterStore.renameCharacter(rosterStore.current.id, name);
    loadImportText(text(profile));
    setImportMode('create');
    const n = rosterStore.roster.characters.length;
    confirmImport();
    expect(rosterStore.roster.characters).toHaveLength(n + 1);
    expect(rosterStore.current.name).toBe(`${name} (imported)`);
  });
});

describe('roster backup', () => {
  it('replaces after the confirm, offering the current roster as a download first', () => {
    const backup = text({ schemaVersion: 2, characters: [rosterStore.roster.characters[0]], currentId: rosterStore.roster.characters[0].id });
    rosterStore.addCharacter('Second', 'MYSTIC');
    const exportSpy = vi.spyOn(rosterStore, 'exportDownload').mockImplementation(() => {});
    loadImportText(backup);
    expect(importFlow.plan.replaces.characters).toBe(2);
    expect(importFlow.backupFirst).toBe(true);
    expect(rosterStore.roster.characters).toHaveLength(2); // nothing written yet
    confirmImport();
    expect(exportSpy).toHaveBeenCalledTimes(1);
    expect(rosterStore.roster.characters).toHaveLength(1);
    exportSpy.mockRestore();
  });

  it('never deletes the v1 key', () => {
    localStorage.setItem(KEY_V1, '{"probe":true}');
    loadImportText(text({ schemaVersion: 2, characters: [rosterStore.roster.characters[0]], currentId: rosterStore.roster.characters[0].id }));
    const spy = vi.spyOn(rosterStore, 'exportDownload').mockImplementation(() => {});
    confirmImport();
    spy.mockRestore();
    expect(localStorage.getItem(KEY_V1)).toBe('{"probe":true}');
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });
});

describe('loot bag and fight log', () => {
  it('are handed to their tool once, without touching the roster', () => {
    const before = text(rosterStore.roster);
    loadImportText(text(lootBag));
    expect(importFlow.plan.kind).toBe('lootBag');
    confirmImport();
    expect(text(rosterStore.roster)).toBe(before);
    expect(takeHandoff('fightLog')).toBeNull();
    expect(takeHandoff('lootBag')).toContain('pendingItems');
    expect(takeHandoff('lootBag')).toBeNull();
  });
});
