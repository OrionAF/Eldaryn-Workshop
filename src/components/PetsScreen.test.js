import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PetsScreen from './PetsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PetsScreen, { target, props: {} });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('shows an empty hint with no pets', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();
  cleanup();
});

it('Add Pet creates a pet with no per-pet level field anywhere', () => {
  const nameInput = target.querySelector('input[aria-label="Pet name"]');
  nameInput.value = 'Ashfang';
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  target.querySelector('.add-form button').click();
  flushSync();

  expect(rosterStore.current.pets.length).toBe(1);
  expect(rosterStore.current.pets[0].name).toBe('Ashfang');
  expect(rosterStore.current.pets[0].level).toBeUndefined();
  expect(target.querySelector('input[aria-label="Level"]')).toBeNull();

  rosterStore.removePet(rosterStore.current.pets[0].id); // cleanup - rosterStore is a shared singleton across tests
  cleanup();
});

it('PET LEVEL is one shared character-wide field, not per-pet', () => {
  const levelInput = target.querySelector('.pet-level input');
  levelInput.value = '15';
  levelInput.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.petLevel).toBe(15);

  rosterStore.setPetLevel(1); // cleanup
  cleanup();
});

it('Edit stats toggles a stat editor for that pet; stat changes write through', () => {
  const id = rosterStore.addPet('Ashfang', 'Epic');
  flushSync();

  const rowIndex = rosterStore.current.pets.findIndex((p) => p.id === id);
  const row = [...target.querySelectorAll('.entry-list li')][rowIndex];
  const editBtn = () => [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Edit stats' || b.textContent.trim() === 'Hide stats');
  editBtn().click(); // "Edit stats"
  flushSync();
  expect(target.querySelector('.pet-editor')).not.toBeNull();

  const attackInput = target.querySelector('.pet-editor .stats-fields input');
  attackInput.value = '2664';
  attackInput.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.pets.find((p) => p.id === id).stats.attack).toBe(2664);

  editBtn().click(); // "Hide stats"
  flushSync();
  expect(target.querySelector('.pet-editor')).toBeNull();

  rosterStore.removePet(id); // cleanup
  cleanup();
});

it('shows used-by presets, or "unused"', () => {
  const id = rosterStore.addPet('Ashfang', 'Epic');
  flushSync();
  expect(target.querySelector('.used-by').textContent).toBe('unused');

  rosterStore.setPresetPet(rosterStore.current.presets[0].id, id);
  flushSync();
  expect(target.querySelector('.used-by').textContent).toContain('used by');

  rosterStore.removePet(id); // cleanup
  cleanup();
});

it('removing a pet (two-step confirm) nulls petId on any preset that used it', () => {
  const startCount = rosterStore.current.pets.length;
  const id = rosterStore.addPet('Ashfang', 'Epic');
  rosterStore.setPresetPet(rosterStore.current.presets[0].id, id);
  flushSync();

  const rowIndex = rosterStore.current.pets.findIndex((p) => p.id === id);
  const row = [...target.querySelectorAll('.entry-list li')][rowIndex];
  const removeBtn = [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove');
  removeBtn.click();
  flushSync();
  row.querySelector('.confirm-yes').click();
  flushSync();

  expect(rosterStore.current.pets.length).toBe(startCount);
  expect(rosterStore.current.presets[0].petId).toBe(null);
  cleanup();
});
