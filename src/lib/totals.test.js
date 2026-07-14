import { it, expect } from 'vitest';
import { computePresetTotals, resolveEffectiveTotals } from './totals.js';
import { newCharacter, newPetEntry, newMountGlyphEntry, newPreset, newStoneEntry, emptyStats } from './model.js';
import { BASE_ATTACK, BASE_SPEED, BASE_CRIT_MULT } from './dps.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { SIGILS_BY_CLASS } from './sigilsData.js';
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

it("a stone socketed into the preset's loadout contributes its rolled stats", () => {
  const c = newCharacter();
  const stone = newStoneEntry({ type: 'verdant', rolledKeys: ['attack_pct', 'crit'], stats: { attack_pct: 5, crit: 2 } });
  c.stoneInventory = [stone];
  c.loadouts[0].socketedStones.Weapon = stone.id;
  const totals = computePresetTotals(c, c.presets[0]); // preset 0 -> loadout 0
  expect(approx(totals.attack, BASE_ATTACK * 1.05)).toBe(true);
  expect(totals.crit).toBe(2);
});

it('an empty socket (no stone id) and a dangling socket reference both contribute nothing', () => {
  const c = newCharacter();
  c.loadouts[0].socketedStones.Weapon = 'ghost-stone-id'; // not in stoneInventory
  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack, BASE_ATTACK)).toBe(true);
});

it('a stone socketed in Loadout 2 does not contribute to a preset on Loadout 1', () => {
  const c = newCharacter();
  const stone = newStoneEntry({ type: 'crimson', rolledKeys: ['crit'], stats: { crit: 15 } });
  c.stoneInventory = [stone];
  c.loadouts[1].socketedStones.Weapon = stone.id;
  const totals = computePresetTotals(c, c.presets[0]); // preset 0 -> loadout 0
  expect(totals.crit).toBe(0);
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

it('a Mount contributes baseHpPct/baseAtkPct as health_pct/attack_pct, only for the preset riding it', () => {
  const c = newCharacter();
  const mount = c.mounts.entries.find((m) => m.id === 'crystal_beast');
  mount.baseHpPct = 19;
  mount.baseAtkPct = 10;
  c.presets[0].mountId = mount.id;

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.health_pct, 19)).toBe(true);
  expect(approx(totals.attack_pct, 10)).toBe(true);

  // A preset riding nothing gets no mount contribution.
  c.presets[0].mountId = null;
  const without = computePresetTotals(c, c.presets[0]);
  expect(approx(without.health_pct, 0)).toBe(true);
  expect(approx(without.attack_pct, 0)).toBe(true);
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

it('an equipped SPECIAL glyph contributes no additive stats (its effect lives in the sigil sim)', () => {
  const c = newCharacter();
  const special = newMountGlyphEntry({ tier: 'major', special: 'ember-curse-glyph', equipped: true });
  const stat = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 4, equipped: true });
  c.glyphs = { entries: [special, stat] };

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack_pct, 4)).toBe(true); // only the stat glyph counts
});

it('resolveEffectiveTotals returns manualStats when manualTotals is true', () => {
  const c = newCharacter();
  c.presets[0].manualTotals = true;
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

it('Warrior Transcendence nodes contribute now that its tree is transcribed', () => {
  expect(TRANSCENDENCE_TREES.Warrior).not.toBe(null); // guards this test's premise
  const c = newCharacter();
  c.class = 'Warrior';
  c.transcendence.unlockedPositions = ['14:25']; // Warrior start node: Health % +1
  const totals = computePresetTotals(c, c.presets[0]);
  expect(totals.health_pct).toBe(1);
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
  c.presets[0].manualTotals = true;
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

// --- Sigils (static catalogue structure + character-entered values, equipped per-preset - PASSIVE stats only) ---
it('an equipped sigil contributes its entered passive values; entered active values never reach totals', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  // warborn-fury: passive declares attack+health; active declares attack_pct/penetration/dmg_reduction
  c.sigilValues['warborn-fury'] = {
    passive: { attack: 500, health: 300 },
    active: { attack_pct: 20, penetration: 10, dmg_reduction: 5 },
    damage: 0,
    tickDamage: 0,
  };
  c.presets[0].sigilIds = ['warborn-fury'];

  const bare = computePresetTotals(c, newPreset('bare'));
  const totals = computePresetTotals(c, c.presets[0]);

  expect(totals.attack - bare.attack).toBe(500); // no attack_pct anywhere, so flat delta is exact
  expect(totals.health - bare.health).toBe(300);
  // The active's stats stay simulation-only.
  expect(totals.penetration).toBe(bare.penetration);
  expect(totals.dmg_reduction).toBe(bare.dmg_reduction);
});

it('an equipped sigil with no entered values contributes nothing', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  c.presets[0].sigilIds = ['warborn-fury'];
  expect(computePresetTotals(c, c.presets[0])).toEqual(computePresetTotals(c, newPreset('bare')));
});

it('a sigil not equipped on this preset contributes nothing', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  c.presets[0].sigilIds = [SIGILS_BY_CLASS.Warrior[0].id];
  const presetB = newPreset('B', { loadout: 1, talentSet: 1 }); // sigilIds stays empty

  expect(computePresetTotals(c, presetB)).toEqual(computePresetTotals(c, newPreset('bare', { loadout: 1, talentSet: 1 })));
});

it('the TOP fortress buff contributes its fixed stat block', () => {
  const c = newCharacter();
  c.presets[0].fortressBuffs.top = true;
  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack_pct, 5)).toBe(true);
  expect(approx(totals.speed, BASE_SPEED + 3)).toBe(true);
  expect(approx(totals.crit, 3)).toBe(true);
  expect(approx(totals.penetration, 3)).toBe(true);
  expect(approx(totals.pvp_attack, 15)).toBe(true);
});

it('the BOTTOM fortress buff contributes its fixed stat block', () => {
  const c = newCharacter();
  c.presets[0].fortressBuffs.bottom = true;
  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.health_pct, 5)).toBe(true);
  expect(approx(totals.hp_regen, 3)).toBe(true);
  expect(approx(totals.dmg_reduction, 5)).toBe(true);
  expect(approx(totals.miss_chance, 5)).toBe(true);
  expect(approx(totals.block_chance, 3)).toBe(true);
  expect(approx(totals.blind_chance, 3)).toBe(true);
  expect(approx(totals.pvp_defense, 15)).toBe(true);
});

it('CORE stacks additively with TOP or BOTTOM on pvp_attack/pvp_defense', () => {
  const c = newCharacter();
  c.presets[0].fortressBuffs.top = true;
  c.presets[0].fortressBuffs.core = true;
  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.pvp_attack, 15 + 25)).toBe(true);
  expect(approx(totals.pvp_defense, 25)).toBe(true);
});
