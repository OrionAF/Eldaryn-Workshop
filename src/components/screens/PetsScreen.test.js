import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PetsScreen from './PetsScreen.svelte';
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
  change(target.querySelector('select[aria-label="Species to add"]'), 'EMBER_FOX');
  click(btn('Add Pet'));
  expect(rosterStore.current.pets.owned[0].species).toBe('EMBER_FOX');
  expect(target.querySelectorAll('.pet-card')).toHaveLength(1);
  expect(target.querySelector('select[aria-label="Species"]')).not.toBeNull();
  click(btn('Save'));
  expect(target.querySelector('.rarity-title').textContent).toBe('Ember Fox');
});

it('adds a secondary through the edit controls', () => {
  click(btn('Add Pet'));
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

it('changing the tier needs a confirm, wipes pets, and evolves names', () => {
  click(btn('Add Pet'));
  const id = rosterStore.current.pets.owned[0].id;
  rosterStore.setPresetPet(rosterStore.current.presets[0].id, id);
  flushSync();
  change(target.querySelector('select[aria-label="Pet altar tier"]'), '2');
  click(btn('Change tier'));
  expect(rosterStore.current.pets.altar.tier).toBe(1);
  expect(target.textContent).toContain('Removes all 1 pets');
  click(btn('Wipe collection'));
  expect(rosterStore.current.pets.altar.tier).toBe(2);
  expect(rosterStore.current.pets.owned).toHaveLength(0);
  expect(rosterStore.current.presets[0].petId).toBeNull();
  click(btn('Add Pet'));
  click(btn('Save'));
  expect(target.querySelector('.rarity-title').textContent).toBe('Dust Stalker');
});
