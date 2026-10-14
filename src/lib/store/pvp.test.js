import { it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';
import { MAX_OPPONENTS } from '../model/opponents.js';
import { loadRoster } from '../storage.js';

beforeEach(() => {
  localStorage.clear();
  const id = rosterStore.addCharacter('Duelist', 'WARRIOR');
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
});

const opps = () => rosterStore.current.opponents;

it('addOpponent creates a valid empty opponent and persists it', () => {
  const id = rosterStore.addOpponent('SENTINEL_DISRUPTION', 'Archer');
  expect(opps()).toHaveLength(1);
  expect(opps()[0]).toMatchObject({ id, name: 'Archer', class: 'SENTINEL', spec: 'SENTINEL_DISRUPTION' });
  const saved = loadRoster().characters.find((c) => c.id === rosterStore.current.id);
  expect(saved.opponents[0].id).toBe(id);
});

it('stops at the cap', () => {
  for (let i = 0; i < MAX_OPPONENTS; i++) expect(rosterStore.addOpponent()).toBeTruthy();
  expect(rosterStore.addOpponent()).toBeNull();
  expect(opps()).toHaveLength(MAX_OPPONENTS);
});

it('setOpponentSheet keeps only known non-negative sheet keys', () => {
  const id = rosterStore.addOpponent();
  rosterStore.setOpponentSheet(id, { totalHp: 50000, totalAttack: 2000, junk: 1, totalCritChance: -3 });
  expect(opps()[0].sheet.values).toEqual({ totalHp: 50000, totalAttack: 2000 });
  expect(opps()[0].sheet.enteredAt).toBeTruthy();
});

it('updateOpponent re-normalises: a class change drops illegal sigils, and id and sheet are not patchable', () => {
  const id = rosterStore.addOpponent('WARRIOR_DPS');
  rosterStore.setOpponentSheet(id, { totalHp: 9 });
  rosterStore.updateOpponent(id, { sigils: [{ species: 'BERSERK_STANCE', level: 5 }], altarTier: 3 });
  expect(opps()[0].sigils).toEqual([{ species: 'BERSERK_STANCE', level: 5 }]);
  expect(opps()[0].conditions).toEqual({ BERSERK_STANCE: 'ON_COOLDOWN' });
  rosterStore.updateOpponent(id, { id: 'hijack', sheet: { values: { totalHp: 1 } } });
  expect(opps()[0].id).toBe(id);
  expect(opps()[0].sheet.values).toEqual({ totalHp: 9 });
  rosterStore.updateOpponent(id, { class: 'MYSTIC', spec: 'MYSTIC_MAGE' });
  expect(opps()[0]).toMatchObject({ class: 'MYSTIC', spec: 'MYSTIC_MAGE', sigils: [], altarTier: 3 });
  expect(rosterStore.updateOpponent('nope', { name: 'x' })).toBe(false);
});

it('duplicate and remove', () => {
  const id = rosterStore.addOpponent('WARRIOR_TANK', 'Wall');
  const copy = rosterStore.duplicateOpponent(id);
  expect(opps().map((o) => o.name)).toEqual(['Wall', 'Wall copy']);
  expect(copy).not.toBe(id);
  expect(rosterStore.removeOpponent(copy)).toBe(true);
  expect(rosterStore.removeOpponent(copy)).toBe(false);
  expect(opps()).toHaveLength(1);
});

it('cloneOpponentFromPreset copies the preset stats under the chosen spec and rejects an unknown preset', () => {
  expect(rosterStore.cloneOpponentFromPreset('missing', 'WARRIOR_DPS')).toBeNull();
  const presetId = rosterStore.current.activePresetId;
  rosterStore.setPresetSheet(presetId, { totalHp: 12345, totalAttack: 678 });
  const id = rosterStore.cloneOpponentFromPreset(presetId, 'WARRIOR_TANK', 'Mirror');
  expect(opps().find((o) => o.id === id)).toMatchObject({ name: 'Mirror', spec: 'WARRIOR_TANK' });
  expect(opps().find((o) => o.id === id).sheet.values).toMatchObject({ totalHp: 12345, totalAttack: 678 });
});
