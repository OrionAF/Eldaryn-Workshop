import { it, expect } from 'vitest';
import { computePresetTotals, resolveEffectiveTotals } from './totals.js';
import { newCharacter, newPetEntry, newMountEntry, newMountGlyphEntry, newPreset, emptyStats } from './model.js';
import { BASE_ATTACK, BASE_SPEED, BASE_CRIT_MULT } from './dps.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';

// Talent test fixtures: plain object literals matching talentTreeData.js's
// shape (Tier = {id, threshold, talents}, Talent = {id, name, statKey, ranks}).
function talent(id, statKey, ranks) {
  return { id, name: id, statKey, ranks };
}
function tier(id, threshold, talents) {
  return { id, threshold, talents };
}

function approx(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

it('an empty character/preset produces base stats only', () => {
  const c = newCharacter();
  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack, BASE_ATTACK)).toBe(true);
  expect(approx(totals.speed, BASE_SPEED)).toBe(true);
  expect(approx(totals.crit_mult, BASE_CRIT_MULT)).toBe(true);
  expect(totals.crit).toBe(0);
});

it("a gear slot on the preset's loadout contributes its flat Attack and Attack%", () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ attack: 500, attack_pct: 10 });
  const totals = computePresetTotals(c, c.presets[0]); // preset 0 -> loadout 0
  expect(approx(totals.attack, (BASE_ATTACK + 500) * 1.1)).toBe(true);
});

it('gear is per-loadout - a preset on Loadout 2 is unaffected by Loadout 1 gear', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ attack: 500 });
  const presetOnLoadout2 = newPreset('P2', { loadout: 1 });
  const totals = computePresetTotals(c, presetOnLoadout2);
  expect(approx(totals.attack, BASE_ATTACK)).toBe(true);
});

it("only the preset's chosen pet contributes; another pet in the shared collection does not", () => {
  const c = newCharacter();
  const chosen = newPetEntry({ name: 'Chosen Pet', stats: { attack: 2664, attack_pct: 6.2 } });
  const bench = newPetEntry({ name: 'Bench Pet', stats: { attack: 99999 } });
  c.pets = [chosen, bench];
  c.presets[0].petId = chosen.id;

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack, (BASE_ATTACK + 2664) * 1.062)).toBe(true);
});

it('two different presets may pick two different pets from the same shared collection', () => {
  const c = newCharacter();
  const petA = newPetEntry({ name: 'A', stats: { attack_pct: 3 } });
  const petB = newPetEntry({ name: 'B', stats: { attack_pct: 9 } });
  c.pets = [petA, petB];
  const presetA = newPreset('Preset A');
  presetA.petId = petA.id;
  const presetB = newPreset('Preset B');
  presetB.petId = petB.id;

  expect(approx(computePresetTotals(c, presetA).attack_pct, 3)).toBe(true);
  expect(approx(computePresetTotals(c, presetB).attack_pct, 9)).toBe(true);
});

it('a preset with no pet chosen gets no pet contribution', () => {
  const c = newCharacter();
  c.pets = [newPetEntry({ name: 'Unpicked', stats: { attack_pct: 50 } })];
  const totals = computePresetTotals(c, c.presets[0]); // petId stays null
  expect(totals.attack_pct).toBe(0);
});

it('a Mount contributes baseHpPct/baseAtkPct as health_pct/attack_pct, only when active - character-wide, not per-preset', () => {
  const c = newCharacter();
  const mount = newMountEntry({ name: 'Crystal Beast', baseHpPct: 19, baseAtkPct: 10 });
  c.mounts = { entries: [mount], activeId: mount.id };

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.health_pct, 19)).toBe(true);
  expect(approx(totals.attack_pct, 10)).toBe(true);
});

it('equipped Mount Glyphs sum additively; unequipped glyphs in inventory do not contribute', () => {
  const c = newCharacter();
  const equippedMinor = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 4.1, equipped: true });
  const equippedMajor = newMountGlyphEntry({ tier: 'major', statKey: 'crit', value: 1.8, equipped: true });
  const unequipped = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 999, equipped: false });
  c.glyphs = { entries: [equippedMinor, equippedMajor, unequipped] };

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack_pct, 4.1)).toBe(true);
  expect(approx(totals.crit, 1.8)).toBe(true);
});

it('resolveEffectiveTotals returns manualStats when manualTotals is true (default for a seeded preset)', () => {
  const c = newCharacter();
  c.presets[0].manualStats = emptyStats({ attack: 12345 });
  const eff = resolveEffectiveTotals(c, c.presets[0]);
  expect(eff.attack).toBe(12345);
});

it('resolveEffectiveTotals returns the Calculated sum when manualTotals is false', () => {
  const c = newCharacter();
  c.presets[0].manualStats = emptyStats({ attack: 12345 }); // should be ignored
  c.presets[0].manualTotals = false;
  c.loadouts[0].gear.Weapon = emptyStats({ attack: 500 });
  const eff = resolveEffectiveTotals(c, c.presets[0]);
  expect(approx(eff.attack, BASE_ATTACK + 500)).toBe(true);
  expect(eff.attack).not.toBe(12345);
});

// --- Talents (Character.talentSets - Set A/B, selected per-preset via preset.talentSet) ---
it("a talent contributes the value ASSIGNED to the allocated rank on the preset's chosen talent set", () => {
  const sharpAim = talent('sharp-aim', 'crit', [2, 5, 9]); // non-linear on purpose
  const talentTrees = { marksmanship: { description: '', tiers: [tier('t1', 0, [sharpAim])] } };

  const c = newCharacter();
  c.talentSets[0].spec = 'marksmanship';
  c.talentSets[0].allocation = { [sharpAim.id]: 2 }; // rank 2 -> assigned value 5, NOT 2+5=7

  const totals = computePresetTotals(c, c.presets[0], talentTrees); // preset 0 -> talentSet 0
  expect(approx(totals.crit, 5)).toBe(true);
});

it('a talent set allocation does not leak into a preset using the OTHER talent set', () => {
  const sharpAim = talent('sharp-aim', 'crit', [2, 5, 9]);
  const talentTrees = { marksmanship: { description: '', tiers: [tier('t1', 0, [sharpAim])] } };

  const c = newCharacter();
  c.talentSets[0].spec = 'marksmanship';
  c.talentSets[0].allocation = { [sharpAim.id]: 3 };
  // talentSets[1] has no spec/allocation.

  const presetOnSetB = newPreset('P', { talentSet: 1 });
  const totals = computePresetTotals(c, presetOnSetB, talentTrees);
  expect(totals.crit).toBe(0);
});

it('two different talents contributing to the same stat sum together', () => {
  const t1 = talent('a', 'attack_pct', [4]);
  const t2 = talent('b', 'attack_pct', [6]);
  const talentTrees = { arms: { description: '', tiers: [tier('t1', 0, [t1, t2])] } };

  const c = newCharacter();
  c.talentSets[0].spec = 'arms';
  c.talentSets[0].allocation = { [t1.id]: 1, [t2.id]: 1 };

  const totals = computePresetTotals(c, c.presets[0], talentTrees);
  expect(approx(totals.attack_pct, 10)).toBe(true);
});

it('an allocation of rank 0 (or absent) contributes nothing', () => {
  const untouched = talent('untouched', 'lifesteal', [7]);
  const talentTrees = { arms: { description: '', tiers: [tier('t1', 0, [untouched])] } };

  const c = newCharacter();
  c.talentSets[0].spec = 'arms';
  c.talentSets[0].allocation = {}; // nothing allocated

  const totals = computePresetTotals(c, c.presets[0], talentTrees);
  expect(totals.lifesteal).toBe(0);
});

// --- Awakening (character-wide, shared by every preset) ---
it('Shadow Path contributes linearly per point, the same for either class', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  c.awakening = { path: 'shadow', points: 3 };

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack_pct, 6)).toBe(true); // 2%/point * 3
  expect(approx(totals.crit, 1.5)).toBe(true); // 0.5%/point * 3
  expect(approx(totals.penetration, 4.5)).toBe(true); // 1.5%/point * 3
});

it("Radiant Path's per-point stats depend on class", () => {
  const warrior = newCharacter();
  warrior.class = 'Warrior';
  warrior.awakening = { path: 'radiant', points: 2 };
  const warriorTotals = computePresetTotals(warrior, warrior.presets[0]);
  expect(approx(warriorTotals.block_chance, 1)).toBe(true); // 0.5%/point * 2
  expect(warriorTotals.miss_chance).toBe(0);

  const sentinel = newCharacter();
  sentinel.class = 'Sentinel';
  sentinel.awakening = { path: 'radiant', points: 2 };
  const sentinelTotals = computePresetTotals(sentinel, sentinel.presets[0]);
  expect(approx(sentinelTotals.miss_chance, 1)).toBe(true); // 0.5%/point * 2
  expect(sentinelTotals.block_chance).toBe(0);
});

it('Awakening is shared by every preset, unlike per-talent-set Talents', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  c.awakening = { path: 'shadow', points: 4 };
  const presetB = newPreset('B', { loadout: 1, talentSet: 1 });

  const p1 = computePresetTotals(c, c.presets[0]);
  const p2 = computePresetTotals(c, presetB);
  expect(approx(p1.attack_pct, p2.attack_pct)).toBe(true);
  expect(approx(p1.attack_pct, 8)).toBe(true); // 2%/point * 4
});

it('no path chosen, or 0 points invested, contributes nothing', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const noPath = computePresetTotals(c, c.presets[0]);
  expect(noPath.attack_pct).toBe(0);

  c.awakening = { path: 'shadow', points: 0 };
  const zeroPoints = computePresetTotals(c, c.presets[0]);
  expect(zeroPoints.attack_pct).toBe(0);
});

// --- Transcendence (character-wide, shared by every preset) ---
it('nothing is unlocked by default, including the start position - it contributes nothing until unlocked', () => {
  const c = newCharacter();
  c.class = 'Sentinel';
  const totals = computePresetTotals(c, c.presets[0]);
  expect(totals.health_pct).toBe(0);

  c.transcendence.unlockedPositions = ['14:25']; // the start, unlocked like any other node
  const afterUnlock = computePresetTotals(c, c.presets[0]);
  expect(approx(afterUnlock.health_pct, 1)).toBe(true); // 14:25's own Health% value
});

it('unlocking a common node adds its one stat', () => {
  const c = newCharacter();
  c.class = 'Sentinel';
  c.transcendence.unlockedPositions = ['2:2']; // common, penetration +1
  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.penetration, 1)).toBe(true);
});

it('unlocking an uncommon node adds both of its stats', () => {
  const c = newCharacter();
  c.class = 'Sentinel';
  c.transcendence.unlockedPositions = ['14:16']; // uncommon, attack_pct +1.6 and lifesteal +1
  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack_pct, 1.6)).toBe(true);
  expect(approx(totals.lifesteal, 1)).toBe(true);
});

it('Transcendence is shared by every preset, unlike per-talent-set/per-preset Talents/Relics', () => {
  const c = newCharacter();
  c.class = 'Sentinel';
  c.transcendence.unlockedPositions = ['2:2'];
  const presetB = newPreset('B', { loadout: 1, talentSet: 1 });

  const p1 = computePresetTotals(c, c.presets[0]);
  const p2 = computePresetTotals(c, presetB);
  expect(approx(p1.penetration, p2.penetration)).toBe(true);
  expect(approx(p1.penetration, 1)).toBe(true);
});

it('a class with no Transcendence tree data yet (Warrior) contributes nothing beyond base', () => {
  expect(TRANSCENDENCE_TREES.Warrior).toBe(null); // not transcribed yet - guards this test's premise
  const c = newCharacter();
  c.class = 'Warrior';
  c.transcendence.unlockedPositions = ['2:2']; // would-be Sentinel position, meaningless for Warrior
  const totals = computePresetTotals(c, c.presets[0]);
  expect(totals.penetration).toBe(0);
  expect(totals.health_pct).toBe(0);
});

// --- Stat caps ---
it('Calculated totals clamp a capped stat when stacked sources exceed the cap', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ crit: 60 });
  c.loadouts[0].gear.Ring = emptyStats({ crit: 50 }); // 60 + 50 = 110, over the 80 cap

  const totals = computePresetTotals(c, c.presets[0]);
  expect(totals.crit).toBe(80);
});

it('Manual totals are also clamped by resolveEffectiveTotals', () => {
  const c = newCharacter();
  c.presets[0].manualStats = emptyStats({ paralyze_chance: 99 }); // way over the 15 cap

  const effective = resolveEffectiveTotals(c, c.presets[0]);
  expect(effective.paralyze_chance).toBe(15);
  // The clamp only affects the read - stored manualStats stays as typed.
  expect(c.presets[0].manualStats.paralyze_chance).toBe(99);
});

it('an uncapped stat (e.g. Lifesteal) is never clamped', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ lifesteal: 500 });

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.lifesteal, 500)).toBe(true);
});

// --- Relics (character-wide levels, equipped per-preset via preset.relicIds) ---
it('a preset-equipped relic contributes its stat(s) interpolated at the CHARACTER-WIDE level', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'basalt-guard'); // dmg_reduction 3.0 -> 12.0, maxLevel 10
  c.relicLevels[def.id] = 1;
  c.presets[0].relicIds = [def.id];

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.dmg_reduction, 3.0)).toBe(true); // level 1 = min

  c.relicLevels[def.id] = 10;
  const maxed = computePresetTotals(c, c.presets[0]);
  expect(approx(maxed.dmg_reduction, 12.0)).toBe(true); // maxLevel = max
});

it('a relic owned (leveled) but not equipped on this preset contributes nothing', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'basalt-guard');
  c.relicLevels[def.id] = 10; // leveled character-wide...
  // ...but preset.relicIds stays empty (not equipped here).

  const totals = computePresetTotals(c, c.presets[0]);
  expect(totals.dmg_reduction).toBe(0);
});

it('a silver/gold relic with 2 stats contributes both simultaneously', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'fortune-token'); // crit + crit_mult
  c.relicLevels[def.id] = 15; // maxLevel -> both at max
  c.presets[0].relicIds = [def.id];

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.crit, 14.0)).toBe(true);
  expect(approx(totals.crit_mult, BASE_CRIT_MULT + 80.0)).toBe(true); // crit_mult's base is 150, additive on top
});

it('the SAME relic level applies no matter which preset equips it (character-wide level)', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'basalt-guard');
  c.relicLevels[def.id] = 10;
  const presetA = newPreset('A');
  presetA.relicIds = [def.id];
  const presetB = newPreset('B', { loadout: 1, talentSet: 1 });
  presetB.relicIds = [def.id];

  const totalsA = computePresetTotals(c, presetA);
  const totalsB = computePresetTotals(c, presetB);
  expect(approx(totalsA.dmg_reduction, totalsB.dmg_reduction)).toBe(true);
  expect(approx(totalsA.dmg_reduction, 12.0)).toBe(true);
});

it("equipping a relic on one preset doesn't equip it for another (equip is per-preset)", () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'basalt-guard');
  c.relicLevels[def.id] = 10;
  c.presets[0].relicIds = [def.id];
  const presetB = newPreset('B', { loadout: 1, talentSet: 1 }); // relicIds stays empty

  const totalsB = computePresetTotals(c, presetB);
  expect(totalsB.dmg_reduction).toBe(0);
});
