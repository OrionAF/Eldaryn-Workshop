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

it('applyDropToLoadout always updates gear, but only overwrites profileTotals in Manual mode', () => {
  rosterStore.setLoadoutTotalsMode(0, 'calculated');
  const staleManualValue = rosterStore.current.loadouts[0].profileTotals.attack;
  rosterStore.startDrop('Ring');
  rosterStore.setDropField('attack', 42);
  rosterStore.applyDropToLoadout(0);

  expect(rosterStore.current.loadouts[0].gear.Ring.attack).toBe(42); // gear always updates
  expect(rosterStore.current.loadouts[0].profileTotals.attack).toBe(staleManualValue); // untouched in Calculated mode

  rosterStore.setLoadoutTotalsMode(0, 'manual');
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

// --- Phase: Talents ---
it('setCharacterClass sets the class and resets both loadouts spec/talentAllocation', () => {
  const id = rosterStore.current.id;
  rosterStore.setLoadoutSpec(0, 'fury'); // pretend a spec was set (class check isn't enforced at this layer)
  rosterStore.setCharacterClass(id, 'Warrior');
  expect(rosterStore.current.class).toBe('Warrior');
  expect(rosterStore.current.loadouts[0].spec).toBe(null);
  expect(rosterStore.current.loadouts[0].talentAllocation).toEqual({});

  rosterStore.setLoadoutSpec(0, 'fury');
  rosterStore.setCharacterClass(id, 'Sentinel'); // switching class again also resets
  expect(rosterStore.current.loadouts[0].spec).toBe(null);
});

it('setLoadoutSpec clears any prior talentAllocation (different tree, different talent ids)', () => {
  rosterStore.setLoadoutSpec(0, 'fury');
  rosterStore.current.loadouts[0].talentAllocation = { 'stale-id': 3 };
  rosterStore.setLoadoutSpec(0, 'protection');
  expect(rosterStore.current.loadouts[0].talentAllocation).toEqual({});
  expect(rosterStore.current.loadouts[0].spec).toBe('protection');
});

it('talent tree authoring: addTalentTier/addTalent/setTalentRankValue/removeTalent round-trip', () => {
  rosterStore.addTalentTier('fury', 0);
  const tier = rosterStore.roster.talentTrees.fury.tiers.at(-1);
  const talentId = rosterStore.addTalent('fury', tier.id, 'Sharp Aim', 'crit');
  expect(rosterStore.roster.talentTrees.fury.tiers.at(-1).talents.some((t) => t.id === talentId)).toBe(true);

  rosterStore.addTalentRank('fury', talentId); // now 2 ranks: [0, 0]
  rosterStore.setTalentRankValue('fury', talentId, 0, 2);
  rosterStore.setTalentRankValue('fury', talentId, 1, 5);
  const found = rosterStore.roster.talentTrees.fury.tiers.at(-1).talents.find((t) => t.id === talentId);
  expect(found.ranks).toEqual([2, 5]);

  rosterStore.removeTalent('fury', talentId);
  expect(rosterStore.roster.talentTrees.fury.tiers.at(-1).talents.some((t) => t.id === talentId)).toBe(false);
});

it('setTalentRank enforces the 29-point cap and rejects raising a rank in a locked tier', () => {
  // Build a tiny 2-tier tree: tier 0 threshold 0 (always unlocked), tier 1 threshold 5.
  // Points spent = the rank NUMBER itself (1 point per rank), independent of the stat
  // value stored at that rank - a talent needs 30 ranks for raising it to rank 30 to
  // cost 30 points (> the 29 cap), regardless of what stat values are assigned.
  rosterStore.addTalentTier('protection', 0);
  rosterStore.addTalentTier('protection', 5);
  const tiers = rosterStore.roster.talentTrees.protection.tiers;
  const tier0 = tiers.at(-2);
  const tier1 = tiers.at(-1);
  const bigTalentId = rosterStore.addTalent('protection', tier0.id, 'Big One', 'attack_pct');
  rosterStore.updateTalent('protection', bigTalentId, 'ranks', Array.from({ length: 30 }, (_, i) => i + 1));
  const gatedTalentId = rosterStore.addTalent('protection', tier1.id, 'Gated', 'crit');
  rosterStore.updateTalent('protection', gatedTalentId, 'ranks', [1]);

  rosterStore.setLoadoutSpec(0, 'protection');
  expect(rosterStore.setTalentRank(0, bigTalentId, 30)).toBe(false); // would spend 30 points > 29 cap
  expect(rosterStore.setTalentRank(0, gatedTalentId, 1)).toBe(false); // tier 1 locked (0 spent in tier 0, needs 5)

  const smallTalentId = rosterStore.addTalent('protection', tier0.id, 'Small One', 'attack_pct');
  rosterStore.updateTalent('protection', smallTalentId, 'ranks', [1, 2, 3, 4, 5]); // 5 ranks
  expect(rosterStore.setTalentRank(0, smallTalentId, 5)).toBe(true); // spends 5 points in tier 0
  expect(rosterStore.setTalentRank(0, gatedTalentId, 1)).toBe(true); // tier 1 now unlocked (5 spent >= threshold 5)
  expect(rosterStore.current.loadouts[0].talentAllocation[gatedTalentId]).toBe(1);

  rosterStore.resetTalents(0);
  expect(rosterStore.current.loadouts[0].talentAllocation).toEqual({});
});
