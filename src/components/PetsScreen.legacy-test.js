import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PetsScreen from './PetsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { companionStat, companionById, companionsForAltarTier } from '../lib/petsData.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PetsScreen, { target, props: {} });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
  // rosterStore is a module singleton - reset the character-wide pet state.
  for (const p of [...rosterStore.current.pets]) rosterStore.removePet(p.id);
  rosterStore.current.petAltar.tier = 1;
  rosterStore.setPetAltarLevel(1);
});

const addPetButton = () => [...target.querySelectorAll('.altar-row button')].find((b) => b.textContent.trim() === 'Add Pet');
const cards = () => [...target.querySelectorAll('.pet-card')];
const btn = (root, label) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const stepper = (label) => target.querySelector(`button[aria-label="${label}"]`);

function addPet() {
  addPetButton().click();
  flushSync();
}

it('shows an empty hint with no pets', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();
  expect(cards()).toHaveLength(0);
});

it('the altar tier and level are one character-wide pair', () => {
  expect(target.querySelector('[data-testid="altar-tier"]').textContent).toBe('1');

  stepper('Raise altar level').click();
  flushSync();
  expect(rosterStore.current.petAltar.level).toBe(2);

  const input = target.querySelector('input[aria-label="Pet altar level"]');
  input.value = '30';
  input.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.petAltar.level).toBe(30);
});

it('Add Pet creates a card in edit mode with derived Attack/Health from the altar', () => {
  rosterStore.setPetAltarLevel(50);
  flushSync();
  addPet();

  expect(cards()).toHaveLength(1);
  const card = cards()[0];
  expect(card.classList.contains('editing')).toBe(true);
  // Edit mode leads with the companion dropdown rather than the name.
  expect(card.querySelector('select[aria-label="Companion"]')).not.toBeNull();

  const pet = rosterStore.current.pets[0];
  const def = companionById(pet.companionId);
  const attack = companionStat(def, 'attack', 1, 50);
  expect(card.querySelector('.base-stats').textContent).toContain(String(attack).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
});

it('only tier-1 companions are offered at altar tier 1', () => {
  addPet();
  const options = [...cards()[0].querySelectorAll('select[aria-label="Companion"] option')]
    .map((o) => o.value)
    .filter(Boolean);
  expect(options).toHaveLength(18);
  expect(options).toEqual(companionsForAltarTier(1).map((d) => d.id));
  expect(options).toContain('dustmite'); // tier 1
  expect(options).not.toContain('duststalker'); // tier 2
});

it('changing the companion select repoints the pet and updates its rarity', () => {
  addPet();
  const select = cards()[0].querySelector('select[aria-label="Companion"]');
  select.value = 'astralseraph'; // Mythic, tier 1
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  const pet = rosterStore.current.pets[0];
  expect(pet.companionId).toBe('astralseraph');
  expect(pet.rarity).toBe('Mythic'); // catalogue rarity, not a user choice
  // Mythic pets get 3 secondary slots.
  expect(cards()[0].textContent).toContain('SECONDARY 0/3');
});

it('there is no rarity picker - rarity is catalogue data', () => {
  addPet();
  const labels = [...cards()[0].querySelectorAll('select')].map((s) => s.getAttribute('aria-label'));
  expect(labels).not.toContain('Rarity');
});

it('adding a secondary stat writes it through with a bounded value', () => {
  addPet();
  const add = cards()[0].querySelector('select[aria-label="Add secondary stat"]');
  add.value = 'attack_pct';
  add.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.pets[0].secondaries).toEqual([{ statKey: 'attack_pct', value: 0.1 }]);

  const slider = cards()[0].querySelector('input[type="range"]');
  expect([slider.min, slider.max]).toEqual(['0.1', '21']);
  slider.value = '999'; // out of range - the store clamps
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.pets[0].secondaries[0].value).toBe(21);
});

it('a manual secondary (Penetration) is typed, not slid, and is not capped', () => {
  addPet();
  const add = cards()[0].querySelector('select[aria-label="Add secondary stat"]');
  add.value = 'penetration';
  add.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(cards()[0].querySelector('input[type="range"]')).toBeNull();
  const field = cards()[0].querySelector('input[aria-label="Penetration value"]');
  field.value = '31.5'; // above the old scraped 14.6 envelope
  field.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.pets[0].secondaries).toEqual([{ statKey: 'penetration', value: 31.5 }]);
});

it('Save flips the card to display mode, and Edit brings the controls back', () => {
  addPet();
  const add = cards()[0].querySelector('select[aria-label="Add secondary stat"]');
  add.value = 'attack_pct';
  add.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  btn(cards()[0], 'Save').click();
  flushSync();

  const saved = cards()[0];
  expect(saved.classList.contains('editing')).toBe(false);
  expect(saved.querySelector('select[aria-label="Companion"]')).toBeNull();
  expect(saved.querySelector('input[type="range"]')).toBeNull();
  // The rolled value collapses to one line.
  expect(saved.querySelector('.sec-line').textContent.replace(/\s+/g, ' ')).toContain('Attack %: +0.1%');
  // Save is a view toggle, not a commit - the value was already persisted.
  expect(rosterStore.current.pets[0].secondaries).toHaveLength(1);

  btn(cards()[0], 'Edit').click();
  flushSync();
  expect(cards()[0].querySelector('input[type="range"]')).not.toBeNull();
});

it('shows used-by presets, or "unused"', () => {
  addPet();
  expect(cards()[0].querySelector('.used-by').textContent).toBe('unused');

  rosterStore.setPresetPet(rosterStore.current.presets[0].id, rosterStore.current.pets[0].id);
  flushSync();
  expect(cards()[0].querySelector('.used-by').textContent).toContain('used by');
});

it('removing a pet takes two clicks and nulls petId on any preset that used it', () => {
  addPet();
  const petId = rosterStore.current.pets[0].id;
  rosterStore.setPresetPet(rosterStore.current.presets[0].id, petId);
  flushSync();

  btn(cards()[0], 'Remove').click();
  flushSync();
  expect(rosterStore.current.pets).toHaveLength(1); // first click only arms it

  btn(cards()[0], 'Confirm remove').click();
  flushSync();
  expect(rosterStore.current.pets).toHaveLength(0);
  expect(rosterStore.current.presets[0].petId).toBe(null);
});

it('raising the altar tier warns before wiping, and Cancel leaves the collection alone', () => {
  addPet();
  stepper('Raise altar tier').click();
  flushSync();

  const warning = target.querySelector('.tier-warning');
  expect(warning).not.toBeNull();
  expect(warning.textContent).toContain('removes all 1 pets');
  expect(rosterStore.current.petAltar.tier).toBe(1); // nothing happened yet
  expect(rosterStore.current.pets).toHaveLength(1);

  btn(warning, 'Cancel').click();
  flushSync();
  expect(target.querySelector('.tier-warning')).toBeNull();
  expect(rosterStore.current.pets).toHaveLength(1);
});

it('confirming the altar tier change wipes the collection and re-offers tier-2 pets', () => {
  addPet();
  stepper('Raise altar tier').click();
  flushSync();
  btn(target.querySelector('.tier-warning'), 'Confirm — wipe collection').click();
  flushSync();

  expect(rosterStore.current.petAltar.tier).toBe(2);
  expect(rosterStore.current.pets).toHaveLength(0);
  expect(cards()).toHaveLength(0);

  addPet();
  const options = [...cards()[0].querySelectorAll('select[aria-label="Companion"] option')]
    .map((o) => o.value)
    .filter(Boolean);
  expect(options).toContain('duststalker'); // tier 2 now
  expect(options).not.toContain('dustmite');
});

it('with no pets, changing the altar tier needs no confirmation', () => {
  stepper('Raise altar tier').click();
  flushSync();
  expect(target.querySelector('.tier-warning')).toBeNull();
  expect(rosterStore.current.petAltar.tier).toBe(2);
});

it('a Custom pet keeps its manual stat editor and is not scaled by the altar', () => {
  const id = rosterStore.addPet({ name: 'Legacy', companionId: null });
  rosterStore.updatePetStat(id, 'attack', 500);
  flushSync();

  expect(target.textContent).toContain('Custom pets');
  const custom = target.querySelector('.custom-pet');
  expect(custom.textContent).toContain('Legacy');
  expect(custom.querySelector('input')).not.toBeNull();
  // Catalogue cards and custom pets are rendered separately.
  expect(cards()).toHaveLength(0);
});
