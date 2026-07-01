import { it, expect } from 'vitest';
import { computeCalculatedTotals, resolveEffectiveTotals } from './totals.js';
import { newCharacter, newPetEntry, newMountEntry, newMountGlyphEntry, emptyStats } from './model.js';
import { BASE_ATTACK, BASE_SPEED, BASE_CRIT_MULT } from './dps.js';

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
