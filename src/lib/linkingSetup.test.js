import { it, expect } from 'vitest';
import { newCharacter } from './model.js';
import { linkedPresets, presetSetupChecks, linkingSetupReady } from './linkingSetup.js';

function readyCharacter() {
  const c = newCharacter('Setup Tester');
  c.class = 'Sentinel';
  c.loadouts[0].gear.Weapon.attack = 1000;
  c.loadouts[1].gear.Weapon.attack = 500;
  c.talentSets[0].spec = 'marksmanship';
  c.talentSets[0].allocation = { 'row1:0': 3 };
  c.talentSets[1].spec = 'disruption';
  c.talentSets[1].allocation = { 'row1:1': 2 };
  c.presets[0].goal.kind = 'dps';
  c.presets[1].goal.kind = 'pvp';
  c.presets[1].loadout = 1;
  c.presets[1].talentSet = 1;
  return c;
}

it('linkedPresets returns the linked pair (both seeded presets)', () => {
  const c = newCharacter('Test');
  expect(linkedPresets(c).length).toBe(2);
  c.presets[1].goal.linked = false;
  expect(linkedPresets(c).length).toBe(1);
});

it('presetSetupChecks track goal/gear/talents/pet, with pet optional when none are owned', () => {
  const c = newCharacter('Test');
  const checks = presetSetupChecks(c, c.presets[0]);
  expect(checks.map((ch) => ch.key)).toEqual(['goal', 'gear', 'talents', 'pet']);
  expect(checks.every((ch) => !ch.done)).toBe(true); // fresh character - nothing set up
  expect(checks.find((ch) => ch.key === 'pet').optional).toBe(true); // no pets owned

  const ready = readyCharacter();
  const readyChecks = presetSetupChecks(ready, ready.presets[0]);
  expect(readyChecks.find((ch) => ch.key === 'goal').done).toBe(true);
  expect(readyChecks.find((ch) => ch.key === 'gear').done).toBe(true);
  expect(readyChecks.find((ch) => ch.key === 'talents').done).toBe(true);
  expect(readyChecks.find((ch) => ch.key === 'pet').done).toBe(false); // still no pet equipped

  ready.pets.push({ id: 'pet-1', name: 'Ashfang', rarity: 'Epic', stats: {} });
  expect(presetSetupChecks(ready, ready.presets[0]).find((ch) => ch.key === 'pet').optional).toBe(false);
  ready.presets[0].petId = 'pet-1';
  expect(presetSetupChecks(ready, ready.presets[0]).find((ch) => ch.key === 'pet').done).toBe(true);
});

it('linkingSetupReady needs every non-optional check on BOTH linked presets', () => {
  expect(linkingSetupReady(newCharacter('Fresh'))).toBe(false);
  const c = readyCharacter();
  expect(linkingSetupReady(c)).toBe(true); // pet optional (none owned)
  c.presets[1].goal.kind = null; // un-assign one goal
  expect(linkingSetupReady(c)).toBe(false);
});
