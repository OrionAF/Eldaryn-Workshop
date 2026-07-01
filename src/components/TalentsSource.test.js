import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TalentsSource from './TalentsSource.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { TALENT_TREES } from '../lib/talentTreeData.js';

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
  setA.value = 'arms';
  setA.dispatchEvent(new Event('change', { bubbles: true }));
  setB.value = 'protection';
  setB.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.loadouts[0].spec).toBe('arms');
  expect(rosterStore.current.loadouts[1].spec).toBe('protection');
  cleanup();
});

it('assigning the same spec to both sets works too ("two of one")', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const [setA, setB] = [...target.querySelectorAll('.set-card select')];
  setA.value = 'arms';
  setA.dispatchEvent(new Event('change', { bubbles: true }));
  setB.value = 'arms';
  setB.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.loadouts[0].spec).toBe('arms');
  expect(rosterStore.current.loadouts[1].spec).toBe('arms');
  cleanup();
});

it('once a spec is assigned, the tier list renders and Reset Talents clears the allocation', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  rosterStore.setLoadoutSpec(0, 'arms');
  flushSync();

  expect(target.querySelector('.tier-section')).not.toBeNull();
  const talentId = TALENT_TREES.arms.tiers[0].talents[0].id; // the real (placeholder) tier-1 talent
  rosterStore.setTalentRank(0, talentId, 1);
  flushSync();
  expect(rosterStore.current.loadouts[0].talentAllocation[talentId]).toBe(1);

  target.querySelector('.reset-button').click();
  flushSync();
  expect(rosterStore.current.loadouts[0].talentAllocation).toEqual({});
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
