import { it, expect } from 'vitest';
import { computePresetTotals, computePresetRawTotals, resolveEffectiveTotals } from './totals.js';
import { newCharacter, newPetEntry, newMountGlyphEntry, newPreset, newStoneEntry, emptyStats } from './model.js';
import { BASE_ATTACK, BASE_SPEED, BASE_CRIT_MULT } from './dps.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { SIGILS_BY_CLASS, sigilStat } from './sigilsData.js';
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

it('a Mount contributes its rolled hpPct/atkPct as health_pct/attack_pct, only for the preset riding it', () => {
  const c = newCharacter();
  const mount = c.mounts.entries.find((m) => m.id === 'crystal_beast');
  mount.star = 1; // star > 0 IS ownership now - there's no separate flag
  mount.hpPct = 19; // crystal_beast star 1 range: hp [17,19], atk [10,12]
  mount.atkPct = 10;
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

it('glyphs on the RIDDEN mount sum additively; ones on other mounts do not contribute', () => {
  const c = newCharacter();
  const onMount = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 4.1 });
  const alsoOnMount = newMountGlyphEntry({ tier: 'minor', statKey: 'crit', value: 1.8 });
  const elsewhere = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 999 });
  c.glyphs = { entries: [onMount, alsoOnMount, elsewhere] };

  const ridden = c.mounts.entries.find((m) => m.id === 'crystal_beast');
  ridden.star = 1;
  ridden.hpPct = 17;
  ridden.atkPct = 10;
  ridden.glyphIds = [onMount.id, alsoOnMount.id];
  const other = c.mounts.entries.find((m) => m.id === 'night_wolf');
  other.star = 1;
  other.glyphIds = [elsewhere.id];
  c.presets[0].mountId = ridden.id;

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack_pct, 10 + 4.1)).toBe(true); // mount's own atk% + its glyph
  expect(approx(totals.crit, 1.8)).toBe(true);

  // Switching mounts switches glyph loadout with it - that's the whole point
  // of mount-bound glyphs.
  c.presets[0].mountId = other.id;
  const swapped = computePresetTotals(c, c.presets[0]);
  expect(approx(swapped.crit, 0)).toBe(true);
  expect(approx(swapped.attack_pct, other.atkPct + 999)).toBe(true);
});

it('a MAJOR glyph contributes no additive stats (its effect lives in the sigil sim)', () => {
  const c = newCharacter();
  const major = newMountGlyphEntry({ tier: 'major', special: 'emberhoard-sigil:common' });
  const minor = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 4 });
  c.glyphs = { entries: [major, minor] };

  const ridden = c.mounts.entries.find((m) => m.id === 'crystal_beast');
  ridden.star = 1;
  ridden.hpPct = 17;
  ridden.atkPct = 10;
  ridden.glyphIds = [major.id, minor.id];
  c.presets[0].mountId = ridden.id;

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack_pct, 10 + 4)).toBe(true); // only the minor glyph counts
});

it('an unowned mount contributes nothing, even carrying glyphs', () => {
  const c = newCharacter();
  const glyph = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 7 });
  c.glyphs = { entries: [glyph] };
  const mount = c.mounts.entries.find((m) => m.id === 'crystal_beast');
  mount.star = 0; // not owned
  mount.glyphIds = [glyph.id];
  c.presets[0].mountId = mount.id;

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack_pct, 0)).toBe(true);
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
  expect(approx(totals.penetration, 1.8)).toBe(true); // 0.6%/point * 3 (post-Penetration Rework)
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

// --- Stat caps (soft-cap curve, statCaps.js) ---
it('Calculated totals curve an overcapped stat instead of clamping it', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ crit: 60 });
  c.loadouts[0].gear.Ring = emptyStats({ crit: 50 }); // raw 110, soft cap 50 / hard cap 90

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.crit, 50 + 40 * (1 - (80 / 140) ** 2))).toBe(true); // ~76.94

  // The raw pre-curve sum stays available for the SOFT indicator.
  const raw = computePresetRawTotals(c, c.presets[0]);
  expect(approx(raw.crit, 110)).toBe(true);
});

it('Manual totals (already effective) are hard-clamped, never re-curved', () => {
  const c = newCharacter();
  c.presets[0].manualTotals = true;
  // 62.8 is over the 50 soft cap but is a legit post-curve effective value.
  c.presets[0].manualStats = emptyStats({ crit: 62.8, paralyze_chance: 99 }); // 99 over the 18 hard cap

  const effective = resolveEffectiveTotals(c, c.presets[0]);
  expect(effective.crit).toBe(62.8);
  expect(effective.paralyze_chance).toBe(18);
  // The clamp only affects the read - stored manualStats stays as typed.
  expect(c.presets[0].manualStats.paralyze_chance).toBe(99);
});

it('an uncapped stat (e.g. Attack %) is never curved or clamped', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ attack_pct: 500, lifesteal: 500 });

  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.attack_pct, 500)).toBe(true);
  // Lifesteal is now capped by the rebalance (soft 40 / hard 70).
  expect(approx(totals.lifesteal, 40 + 30 * (1 - (60 / 520) ** 2))).toBe(true);
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
it('an equipped sigil contributes DERIVED passive Attack/Health from its level/tier; entered active values never reach totals', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  // warborn-fury (Uncommon): passive Attack/Health derived from level/tier;
  // active declares attack_pct/penetration/dmg_reduction (simulation-only).
  const def = SIGILS_BY_CLASS.Warrior.find((d) => d.id === 'warborn-fury');
  c.sigilValues['warborn-fury'] = {
    level: 5,
    tier: 1,
    passive: {}, // entered attack/health are ignored - they're derived
    active: { attack_pct: 20, penetration: 10, dmg_reduction: 5 },
    damage: 0,
    tickDamage: 0,
  };
  c.presets[0].sigilIds = ['warborn-fury'];

  const bare = computePresetTotals(c, newPreset('bare'));
  const totals = computePresetTotals(c, c.presets[0]);

  expect(totals.attack - bare.attack).toBe(sigilStat(def, 'attack', 5, 1)); // no attack_pct anywhere, so flat delta is exact
  expect(totals.health - bare.health).toBe(sigilStat(def, 'health', 5, 1));
  // The active's stats stay simulation-only.
  expect(totals.penetration).toBe(bare.penetration);
  expect(totals.dmg_reduction).toBe(bare.dmg_reduction);
});

it('the x3 sigil tier multiplies the derived Attack/Health (up to display rounding)', () => {
  const def = SIGILS_BY_CLASS.Warrior.find((d) => d.id === 'warborn-fury');
  const t1 = sigilStat(def, 'attack', 8, 1);
  const t2 = sigilStat(def, 'attack', 8, 2);
  expect(Math.abs(t2 - t1 * 3)).toBeLessThanOrEqual(1);
});

it('a baked sigil at level 0 (not owned) contributes nothing; setting a level makes it contribute', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = SIGILS_BY_CLASS.Warrior.find((d) => d.id === 'warborn-fury');
  c.presets[0].sigilIds = ['warborn-fury'];

  // No sigilValues entry -> level 0 -> no contribution.
  const bare = computePresetTotals(c, newPreset('bare'));
  expect(computePresetTotals(c, c.presets[0]).attack).toBe(bare.attack);

  // Give it a level -> derived Attack/Health appear.
  c.sigilValues['warborn-fury'] = { level: 4, tier: 1, passive: {}, active: {}, damage: 0, tickDamage: 0 };
  const totals = computePresetTotals(c, c.presets[0]);
  expect(totals.attack - bare.attack).toBe(sigilStat(def, 'attack', 4, 1));
  expect(totals.health - bare.health).toBe(sigilStat(def, 'health', 4, 1));
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

it('two presets on DIFFERENT mounts get independent glyph loadouts', () => {
  const c = newCharacter();
  const offensive = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 10 });
  const defensive = newMountGlyphEntry({ tier: 'minor', statKey: 'dmg_reduction', value: 6 });
  c.glyphs = { entries: [offensive, defensive] };

  const atkMount = c.mounts.entries.find((m) => m.id === 'crystal_beast');
  atkMount.star = 1;
  atkMount.hpPct = 17;
  atkMount.atkPct = 12;
  atkMount.glyphIds = [offensive.id];
  const hpMount = c.mounts.entries.find((m) => m.id === 'night_wolf');
  hpMount.star = 1;
  hpMount.hpPct = 9;
  hpMount.atkPct = 6;
  hpMount.glyphIds = [defensive.id];

  c.presets[0].mountId = atkMount.id;
  c.presets[1].mountId = hpMount.id;

  const dpsPreset = computePresetTotals(c, c.presets[0]);
  const tankPreset = computePresetTotals(c, c.presets[1]);
  expect(approx(dpsPreset.attack_pct, 12 + 10)).toBe(true);
  expect(approx(dpsPreset.dmg_reduction, 0)).toBe(true);
  expect(approx(tankPreset.dmg_reduction, 6)).toBe(true);
  expect(approx(tankPreset.attack_pct, 6)).toBe(true);
});

it('two presets SHARING a mount also share its glyphs (the coupling that remains)', () => {
  const c = newCharacter();
  const glyph = newMountGlyphEntry({ tier: 'minor', statKey: 'crit', value: 3 });
  c.glyphs = { entries: [glyph] };
  const shared = c.mounts.entries.find((m) => m.id === 'crystal_beast');
  shared.star = 1;
  shared.hpPct = 17;
  shared.atkPct = 10;
  shared.glyphIds = [glyph.id];
  c.presets[0].mountId = shared.id;
  c.presets[1].mountId = shared.id;

  expect(approx(computePresetTotals(c, c.presets[0]).crit, 3)).toBe(true);
  expect(approx(computePresetTotals(c, c.presets[1]).crit, 3)).toBe(true);
});

it('CORE stacks additively with TOP or BOTTOM on pvp_attack/pvp_defense', () => {
  const c = newCharacter();
  c.presets[0].fortressBuffs.top = true;
  c.presets[0].fortressBuffs.core = true;
  const totals = computePresetTotals(c, c.presets[0]);
  expect(approx(totals.pvp_attack, 15 + 25)).toBe(true);
  expect(approx(totals.pvp_defense, 25)).toBe(true);
});
