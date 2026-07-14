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

it('relative probes scale with the build: +1% attack equals its flat equivalent (DPS linear in attack)', () => {
  const { character, preset } = makeWarrior();
  const rows = computeStatWeights(character, preset);
  const totals = computePresetTotals(character, preset);
  const flat = rows.find((r) => r.label === 'Attack'); // +100 flat
  const pct = rows.find((r) => r.label === 'Attack %'); // +1% of the REAL total
  expect(pct.deltaDps).toBeCloseTo(flat.deltaDps * ((totals.attack * 0.01) / 100), 6);
});
