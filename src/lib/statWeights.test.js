import { it, expect } from 'vitest';
import { computeStatWeights, STAT_PERTURBATIONS } from './statWeights.js';
import { computePresetTotals } from './totals.js';
import { newCharacter } from './model.js';

/** A Warrior with real gear so the calculated totals are non-trivial. */
function makeWarrior() {
  const character = newCharacter('Weights Warrior');
  character.class = 'Warrior';
  character.loadouts[0].gear.Weapon.attack = 1000;
  character.loadouts[0].gear.Weapon.crit = 20;
  character.loadouts[0].gear.Weapon.crit_mult = 150;
  character.loadouts[0].gear.Weapon.speed = 120;
  return { character, preset: character.presets[0] };
}

it('one row per perturbation, sorted by DPS gained descending', () => {
  const { character, preset } = makeWarrior();
  const rows = computeStatWeights(character, preset);
  expect(rows).toHaveLength(STAT_PERTURBATIONS.length);
  for (let i = 1; i < rows.length; i++) {
    expect(rows[i].deltaDps).toBeLessThanOrEqual(rows[i - 1].deltaDps);
  }
  for (const row of rows) {
    expect(typeof row.deltaDps).toBe('number');
    expect(typeof row.deltaPct).toBe('number');
    expect(row.label).toBeTruthy();
    expect(row.unit).toBeTruthy();
  }
});

it('flat attack is worth DPS on a real build; every offensive probe is non-negative', () => {
  const { character, preset } = makeWarrior();
  const rows = computeStatWeights(character, preset);
  const attackFlat = rows.find((r) => r.label === 'Attack');
  expect(attackFlat.deltaDps).toBeGreaterThan(0);
  const crit = rows.find((r) => r.label === 'Crit Chance');
  expect(crit.deltaDps).toBeGreaterThan(0); // crit_mult 150 > 100, so crit helps
  for (const row of rows) expect(row.deltaDps).toBeGreaterThanOrEqual(0);
});

it('the Attack % probe adds one PERCENTAGE POINT, not a 1% relative bump', () => {
  const { character, preset } = makeWarrior();
  // Give the build real Attack %, which is the only condition under which the
  // two readings differ - and the condition every end-game build is in.
  character.loadouts[0].gear.Weapon.attack_pct = 60;
  const rows = computeStatWeights(character, preset);
  const totals = computePresetTotals(character, preset);
  const flat = rows.find((r) => r.label === 'Attack'); // +100 flat
  const pct = rows.find((r) => r.label === 'Attack %');

  // +1 point of Attack % adds (flat pool / 100) to displayed Attack, and DPS
  // is linear in Attack, so it is worth that many hundredths of the flat probe.
  const flatPool = totals.attack / (1 + totals.attack_pct / 100);
  expect(pct.deltaDps).toBeCloseTo(flat.deltaDps * (flatPool / 100 / 100), 6);

  // The old relative reading (displayed * 1.01) would have been worth more,
  // by exactly the build's Attack % multiplier.
  const oldRelative = flat.deltaDps * ((totals.attack * 0.01) / 100);
  expect(oldRelative / pct.deltaDps).toBeCloseTo(1 + totals.attack_pct / 100, 6);
});

it('with no Attack % on the build, both readings of the probe agree', () => {
  // This is why the wrong one survived: the bug is invisible at 0% and grows
  // with the build's Attack %.
  const { character, preset } = makeWarrior();
  const rows = computeStatWeights(character, preset);
  const totals = computePresetTotals(character, preset);
  expect(totals.attack_pct).toBe(0);
  const flat = rows.find((r) => r.label === 'Attack');
  const pct = rows.find((r) => r.label === 'Attack %');
  expect(pct.deltaDps).toBeCloseTo(flat.deltaDps * ((totals.attack * 0.01) / 100), 6);
});

// --- Probes go through the soft-cap curve exactly once ---

/** Warrior whose raw Crit Chance sits `raw` points up, everything else fixed. */
function critWeightAt(raw) {
  const character = newCharacter('Curve Warrior');
  character.class = 'Warrior';
  character.loadouts[0].gear.Weapon.attack = 1000;
  character.loadouts[0].gear.Weapon.crit_mult = 150;
  character.loadouts[0].gear.Weapon.crit = raw;
  const rows = computeStatWeights(character, character.presets[0]);
  return rows.find((r) => r.key === 'crit').deltaDps;
}

it('a stat past its soft cap is worth strictly less per point than one below it', () => {
  // Crit: soft cap 50, hard cap 90.
  const below = critWeightAt(20);
  const justBelow = critWeightAt(49); // probe lands exactly ON the cap: still linear
  const atCap = critWeightAt(50); // probe lands one point OVER: already discounted
  const over = critWeightAt(150);
  expect(justBelow).toBeCloseTo(below, 6);
  expect(atCap).toBeLessThan(below);
  expect(over).toBeGreaterThan(0);
  expect(over).toBeLessThan(below * 0.5); // deep overcap costs most of the point
});

it('weights decay monotonically with overcap instead of staying linear', () => {
  const points = [60, 120, 240, 480].map(critWeightAt);
  for (let i = 1; i < points.length; i++) {
    expect(points[i]).toBeLessThan(points[i - 1]);
  }
  // The pre-fix bug was that all four were identical.
  expect(points[3]).toBeLessThan(points[0] * 0.5);
});

it('a probe can never push a stat past its hard cap', () => {
  const character = newCharacter('Capped Warrior');
  character.class = 'Warrior';
  character.loadouts[0].gear.Weapon.attack = 1000;
  character.loadouts[0].gear.Weapon.crit = 1e6; // effective crit pinned at the 90 cap
  const totals = computePresetTotals(character, character.presets[0]);
  expect(totals.crit).toBeLessThan(90);
  const crit = computeStatWeights(character, character.presets[0]).find((r) => r.key === 'crit');
  expect(crit.deltaDps).toBeGreaterThanOrEqual(0);
  expect(crit.deltaDps).toBeLessThan(critWeightAt(20) * 1e-3); // effectively worthless
});

// --- Goal dispatch (linking simulation's per-stat priority report) ---

it('default output carries a generic `delta` aliased to `deltaDps`, still DPS-only probes', () => {
  const { character, preset } = makeWarrior();
  const rows = computeStatWeights(character, preset);
  expect(rows).toHaveLength(STAT_PERTURBATIONS.length);
  expect(rows.every((r) => r.delta === r.deltaDps)).toBe(true);
  expect(rows.some((r) => r.key === 'health')).toBe(false); // no defensive probes on DPS
});

it('tank goal adds defensive probes and scores Health / DMG Reduction above zero', () => {
  const character = newCharacter('Tank Weights');
  character.class = 'Warrior';
  character.loadouts[0].gear.Weapon.attack = 2000;
  character.loadouts[0].gear.Weapon.health = 50000;
  character.loadouts[0].gear.Weapon.dmg_reduction = 10;
  const rows = computeStatWeights(character, character.presets[0], { goalKind: 'tank', ehpWeight: 0.5 });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  expect(byKey.health).toBeDefined(); // defensive probe present
  expect(byKey.health.delta).toBeGreaterThan(0);
  expect(byKey.dmg_reduction.delta).toBeGreaterThan(0);
  expect(rows.length).toBeGreaterThan(STAT_PERTURBATIONS.length);
});

it('pvp goal scores offensive AND defensive stats through the three-factor blend', () => {
  const character = newCharacter('PVP Weights');
  character.class = 'Warrior';
  character.loadouts[0].gear.Weapon.attack = 5000;
  character.loadouts[0].gear.Weapon.health = 40000;
  character.loadouts[0].gear.Weapon.dmg_reduction = 10;
  const rows = computeStatWeights(character, character.presets[0], {
    goalKind: 'pvp',
    weights: { damage: 34, mitigation: 33, survivability: 33 },
  });
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  expect(byKey.dmg_reduction.delta).toBeGreaterThan(0); // mitigation factor
  expect(byKey.health.delta).toBeGreaterThan(0); // survivability factor
  expect(rows.some((r) => r.key === 'attack' && r.delta > 0)).toBe(true); // damage factor
});
