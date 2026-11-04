import { describe, it, expect, beforeEach } from 'vitest';
import { createContext } from './context.js';
import { createPresetsStore } from './presets.js';
import { newCharacter } from '../model/index.js';
import { MAX_PRESETS, MIN_PRESETS } from '../model/presets.js';

// A fresh store per test, so the session-only undo slot starts empty.
let roster;
let saves;
let store;
const cur = () => roster.characters.find((c) => c.id === roster.currentId);
const ids = () => cur().presets.map((p) => p.id);

beforeEach(() => {
  const a = newCharacter('A', 'WARRIOR');
  const b = newCharacter('B', 'MYSTIC');
  roster = { characters: [a, b], currentId: a.id };
  saves = 0;
  store = createPresetsStore(createContext({ getRoster: () => roster, setRoster: (r) => (roster = r), persist: () => (saves += 1) }));
  store.addPreset('Third'); // three presets, so one can be deleted
  store.setActivePreset(ids()[0]);
});

describe('restoreDeletedPreset', () => {
  it('does nothing with nothing deleted', () => {
    saves = 0;
    expect(store.deletedPresetStatus()).toBe('none');
    expect(store.restoreDeletedPreset()).toBeNull();
    expect(saves).toBe(0);
  });

  it('puts the preset back at the same index with the same fields, and persists', () => {
    const p = cur().presets[1];
    store.renamePreset(p.id, 'Arena');
    store.setPresetEquipmentSet(p.id, 2);
    store.setPresetRelics(p.id, ['r1']);
    const before = JSON.parse(JSON.stringify(cur().presets[1]));
    expect(store.deletePreset(p.id)).toBe(true);
    expect(ids()).not.toContain(p.id);
    saves = 0;
    expect(store.restoreDeletedPreset()).toBe(p.id);
    expect(ids()[1]).toBe(p.id);
    expect(cur().presets[1]).toMatchObject({ name: 'Arena', equipmentSet: 2, sigilSpecies: before.sigilSpecies });
    expect(saves).toBe(1);
  });

  it('re-activates a preset that was active', () => {
    const p = ids()[2];
    store.setActivePreset(p);
    store.deletePreset(p);
    expect(cur().activePresetId).not.toBe(p);
    store.restoreDeletedPreset();
    expect(cur().activePresetId).toBe(p);
  });

  it('keeps the active preset when the restored one was not active', () => {
    const active = cur().activePresetId;
    store.deletePreset(ids()[2]);
    store.restoreDeletedPreset();
    expect(cur().activePresetId).toBe(active);
  });

  it('is one step: a second restore does nothing, and a second delete replaces the slot', () => {
    store.addPreset('Fourth');
    const [, b, c, d] = ids();
    store.deletePreset(b);
    store.deletePreset(d);
    expect(store.restoreDeletedPreset()).toBe(d);
    expect(ids()).not.toContain(b);
    expect(ids()).toContain(c);
    expect(store.restoreDeletedPreset()).toBeNull();
  });

  it('refuses at the 8-preset cap and keeps the slot until there is room', () => {
    const gone = ids()[2];
    store.deletePreset(gone);
    while (cur().presets.length < MAX_PRESETS) store.addPreset();
    expect(store.deletedPresetStatus()).toBe('full');
    expect(store.restoreDeletedPreset()).toBeNull();
    expect(cur().presets).toHaveLength(MAX_PRESETS);
    store.deletePreset(ids()[MAX_PRESETS - 1]); // this replaces the slot with the newer delete
    expect(store.restoreDeletedPreset()).not.toBe(gone);
    expect(cur().presets).toHaveLength(MAX_PRESETS);
  });

  it('still refuses to delete below the minimum', () => {
    store.deletePreset(ids()[2]);
    expect(cur().presets).toHaveLength(MIN_PRESETS);
    expect(store.deletePreset(ids()[1])).toBe(false);
    expect(store.restoreDeletedPreset()).toBeTruthy(); // the earlier delete is still undoable
  });

  it('restores into the character it came from, even after switching character', () => {
    const a = cur();
    const gone = ids()[2];
    store.deletePreset(gone);
    roster.currentId = roster.characters[1].id;
    expect(store.restoreDeletedPreset()).toBe(gone);
    expect(a.presets.map((p) => p.id)).toContain(gone);
    expect(cur().presets.map((p) => p.id)).not.toContain(gone);
  });

  it('drops references that no longer resolve', () => {
    const p = ids()[2];
    cur().presets[2].petId = 'pet-gone';
    cur().presets[2].mountId = 'mount-gone';
    store.deletePreset(p);
    store.restoreDeletedPreset();
    expect(cur().presets[2].petId).toBeNull();
    expect(cur().presets[2].mountId).toBeNull();
  });

  it('gives a fresh id when the old one is taken', () => {
    const p = ids()[2];
    store.deletePreset(p);
    const n = store.addPreset('Clash');
    cur().presets.find((x) => x.id === n).id = p;
    const restored = store.restoreDeletedPreset();
    expect(restored).not.toBe(p);
    expect(new Set(ids()).size).toBe(ids().length);
  });

  it('gives the Oblivion sheet back to the preset that owned it', () => {
    const p = ids()[2];
    cur().oblivion.sheet = { values: { totalHp: 1000 }, enteredAt: '2026-11-04T00:00:00.000Z', presetId: p };
    store.deletePreset(p);
    expect(cur().oblivion.sheet.presetId).toBeNull();
    store.restoreDeletedPreset();
    expect(cur().oblivion.sheet.presetId).toBe(p);
  });

  it('leaves the Oblivion sheet alone when another preset took it meanwhile', () => {
    const p = ids()[2];
    cur().oblivion.sheet = { values: { totalHp: 1000 }, enteredAt: '2026-11-04T00:00:00.000Z', presetId: p };
    store.deletePreset(p);
    cur().oblivion.sheet.presetId = ids()[0];
    store.restoreDeletedPreset();
    expect(cur().oblivion.sheet.presetId).toBe(ids()[0]);
  });
});
