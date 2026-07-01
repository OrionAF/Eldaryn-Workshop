import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TalentsSource from './TalentsSource.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(TalentsSource, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('shows a hint instead of Set cards when the character has no class chosen', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, null);
  flushSync();
  expect(target.querySelector('.set-selector')).toBeNull();
  expect(target.textContent).toContain('Choose a class');
  cleanup();
});

it('once a class is set, Set A/Set B cards offer only that class\'s two specs', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();

  const cards = [...target.querySelectorAll('.set-card')];
  expect(cards.length).toBe(2);
  const options = [...cards[0].querySelectorAll('option')].map((o) => o.textContent);
  expect(options).toEqual(['Choose a spec...', 'Marksmanship', 'Disruption']);
  cleanup();
});

it('assigning a spec to Set A and a different one to Set B works independently ("one of each")', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const [setA, setB] = [...target.querySelectorAll('.set-card select')];
  setA.value = 'fury';
  setA.dispatchEvent(new Event('change', { bubbles: true }));
  setB.value = 'protection';
  setB.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.loadouts[0].spec).toBe('fury');
  expect(rosterStore.current.loadouts[1].spec).toBe('protection');
  cleanup();
});

it('assigning the same spec to both sets works too ("two of one")', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const [setA, setB] = [...target.querySelectorAll('.set-card select')];
  setA.value = 'fury';
  setA.dispatchEvent(new Event('change', { bubbles: true }));
  setB.value = 'fury';
  setB.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.loadouts[0].spec).toBe('fury');
  expect(rosterStore.current.loadouts[1].spec).toBe('fury');
  cleanup();
});

it('the points readout tracks the selected Set independently', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
  expect(target.querySelector('.points-readout').textContent).toContain('0 / 29');

  // Clicking Set B's label switches which Set's readout is shown.
  const labels = [...target.querySelectorAll('.set-label')];
  labels[1].click();
  flushSync();
  expect(target.querySelector('.points-readout').textContent).toContain('0 / 29');
  cleanup();
});
