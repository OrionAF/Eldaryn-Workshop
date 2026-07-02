import { it, expect } from 'vitest';
import { computeCalculatedTotals, resolveEffectiveTotals } from './totals.js';
import { newCharacter, newPetEntry, newMountEntry, newMountGlyphEntry, emptyStats } from './model.js';
import { BASE_ATTACK, BASE_SPEED, BASE_CRIT_MULT } from './dps.js';
import { RELICS_BY_CLASS } from './relicsData.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';

// Talent test fixtures: plain object literals matching talentTreeData.js's
// shape (Tier = {id, threshold, talents}, Talent = {id, name, statKey, ranks}).
// Tests build their own tiny trees rather than using the real static
// TALENT_TREES, which only holds placeholder content.
function talent(id, statKey, ranks) {
  return { id, name: id, statKey, ranks };
}
function tier(id, threshold, talents) {
  return { id, threshold, talents };
}

function approx(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}

it('an empty character produces base stats only', () => {
  const c = newCharacter();
  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.attack, BASE_ATTACK)).toBe(true);
  expect(approx(totals.speed, BASE_SPEED)).toBe(true);
  expect(approx(totals.crit_mult, BASE_CRIT_MULT)).toBe(true);
  expect(totals.crit).toBe(0);
});

it('a gear slot contributes its flat Attack and Attack%', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ attack: 500, attack_pct: 10 });
  const totals = computeCalculatedTotals(c, 0);
  // flat total = BASE_ATTACK(10) + 500 = 510, then * (1 + 10/100)
  expect(approx(totals.attack, (BASE_ATTACK + 500) * 1.1)).toBe(true);
});

it('gear/stones are per-loadout - Loadout 2 is unaffected by Loadout 1 gear', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ attack: 500 });
  const totalsL2 = computeCalculatedTotals(c, 1);
  expect(approx(totalsL2.attack, BASE_ATTACK)).toBe(true);
});

it('only the active Pet contributes; an inactive Pet in the same collection does not', () => {
  const c = newCharacter();
  const active = newPetEntry({ name: 'Active Pet', stats: { attack: 2664, attack_pct: 6.2 } });
  const inactive = newPetEntry({ name: 'Bench Pet', stats: { attack: 99999 } });
  c.sources.pets = { entries: [active, inactive], activeId: active.id };

  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.attack, (BASE_ATTACK + 2664) * 1.062)).toBe(true);
});

it('a Mount contributes baseHpPct/baseAtkPct as health_pct/attack_pct, only when active', () => {
  const c = newCharacter();
  const mount = newMountEntry({ name: 'Crystal Beast', baseHpPct: 19, baseAtkPct: 10 });
  c.sources.mounts = { entries: [mount], activeId: mount.id };

  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.health_pct, 19)).toBe(true);
  expect(approx(totals.attack_pct, 10)).toBe(true);
});

it('equipped Mount Glyphs sum additively; unequipped glyphs in inventory do not contribute', () => {
  const c = newCharacter();
  const equippedMinor = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 4.1, equipped: true });
  const equippedMajor = newMountGlyphEntry({ tier: 'major', statKey: 'crit', value: 1.8, equipped: true });
  const unequipped = newMountGlyphEntry({ tier: 'minor', statKey: 'attack_pct', value: 999, equipped: false });
  c.sources.mountGlyphs = { entries: [equippedMinor, equippedMajor, unequipped] };

  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.attack_pct, 4.1)).toBe(true);
  expect(approx(totals.crit, 1.8)).toBe(true);
});

it('resolveEffectiveTotals returns the manual entry when manualTotals is true (default)', () => {
  const c = newCharacter();
  c.loadouts[0].profileTotals = emptyStats({ attack: 12345 });
  const eff = resolveEffectiveTotals(c, 0);
  expect(eff.attack).toBe(12345);
});

it('resolveEffectiveTotals returns the Calculated sum when manualTotals is false', () => {
  const c = newCharacter();
  c.loadouts[0].profileTotals = emptyStats({ attack: 12345 }); // should be ignored
  c.loadouts[0].manualTotals = false;
  c.loadouts[0].gear.Weapon = emptyStats({ attack: 500 });
  const eff = resolveEffectiveTotals(c, 0);
  expect(approx(eff.attack, BASE_ATTACK + 500)).toBe(true);
  expect(eff.attack).not.toBe(12345);
});

// --- Talents (scope: 'loadout' - Dual Spec = Set A/B = Loadout 1/2) ---
it('a talent contributes the value ASSIGNED to the allocated rank, not a sum of prior ranks', () => {
  const sharpAim = talent('sharp-aim', 'crit', [2, 5, 9]); // non-linear on purpose
  const talentTrees = { marksmanship: { description: '', tiers: [tier('t1', 0, [sharpAim])] } };

  const c = newCharacter();
  c.loadouts[0].spec = 'marksmanship';
  c.loadouts[0].talentAllocation = { [sharpAim.id]: 2 }; // rank 2 -> assigned value 5, NOT 2+5=7

  const totals = computeCalculatedTotals(c, 0, talentTrees);
  expect(approx(totals.crit, 5)).toBe(true);
});

it('a talent allocation on a different loadout does not leak into this one (per-loadout, not shared)', () => {
  const sharpAim = talent('sharp-aim', 'crit', [2, 5, 9]);
  const talentTrees = { marksmanship: { description: '', tiers: [tier('t1', 0, [sharpAim])] } };

  const c = newCharacter();
  c.loadouts[0].spec = 'marksmanship';
  c.loadouts[0].talentAllocation = { [sharpAim.id]: 3 };
  // Loadout 2 has no spec/allocation - should contribute nothing.

  const totalsL2 = computeCalculatedTotals(c, 1, talentTrees);
  expect(totalsL2.crit).toBe(0);
});

it('two different talents contributing to the same stat sum together', () => {
  const t1 = talent('a', 'attack_pct', [4]);
  const t2 = talent('b', 'attack_pct', [6]);
  const talentTrees = { arms: { description: '', tiers: [tier('t1', 0, [t1, t2])] } };

  const c = newCharacter();
  c.loadouts[0].spec = 'arms';
  c.loadouts[0].talentAllocation = { [t1.id]: 1, [t2.id]: 1 };

  const totals = computeCalculatedTotals(c, 0, talentTrees);
  expect(approx(totals.attack_pct, 10)).toBe(true);
});

it('an allocation of rank 0 (or absent) contributes nothing', () => {
  const untouched = talent('untouched', 'lifesteal', [7]);
  const talentTrees = { arms: { description: '', tiers: [tier('t1', 0, [untouched])] } };

  const c = newCharacter();
  c.loadouts[0].spec = 'arms';
  c.loadouts[0].talentAllocation = {}; // nothing allocated

  const totals = computeCalculatedTotals(c, 0, talentTrees);
  expect(totals.lifesteal).toBe(0);
});

// --- Awakening (scope: 'character' - one path/point count shared by both loadouts) ---
it('Shadow Path contributes linearly per point, the same for either class', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  c.awakening = { path: 'shadow', points: 3 };

  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.attack_pct, 6)).toBe(true); // 2%/point * 3
  expect(approx(totals.crit, 1.5)).toBe(true); // 0.5%/point * 3
  expect(approx(totals.penetration, 4.5)).toBe(true); // 1.5%/point * 3
});

it("Radiant Path's per-point stats depend on class", () => {
  const warrior = newCharacter();
  warrior.class = 'Warrior';
  warrior.awakening = { path: 'radiant', points: 2 };
  const warriorTotals = computeCalculatedTotals(warrior, 0);
  expect(approx(warriorTotals.block_chance, 1)).toBe(true); // 0.5%/point * 2
  expect(warriorTotals.miss_chance).toBe(0); // Sentinel-only stat, not granted to a Warrior

  const sentinel = newCharacter();
  sentinel.class = 'Sentinel';
  sentinel.awakening = { path: 'radiant', points: 2 };
  const sentinelTotals = computeCalculatedTotals(sentinel, 0);
  expect(approx(sentinelTotals.miss_chance, 1)).toBe(true); // 0.5%/point * 2
  expect(sentinelTotals.block_chance).toBe(0); // Warrior-only stat, not granted to a Sentinel
});

it('Awakening is shared by both loadouts, unlike per-loadout Talents', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  c.awakening = { path: 'shadow', points: 4 };

  const l1 = computeCalculatedTotals(c, 0);
  const l2 = computeCalculatedTotals(c, 1);
  expect(approx(l1.attack_pct, l2.attack_pct)).toBe(true);
  expect(approx(l1.attack_pct, 8)).toBe(true); // 2%/point * 4
});

it('no path chosen, or 0 points invested, contributes nothing', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const noPath = computeCalculatedTotals(c, 0);
  expect(noPath.attack_pct).toBe(0);

  c.awakening = { path: 'shadow', points: 0 };
  const zeroPoints = computeCalculatedTotals(c, 0);
  expect(zeroPoints.attack_pct).toBe(0);
});

// --- Transcendence (scope: 'character' - one shared unlocked-node set, like Awakening) ---
it('nothing is unlocked by default, including the start position - it contributes nothing until unlocked', () => {
  const c = newCharacter();
  c.class = 'Sentinel';
  const totals = computeCalculatedTotals(c, 0);
  expect(totals.health_pct).toBe(0);

  c.transcendence.unlockedPositions = ['14:25']; // the start, unlocked like any other node
  const afterUnlock = computeCalculatedTotals(c, 0);
  expect(approx(afterUnlock.health_pct, 1)).toBe(true); // 14:25's own Health% value
});

it('unlocking a common node adds its one stat', () => {
  const c = newCharacter();
  c.class = 'Sentinel';
  c.transcendence.unlockedPositions = ['2:2']; // common, penetration +1 (see transcendenceData.js)
  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.penetration, 1)).toBe(true);
});

it('unlocking an uncommon node adds both of its stats', () => {
  const c = newCharacter();
  c.class = 'Sentinel';
  c.transcendence.unlockedPositions = ['14:16']; // uncommon, attack_pct +1.6 and lifesteal +1
  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.attack_pct, 1.6)).toBe(true);
  expect(approx(totals.lifesteal, 1)).toBe(true);
});

it('an unlocked Ancient Sigil contributes no stat (special effect, not modeled)', () => {
  const c = newCharacter();
  c.class = 'Sentinel';
  c.transcendence.unlockedPositions = ['14:25', '1:1']; // the start (Health%) + a sigil (empty stats)
  const totals = computeCalculatedTotals(c, 0);
  // The start's own Health% shows up; the sigil adds nothing on top.
  expect(approx(totals.health_pct, 1)).toBe(true);
  expect(totals.attack_pct).toBe(0);
});

it('Transcendence is shared by both loadouts, unlike per-loadout Talents/Relics', () => {
  const c = newCharacter();
  c.class = 'Sentinel';
  c.transcendence.unlockedPositions = ['2:2'];
  const l1 = computeCalculatedTotals(c, 0);
  const l2 = computeCalculatedTotals(c, 1);
  expect(approx(l1.penetration, l2.penetration)).toBe(true);
  expect(approx(l1.penetration, 1)).toBe(true);
});

it('a class with no Transcendence tree data yet (Warrior) contributes nothing beyond base', () => {
  expect(TRANSCENDENCE_TREES.Warrior).toBe(null); // not transcribed yet - guards this test's premise
  const c = newCharacter();
  c.class = 'Warrior';
  c.transcendence.unlockedPositions = ['2:2']; // would-be Sentinel position, meaningless for Warrior
  const totals = computeCalculatedTotals(c, 0);
  expect(totals.penetration).toBe(0);
  expect(totals.health_pct).toBe(0);
});

// --- Stat caps (game-enforced ceilings on Crit, Double Hit, Penetration,
// HP Regen, DMG Reduction, Block/Miss/Blind/Paralyze Chance) ---
it('Calculated totals clamp a capped stat when stacked sources exceed the cap', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ crit: 60 });
  c.loadouts[0].gear.Ring = emptyStats({ crit: 50 }); // 60 + 50 = 110, over the 80 cap

  const totals = computeCalculatedTotals(c, 0);
  expect(totals.crit).toBe(80);
});

it('Calculated totals leave a capped stat untouched when under the cap', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ crit: 30 });

  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.crit, 30)).toBe(true);
});

it('Manual totals are also clamped by resolveEffectiveTotals', () => {
  const c = newCharacter();
  c.loadouts[0].manualTotals = true;
  c.loadouts[0].profileTotals = emptyStats({ paralyze_chance: 99 }); // way over the 15 cap

  const effective = resolveEffectiveTotals(c, 0);
  expect(effective.paralyze_chance).toBe(15);
  // The clamp only affects the read - stored profileTotals stays as typed.
  expect(c.loadouts[0].profileTotals.paralyze_chance).toBe(99);
});

it('every requested cap is enforced at its documented value', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({
    crit: 999,
    double_hit: 999,
    penetration: 999,
    hp_regen: 999,
    dmg_reduction: 999,
    block_chance: 999,
    miss_chance: 999,
    blind_chance: 999,
    paralyze_chance: 999,
  });

  const totals = computeCalculatedTotals(c, 0);
  expect(totals.crit).toBe(80);
  expect(totals.double_hit).toBe(40);
  expect(totals.penetration).toBe(90);
  expect(totals.hp_regen).toBe(60);
  expect(totals.dmg_reduction).toBe(60);
  expect(totals.block_chance).toBe(80);
  expect(totals.miss_chance).toBe(80);
  expect(totals.blind_chance).toBe(40);
  expect(totals.paralyze_chance).toBe(15);
});

it('an uncapped stat (e.g. Lifesteal) is never clamped', () => {
  const c = newCharacter();
  c.loadouts[0].gear.Weapon = emptyStats({ lifesteal: 500 });

  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.lifesteal, 500)).toBe(true);
});

// --- Relics (scope: 'loadout' - independent per Set A/B, like Talents) ---
it('an equipped relic contributes its stat(s) interpolated at the current level', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'basalt-guard'); // dmg_reduction 3.0 -> 12.0, maxLevel 10
  c.loadouts[0].relics.entries = [{ defId: def.id, level: 1, equipped: true }];

  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.dmg_reduction, 3.0)).toBe(true); // level 1 = min

  c.loadouts[0].relics.entries[0].level = 10;
  const maxed = computeCalculatedTotals(c, 0);
  expect(approx(maxed.dmg_reduction, 12.0)).toBe(true); // maxLevel = max
});

it('an unequipped (owned but not equipped) relic contributes nothing', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'basalt-guard');
  c.loadouts[0].relics.entries = [{ defId: def.id, level: 10, equipped: false }];

  const totals = computeCalculatedTotals(c, 0);
  expect(totals.dmg_reduction).toBe(0);
});

it('a silver/gold relic with 2 stats contributes both simultaneously', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'fortune-token'); // crit + crit_mult
  c.loadouts[0].relics.entries = [{ defId: def.id, level: 15, equipped: true }]; // maxLevel -> both at max

  const totals = computeCalculatedTotals(c, 0);
  expect(approx(totals.crit, 14.0)).toBe(true);
  expect(approx(totals.crit_mult, BASE_CRIT_MULT + 80.0)).toBe(true); // crit_mult's base is 150, additive on top
});

it('Relics are independent per loadout, unlike shared Awakening', () => {
  const c = newCharacter();
  c.class = 'Warrior';
  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'basalt-guard');
  c.loadouts[0].relics.entries = [{ defId: def.id, level: 10, equipped: true }];
  // Loadout 2 has no relics equipped - should not see Loadout 1's relic.

  const l2Totals = computeCalculatedTotals(c, 1);
  expect(l2Totals.dmg_reduction).toBe(0);
});
