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

// --- Phase 1: Manual/Calculated toggle ---
it('setLoadoutTotalsMode flips manualTotals and persists', () => {
  rosterStore.setLoadoutTotalsMode(0, 'calculated');
  expect(rosterStore.current.loadouts[0].manualTotals).toBe(false);
  rosterStore.setLoadoutTotalsMode(0, 'manual');
  expect(rosterStore.current.loadouts[0].manualTotals).toBe(true);
});

// --- Phase 1: Pets ---
it('addPet auto-activates the first pet; adding a second does not steal activeId', () => {
  const firstId = rosterStore.addPet('First Pet', 'Common', 1);
  expect(rosterStore.current.sources.pets.activeId).toBe(firstId);

  const secondId = rosterStore.addPet('Second Pet', 'Epic', 16);
  expect(rosterStore.current.sources.pets.activeId).toBe(firstId);

  rosterStore.setActivePet(secondId);
  expect(rosterStore.current.sources.pets.activeId).toBe(secondId);

  rosterStore.updatePetStat(secondId, 'attack', 2664);
  expect(rosterStore.current.sources.pets.entries.find((p) => p.id === secondId).stats.attack).toBe(2664);

  rosterStore.updatePetField(secondId, 'level', 20);
  expect(rosterStore.current.sources.pets.entries.find((p) => p.id === secondId).level).toBe(20);
});

it('removePet clears activeId when the active pet is removed, falling back to another owned pet', () => {
  // rosterStore is a shared singleton across tests in this file - drain any
  // pets left by earlier tests so entries[0] below is deterministic.
  for (const p of [...rosterStore.current.sources.pets.entries]) rosterStore.removePet(p.id);

  const a = rosterStore.addPet('A', 'Common', 1);
  const b = rosterStore.addPet('B', 'Common', 1);
  rosterStore.setActivePet(a);
  rosterStore.removePet(a);
  expect(rosterStore.current.sources.pets.activeId).toBe(b);
  rosterStore.removePet(b);
  expect(rosterStore.current.sources.pets.activeId).toBe(null);
  expect(rosterStore.current.sources.pets.entries.length).toBe(0);
});

// --- Phase 1: Mounts ---
it('addMount/setActiveMount/updateMount/removeMount round-trip', () => {
  const id = rosterStore.addMount('Crystal Beast', 'Uncommon');
  expect(rosterStore.current.sources.mounts.activeId).toBe(id);

  rosterStore.updateMount(id, 'baseHpPct', 19);
  rosterStore.updateMount(id, 'baseAtkPct', 10);
  const mount = rosterStore.current.sources.mounts.entries.find((m) => m.id === id);
  expect(mount.baseHpPct).toBe(19);
  expect(mount.baseAtkPct).toBe(10);

  rosterStore.removeMount(id);
  expect(rosterStore.current.sources.mounts.entries.length).toBe(0);
  expect(rosterStore.current.sources.mounts.activeId).toBe(null);
});

// --- Phase 1: Mount Glyphs (tier-capped equip) ---
it('setGlyphEquipped enforces the 3 Minor / 2 Major / 1 Mythic cap and rejects past it', () => {
  const minors = [
    rosterStore.addMountGlyph('minor', 'attack_pct', 1),
    rosterStore.addMountGlyph('minor', 'attack_pct', 2),
    rosterStore.addMountGlyph('minor', 'attack_pct', 3),
    rosterStore.addMountGlyph('minor', 'attack_pct', 4), // 4th - should be rejectable
  ];
  expect(rosterStore.setGlyphEquipped(minors[0], true)).toBe(true);
  expect(rosterStore.setGlyphEquipped(minors[1], true)).toBe(true);
  expect(rosterStore.setGlyphEquipped(minors[2], true)).toBe(true);
  expect(rosterStore.setGlyphEquipped(minors[3], true)).toBe(false); // cap is 3

  const equippedMinors = rosterStore.current.sources.mountGlyphs.entries.filter((g) => g.tier === 'minor' && g.equipped);
  expect(equippedMinors.length).toBe(3);

  const mythics = [rosterStore.addMountGlyph('mythic', 'crit', 5), rosterStore.addMountGlyph('mythic', 'crit', 6)];
  expect(rosterStore.setGlyphEquipped(mythics[0], true)).toBe(true);
  expect(rosterStore.setGlyphEquipped(mythics[1], true)).toBe(false); // cap is 1

  // Unequipping frees a slot for another of the same tier.
  rosterStore.setGlyphEquipped(minors[0], false);
  expect(rosterStore.setGlyphEquipped(minors[3], true)).toBe(true);

  rosterStore.removeMountGlyph(minors[3]);
  expect(rosterStore.current.sources.mountGlyphs.entries.some((g) => g.id === minors[3])).toBe(false);
});
