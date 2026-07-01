/**
 * Smoke test for rosterStore.svelte.js (build step 2 checkpoint): proves the
 * store round-trips through localStorage the way App.svelte's rename input
 * relies on, without needing a browser. rosterStore is a module-level
 * singleton (like the real app), so tests share state across `it` blocks
 * within this file - each test only asserts on state it just set.
 */
import { it, expect, beforeEach } from 'vitest';
import { rosterStore } from './rosterStore.svelte.js';

const STORAGE_KEY = 'eldaryn_optimiser_state_v1';

beforeEach(() => {
  localStorage.clear();
});

it('localStorage is actually available in this test environment (not silently no-op)', () => {
  localStorage.setItem('probe', '1');
  expect(localStorage.getItem('probe')).toBe('1');
});

it('renameCharacter updates current.name and persists to localStorage', () => {
  const id = rosterStore.current.id;
  rosterStore.renameCharacter(id, 'Renamed Hero');
  expect(rosterStore.current.name).toBe('Renamed Hero');

  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
  const savedChar = saved.characters.find((c) => c.id === id);
  expect(savedChar.name).toBe('Renamed Hero');
});

it('a persisted rename survives a simulated reload (loadRoster reads what saveRoster wrote)', async () => {
  const id = rosterStore.current.id;
  rosterStore.renameCharacter(id, 'Survives Reload');

  // Simulate a page reload: re-import storage.js's loadRoster fresh against
  // the same localStorage, exactly what main.js does on next page load.
  const { loadRoster } = await import('./storage.js');
  const reloaded = loadRoster();
  const reloadedChar = reloaded.characters.find((c) => c.id === id);
  expect(reloadedChar.name).toBe('Survives Reload');
});

it('addCharacter/selectCharacter/deleteCharacter round-trip, with last-character guard', () => {
  const startCount = rosterStore.roster.characters.length;
  const newId = rosterStore.addCharacter('Alt');
  expect(rosterStore.current.id).toBe(newId);
  expect(rosterStore.roster.characters.length).toBe(startCount + 1);

  const firstId = rosterStore.roster.characters[0].id;
  rosterStore.selectCharacter(firstId);
  expect(rosterStore.current.id).toBe(firstId);

  // Delete down to one character, then confirm the guard blocks the last delete.
  while (rosterStore.roster.characters.length > 1) {
    rosterStore.deleteCharacter(rosterStore.roster.characters[0].id);
  }
  const lastId = rosterStore.roster.characters[0].id;
  const deleted = rosterStore.deleteCharacter(lastId);
  expect(deleted).toBe(false);
  expect(rosterStore.roster.characters.length).toBe(1);
});

it('drop lifecycle: starts, edits, survives a character switch, applies via applySwap, then clears', () => {
  rosterStore.addCharacter('Char A');
  const charA = rosterStore.current.id;
  const charB = rosterStore.addCharacter('Char B');

  rosterStore.selectCharacter(charA);
  rosterStore.startDrop('Weapon');
  rosterStore.setDropField('attack', 500);
  expect(rosterStore.roster.drop.slot).toBe('Weapon');
  expect(rosterStore.roster.drop.piece.attack).toBe(500);

  // Switching characters must not clear the roster-level drop.
  rosterStore.selectCharacter(charB);
  expect(rosterStore.roster.drop.piece.attack).toBe(500);

  rosterStore.selectCharacter(charA);
  const beforeAttack = rosterStore.current.loadouts[0].profileTotals.attack;
  rosterStore.applyDropToLoadout(0);
  expect(rosterStore.roster.drop).toBe(null); // apply clears the shared drop
  expect(rosterStore.current.loadouts[0].gear.Weapon.attack).toBe(500);
  expect(rosterStore.current.loadouts[0].profileTotals.attack).not.toBe(beforeAttack);
});

it('startDrop then clearDrop discards without applying', () => {
  rosterStore.startDrop('Ring');
  rosterStore.setDropField('crit', 10);
  rosterStore.clearDrop();
  expect(rosterStore.roster.drop).toBe(null);
});
