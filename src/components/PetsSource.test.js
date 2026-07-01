import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PetsSource from './PetsSource.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  // rosterStore is a shared singleton - drain pets left by earlier test files.
  for (const p of [...rosterStore.current.sources.pets.entries]) rosterStore.removePet(p.id);
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PetsSource, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('shows an empty hint with no pets, and adds a pet via the form', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();

  target.querySelector('.add-form input[type="text"]').value = 'Blood Wyvern';
  target.querySelector('.add-form input[type="text"]').dispatchEvent(new Event('input', { bubbles: true }));
  const raritySelect = target.querySelector('.add-form select');
  raritySelect.value = 'Epic';
  raritySelect.dispatchEvent(new Event('change', { bubbles: true }));
  const levelInput = target.querySelector('.add-form input[type="number"]');
  levelInput.value = '16';
  levelInput.dispatchEvent(new Event('input', { bubbles: true }));
  target.querySelector('.add-form button').click();
  flushSync();

  expect(target.querySelector('.empty-hint')).toBeNull();
  expect(rosterStore.current.sources.pets.entries.length).toBe(1);
  const pet = rosterStore.current.sources.pets.entries[0];
  expect(pet.name).toBe('Blood Wyvern');
  expect(pet.rarity).toBe('Epic');
  expect(pet.level).toBe(16);
  expect(rosterStore.current.sources.pets.activeId).toBe(pet.id); // first pet auto-activates
  cleanup();
});

it('marking a second pet active via the radio updates rosterStore', () => {
  const firstId = rosterStore.addPet('First', 'Common', 1);
  const secondId = rosterStore.addPet('Second', 'Rare', 5);
  flushSync();

  const radios = [...target.querySelectorAll('input[type="radio"]')];
  const secondRadio = radios[1];
  secondRadio.checked = true;
  secondRadio.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.sources.pets.activeId).toBe(secondId);
  expect(firstId).not.toBe(secondId);
  cleanup();
});

it('Edit stats opens the StatsFields editor bound to that pet, and changes write through updatePetStat', () => {
  const petId = rosterStore.addPet('Statful', 'Epic', 16);
  flushSync();

  target.querySelector('.entry-list li button').click(); // "Edit stats"
  flushSync();
  expect(target.querySelector('.pet-editor')).not.toBeNull();

  const attackInput = target.querySelector('.pet-editor input[type="text"]');
  attackInput.value = '2.664';
  attackInput.dispatchEvent(new Event('input', { bubbles: true }));
  attackInput.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();

  const pet = rosterStore.current.sources.pets.entries.find((p) => p.id === petId);
  expect(pet.stats.attack).toBe(2664);
  cleanup();
});

it('Remove requires a second click (Confirm remove) before it takes effect', () => {
  const petId = rosterStore.addPet('Removable', 'Common', 1);
  flushSync();
  target.querySelector('.entry-list li button').click(); // "Edit stats"
  flushSync();
  expect(target.querySelector('.pet-editor')).not.toBeNull();

  const row = target.querySelector('.entry-list li');
  [...row.querySelectorAll('button')].find((b) => b.textContent === 'Remove').click();
  flushSync();

  // First click only reveals the confirm step - the pet isn't gone yet.
  expect(rosterStore.current.sources.pets.entries.some((p) => p.id === petId)).toBe(true);
  const rowButtons = [...row.querySelectorAll('button')].map((b) => b.textContent);
  expect(rowButtons).toContain('Confirm remove');
  expect(rowButtons).toContain('Cancel');
  expect(rowButtons).not.toContain('Remove');

  [...row.querySelectorAll('button')].find((b) => b.textContent === 'Confirm remove').click();
  flushSync();

  expect(rosterStore.current.sources.pets.entries.some((p) => p.id === petId)).toBe(false);
  expect(target.querySelector('.pet-editor')).toBeNull();
  cleanup();
});
