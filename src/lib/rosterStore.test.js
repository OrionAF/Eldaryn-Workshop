/**
 * Smoke test for rosterStore.svelte.js: proves the store round-trips through
 * localStorage the way the app relies on, without needing a browser.
 * rosterStore is a module-level singleton (like the real app), so tests
 * share state across `it` blocks within this file - each test only asserts
 * on state it just set, and mutating tests clean up after themselves where
 * a later test's determinism depends on it.
 */
import { it, expect, beforeEach } from 'vitest';
import { rosterStore } from './rosterStore.svelte.js';
import { TALENT_TREES } from './talentTreeData.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { PRESET_RELIC_CAP } from './constants.js';

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

  while (rosterStore.roster.characters.length > 1) {
    rosterStore.deleteCharacter(rosterStore.roster.characters[0].id);
  }
  const lastId = rosterStore.roster.characters[0].id;
  const deleted = rosterStore.deleteCharacter(lastId);
  expect(deleted).toBe(false);
  expect(rosterStore.roster.characters.length).toBe(1);
});

// --- Drop (per-character, deviation from the pre-redesign roster-wide drop) ---
it('drop lifecycle: starts, edits, is per-character (does NOT survive a character switch), applies, then clears', () => {
  rosterStore.addCharacter('Char A');
  const charA = rosterStore.current.id;
  const charB = rosterStore.addCharacter('Char B');

  rosterStore.selectCharacter(charA);
  rosterStore.startDrop('Weapon');
  rosterStore.setDropField('attack', 500);
  expect(rosterStore.current.drop.slot).toBe('Weapon');
  expect(rosterStore.current.drop.piece.attack).toBe(500);

  // Per-character drop: switching characters does NOT carry Char A's drop over to Char B.
  rosterStore.selectCharacter(charB);
  expect(rosterStore.current.drop).toBe(null);

  rosterStore.selectCharacter(charA);
  expect(rosterStore.current.drop.piece.attack).toBe(500); // Char A's own drop is still there

  rosterStore.applyDropToLoadout(0);
  expect(rosterStore.current.drop).toBe(null); // apply clears it
  expect(rosterStore.current.loadouts[0].gear.Weapon.attack).toBe(500);
});

it('startDrop then clearDrop discards without applying', () => {
  rosterStore.startDrop('Ring');
  rosterStore.setDropField('crit', 10);
  rosterStore.clearDrop();
  expect(rosterStore.current.drop).toBe(null);
});

it("applyDropToLoadout always updates gear, but never touches a preset's manualStats", () => {
  const preset = rosterStore.current.presets[0];
  rosterStore.setPresetTotalsMode(preset.id, 'manual');
  const staleManualAttack = rosterStore.current.presets[0].manualStats.attack;

  rosterStore.startDrop('Ring');
  rosterStore.setDropField('attack', 42);
  rosterStore.applyDropToLoadout(0);

  expect(rosterStore.current.loadouts[0].gear.Ring.attack).toBe(42); // gear always updates
  expect(rosterStore.current.presets[0].manualStats.attack).toBe(staleManualAttack); // untouched
});

// --- Presets ---
it('addPreset defaults to Calculated mode (unlike the seeded first preset, which starts Manual)', () => {
  expect(rosterStore.current.presets[0].manualTotals).toBe(true); // seeded default
  const id = rosterStore.addPreset('Arena');
  const preset = rosterStore.current.presets.find((p) => p.id === id);
  expect(preset.name).toBe('Arena');
  expect(preset.manualTotals).toBe(false);
});

it('renamePreset/deletePreset round-trip, with last-preset guard', () => {
  const id = rosterStore.addPreset('Temp');
  rosterStore.renamePreset(id, 'Renamed Preset');
  expect(rosterStore.current.presets.find((p) => p.id === id).name).toBe('Renamed Preset');

  expect(rosterStore.deletePreset(id)).toBe(true);
  expect(rosterStore.current.presets.some((p) => p.id === id)).toBe(false);

  // Delete down to the last preset, then confirm the guard blocks it.
  while (rosterStore.current.presets.length > 1) {
    rosterStore.deletePreset(rosterStore.current.presets[rosterStore.current.presets.length - 1].id);
  }
  const lastId = rosterStore.current.presets[0].id;
  expect(rosterStore.deletePreset(lastId)).toBe(false);
  expect(rosterStore.current.presets.length).toBe(1);
});

it('setPresetLoadout/setPresetTalentSet/setPresetPet round-trip', () => {
  const preset = rosterStore.current.presets[0];
  rosterStore.setPresetLoadout(preset.id, 1);
  expect(rosterStore.current.presets[0].loadout).toBe(1);
  rosterStore.setPresetTalentSet(preset.id, 1);
  expect(rosterStore.current.presets[0].talentSet).toBe(1);

  const petId = rosterStore.addPet('Ashfang', 'Epic');
  rosterStore.setPresetPet(preset.id, petId);
  expect(rosterStore.current.presets[0].petId).toBe(petId);
  rosterStore.removePet(petId);
});

it('setPresetTotalsMode snapshots calculated totals into manualStats when switching TO manual', () => {
  const preset = rosterStore.current.presets[0];
  rosterStore.setPresetTotalsMode(preset.id, 'calculated');
  rosterStore.setGearField('Weapon', preset.loadout, 'attack', 777);

  rosterStore.setPresetTotalsMode(preset.id, 'manual');
  expect(rosterStore.current.presets[0].manualTotals).toBe(true);
  expect(rosterStore.current.presets[0].manualStats.attack).toBeGreaterThan(0); // snapshotted, not zero

  rosterStore.setGearField('Weapon', preset.loadout, 'attack', 0); // cleanup
});

it('setPresetManualStat writes directly into manualStats', () => {
  const preset = rosterStore.current.presets[0];
  rosterStore.setPresetManualStat(preset.id, 'crit', 42);
  expect(rosterStore.current.presets[0].manualStats.crit).toBe(42);
  rosterStore.setPresetManualStat(preset.id, 'crit', 0); // cleanup
});

// --- Pets (shared collection, character-wide level, a preset picks which one contributes) ---
it('addPet/updatePetField/updatePetStat/removePet round-trip; removePet nulls petId on presets that used it', () => {
  const id = rosterStore.addPet('Ashfang', 'Epic');
  rosterStore.updatePetField(id, 'name', 'Ashfang Renamed');
  rosterStore.updatePetStat(id, 'attack', 2664);
  const pet = rosterStore.current.pets.find((p) => p.id === id);
  expect(pet.name).toBe('Ashfang Renamed');
  expect(pet.stats.attack).toBe(2664);

  const preset = rosterStore.current.presets[0];
  rosterStore.setPresetPet(preset.id, id);
  expect(rosterStore.current.presets[0].petId).toBe(id);

  rosterStore.removePet(id);
  expect(rosterStore.current.pets.some((p) => p.id === id)).toBe(false);
  expect(rosterStore.current.presets[0].petId).toBe(null); // nulled, not left dangling
});

it('setPetLevel is character-wide (one level for every pet)', () => {
  rosterStore.setPetLevel(15);
  expect(rosterStore.current.petLevel).toBe(15);
  rosterStore.setPetLevel(1); // cleanup
});

// --- Mounts ---
it('addMount/setActiveMount/updateMount/removeMount round-trip', () => {
  const id = rosterStore.addMount('Crystal Beast', 'Uncommon');
  expect(rosterStore.current.mounts.activeId).toBe(id);

  rosterStore.updateMount(id, 'baseHpPct', 19);
  rosterStore.updateMount(id, 'baseAtkPct', 10);
  const mount = rosterStore.current.mounts.entries.find((m) => m.id === id);
  expect(mount.baseHpPct).toBe(19);
  expect(mount.baseAtkPct).toBe(10);

  rosterStore.removeMount(id);
  expect(rosterStore.current.mounts.entries.length).toBe(0);
  expect(rosterStore.current.mounts.activeId).toBe(null);
});

// --- Mount Glyphs (tier-capped equip) ---
it('setGlyphEquipped enforces the 3 Minor / 2 Major / 1 Mythic cap and rejects past it', () => {
  const minors = [
    rosterStore.addMountGlyph('minor', 'attack_pct', 1),
    rosterStore.addMountGlyph('minor', 'attack_pct', 2),
    rosterStore.addMountGlyph('minor', 'attack_pct', 3),
    rosterStore.addMountGlyph('minor', 'attack_pct', 4),
  ];
  expect(rosterStore.setGlyphEquipped(minors[0], true)).toBe(true);
  expect(rosterStore.setGlyphEquipped(minors[1], true)).toBe(true);
  expect(rosterStore.setGlyphEquipped(minors[2], true)).toBe(true);
  expect(rosterStore.setGlyphEquipped(minors[3], true)).toBe(false); // cap is 3

  const equippedMinors = rosterStore.current.glyphs.entries.filter((g) => g.tier === 'minor' && g.equipped);
  expect(equippedMinors.length).toBe(3);

  const mythics = [rosterStore.addMountGlyph('mythic', 'crit', 5), rosterStore.addMountGlyph('mythic', 'crit', 6)];
  expect(rosterStore.setGlyphEquipped(mythics[0], true)).toBe(true);
  expect(rosterStore.setGlyphEquipped(mythics[1], true)).toBe(false); // cap is 1

  rosterStore.setGlyphEquipped(minors[0], false);
  expect(rosterStore.setGlyphEquipped(minors[3], true)).toBe(true);

  rosterStore.removeMountGlyph(minors[3]);
  expect(rosterStore.current.glyphs.entries.some((g) => g.id === minors[3])).toBe(false);
});

// --- Talent Sets ---
it('setCharacterClass resets both talent sets, relicLevels, every preset relicIds, and Transcendence', () => {
  const id = rosterStore.current.id;
  rosterStore.setTalentSetSpec(0, 'arms');
  rosterStore.setCharacterClass(id, 'Warrior');
  expect(rosterStore.current.class).toBe('Warrior');
  expect(rosterStore.current.talentSets[0].spec).toBe(null);
  expect(rosterStore.current.talentSets[0].allocation).toEqual({});
  expect(rosterStore.current.relicLevels).toEqual({});
  expect(rosterStore.current.presets[0].relicIds).toEqual([]);
  expect(rosterStore.current.transcendence.unlockedPositions).toEqual([]);

  rosterStore.setTalentSetSpec(0, 'arms');
  rosterStore.setCharacterClass(id, 'Sentinel');
  expect(rosterStore.current.talentSets[0].spec).toBe(null);
});

it('setTalentSetSpec clears any prior allocation (different tree, different talent ids)', () => {
  rosterStore.setTalentSetSpec(0, 'arms');
  rosterStore.current.talentSets[0].allocation = { 'stale-id': 3 };
  rosterStore.setTalentSetSpec(0, 'protection');
  expect(rosterStore.current.talentSets[0].allocation).toEqual({});
  expect(rosterStore.current.talentSets[0].spec).toBe('protection');
});

it('setTalentSetRank enforces the 29-point cap and rejects raising a rank in a locked tier', () => {
  const bigTalent = { id: 'big-one', name: 'Big One', statKey: 'attack_pct', ranks: Array.from({ length: 30 }, (_, i) => i + 1) };
  const smallTalent = { id: 'small-one', name: 'Small One', statKey: 'attack_pct', ranks: [1, 2, 3, 4, 5] };
  const gatedTalent = { id: 'gated', name: 'Gated', statKey: 'crit', ranks: [1] };
  TALENT_TREES.protection = {
    description: '',
    tiers: [
      { id: 'tier-0', threshold: 0, talents: [bigTalent, smallTalent] },
      { id: 'tier-1', threshold: 5, talents: [gatedTalent] },
    ],
  };

  rosterStore.setTalentSetSpec(0, 'protection');
  expect(rosterStore.setTalentSetRank(0, bigTalent.id, 30)).toBe(false); // would spend 30 points > 29 cap
  expect(rosterStore.setTalentSetRank(0, gatedTalent.id, 1)).toBe(false); // tier 1 locked

  expect(rosterStore.setTalentSetRank(0, smallTalent.id, 5)).toBe(true); // spends 5 points in tier 0
  expect(rosterStore.setTalentSetRank(0, gatedTalent.id, 1)).toBe(true); // tier 1 now unlocked
  expect(rosterStore.current.talentSets[0].allocation[gatedTalent.id]).toBe(1);

  rosterStore.resetTalentSet(0);
  expect(rosterStore.current.talentSets[0].allocation).toEqual({});
});

// --- Awakening ---
it('setAwakeningPath/setAwakeningPoints/resetAwakening round-trip; switching path resets points', () => {
  expect(rosterStore.setAwakeningPath('shadow')).toBe(true);
  expect(rosterStore.current.awakening).toEqual({ path: 'shadow', points: 0 });

  expect(rosterStore.setAwakeningPoints(5)).toBe(true);
  expect(rosterStore.current.awakening.points).toBe(5);

  expect(rosterStore.setAwakeningPoints(999)).toBe(true); // clamps to the 15-point cap
  expect(rosterStore.current.awakening.points).toBe(15);

  expect(rosterStore.setAwakeningPath('radiant')).toBe(true); // switching paths resets points
  expect(rosterStore.current.awakening).toEqual({ path: 'radiant', points: 0 });

  expect(rosterStore.setAwakeningPath('not-a-real-path')).toBe(false);
  expect(rosterStore.current.awakening.path).toBe('radiant');

  rosterStore.resetAwakening();
  expect(rosterStore.current.awakening).toEqual({ path: null, points: 0 });
});

it('setAwakeningPoints is a no-op with no path chosen yet', () => {
  rosterStore.resetAwakening();
  expect(rosterStore.setAwakeningPoints(5)).toBe(false);
  expect(rosterStore.current.awakening.points).toBe(0);
});

// --- Transcendence ---
it('setTranscendenceNode: nothing is unlocked by default, not even the start', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');

  expect(rosterStore.setTranscendenceNode('14:24', true)).toBe(false); // adjacent to the start, but start isn't unlocked yet
  expect(rosterStore.setTranscendenceNode('20:3', true)).toBe(false); // far from everything
  expect(rosterStore.setTranscendenceNode('5:10', true)).toBe(false); // a real glyph socket - never unlockable

  expect(rosterStore.setTranscendenceNode('14:25', true)).toBe(true); // the start - selectable like any other node
  expect(rosterStore.current.transcendence.unlockedPositions).toEqual(['14:25']);
  expect(rosterStore.setTranscendenceNode('14:25', true)).toBe(false); // already unlocked

  expect(rosterStore.setTranscendenceNode('14:24', true)).toBe(true);
  expect(rosterStore.current.transcendence.unlockedPositions).toEqual(['14:25', '14:24']);
});

it('setTranscendenceNode removal cascades: removing a bridge node drops what it was the only connection for', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  rosterStore.setTranscendenceNode('14:25', true);
  rosterStore.setTranscendenceNode('14:24', true);
  rosterStore.setTranscendenceNode('14:23', true);
  expect(rosterStore.current.transcendence.unlockedPositions).toEqual(['14:25', '14:24', '14:23']);

  expect(rosterStore.setTranscendenceNode('14:24', false)).toBe(true);
  expect(rosterStore.current.transcendence.unlockedPositions).toEqual(['14:25']);
});

it('setTranscendenceNode is a no-op for a class with no tree data yet (Warrior)', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  expect(rosterStore.setTranscendenceNode('14:24', true)).toBe(false);
});

// --- Relics (character-wide levels, equipped per-preset) ---
it('setRelicLevel is character-wide and rejects an invalid defId', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'basalt-guard');

  expect(rosterStore.setRelicLevel(def.id, 5)).toBe(true);
  expect(rosterStore.current.relicLevels[def.id]).toBe(5);

  expect(rosterStore.setRelicLevel(def.id, 999)).toBe(true); // clamps to maxLevel
  expect(rosterStore.current.relicLevels[def.id]).toBe(def.maxLevel);

  expect(rosterStore.setRelicLevel('not-a-real-relic', 5)).toBe(false);
});

it('toggleRelicOnPreset enforces the per-preset relic cap independently of other presets', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  const relics = RELICS_BY_CLASS.Warrior.slice(0, PRESET_RELIC_CAP + 1);
  const presetId = rosterStore.current.presets[0].id;

  for (const r of relics.slice(0, PRESET_RELIC_CAP)) {
    expect(rosterStore.toggleRelicOnPreset(presetId, r.id, true)).toBe(true);
  }
  const extra = relics[PRESET_RELIC_CAP];
  expect(rosterStore.toggleRelicOnPreset(presetId, extra.id, true)).toBe(false); // over cap, rejected
  expect(rosterStore.current.presets[0].relicIds.length).toBe(PRESET_RELIC_CAP);

  // A second preset has its own independent cap.
  const otherPresetId = rosterStore.addPreset('Other');
  expect(rosterStore.toggleRelicOnPreset(otherPresetId, extra.id, true)).toBe(true);

  // Re-toggling an already-equipped relic never counts against the cap.
  expect(rosterStore.toggleRelicOnPreset(presetId, relics[0].id, true)).toBe(true);

  // Unequipping frees a slot.
  rosterStore.toggleRelicOnPreset(presetId, relics[0].id, false);
  expect(rosterStore.toggleRelicOnPreset(presetId, extra.id, true)).toBe(true);
});

it('toggleRelicOnPreset rejects an invalid defId', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  const presetId = rosterStore.current.presets[0].id;
  expect(rosterStore.toggleRelicOnPreset(presetId, 'not-a-real-relic', true)).toBe(false);
});
