import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PetsScreen from './CharacterPetsPage.svelte';
import { petDisplayName } from '../../lib/game/pets.js';
import { rosterStore } from '../../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  const id = rosterStore.addCharacter('Test', 'WARRIOR');
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PetsScreen, { target, props: {} });
  flushSync();
});
afterEach(() => {
  unmount(app);
  target.remove();
});

const btn = (label) => [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const byLabel = (text) => document.getElementById([...target.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(text)).htmlFor);
const click = (el) => {
  el.click();
  flushSync();
};
const change = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};

it('starts empty, adds a pet in edit mode, and shows the species', () => {
  expect(target.textContent).toContain('No pets yet');
  change(byLabel('Species to add'), 'EMBER_FOX');
  click(btn('+ Add pet'));
  expect(rosterStore.current.pets.owned[0].species).toBe('EMBER_FOX');
  expect(target.querySelectorAll('.pet-card')).toHaveLength(1);
  expect(target.querySelector('select[aria-label="Species"]')).not.toBeNull();
  click(btn('Save'));
  expect(target.querySelector('.rarity-title').textContent).toBe('Ember Fox');
});

it('adds a secondary through the edit controls', () => {
  click(btn('+ Add pet'));
  change(target.querySelector('select[aria-label="Add secondary stat"]'), 'ATTACK_PERCENT');
  expect(rosterStore.current.pets.owned[0].secondaries[0].type).toBe('ATTACK_PERCENT');
  click(btn('Save'));
  expect(target.querySelector('.sec-line').textContent).toContain('+0.1%');
});

it('altar level steppers write the store', () => {
  click(target.querySelector('button[aria-label="Raise altar level"]'));
  expect(rosterStore.current.pets.altar.level).toBe(2);
  expect(target.querySelector('[data-testid="altar-level"]').textContent).toBe('2');
});

it('changing the tier asks first, names the pets and presets it will clear, then wipes and evolves names', () => {
  click(btn('+ Add pet'));
  const id = rosterStore.current.pets.owned[0].id;
  const presetName = rosterStore.current.presets[0].name;
  const petName = petDisplayName(rosterStore.current.pets.owned[0].species, false);
  rosterStore.setPresetPet(rosterStore.current.presets[0].id, id);
  flushSync();
  change(target.querySelector('select[aria-label="Pet altar tier"]'), '2');
  click(btn('Change tier'));
  expect(rosterStore.current.pets.altar.tier).toBe(1);
  const dialog = document.querySelector('dialog');
  expect(dialog.textContent).toContain(petName);
  expect(dialog.textContent).toContain(presetName);
  click([...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Wipe collection'));
  expect(rosterStore.current.pets.altar.tier).toBe(2);
  expect(rosterStore.current.pets.owned).toHaveLength(0);
  expect(rosterStore.current.presets[0].petId).toBeNull();
  click(btn('+ Add pet'));
  click(btn('Save'));
  expect(target.querySelector('.rarity-title').textContent).toBe('Dust Stalker');
});

it('the altar level has a number field that writes the same value as the slider and steppers', () => {
  const input = [...target.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith('Pet altar level'));
  const el = document.getElementById(input.htmlFor);
  el.value = '12';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();
  expect(rosterStore.current.pets.altar.level).toBe(12);
  expect(target.querySelector('[data-testid="altar-level"]').textContent).toBe('12');
});
