import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TalentSetsScreen from './TalentSetsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(TalentSetsScreen, { target, props: {} });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('shows an onboarding hint with no class chosen', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();
  expect(target.textContent).toContain('Choose a class');
  cleanup();
});

it('shows the fixed Set A/Set B labels and a spec prompt before any spec is chosen', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  const chips = [...target.querySelectorAll('.chip-list .chip')];
  expect(chips.map((c) => c.textContent.trim())).toEqual(['Set A', 'Set B']);
  expect(target.textContent).toContain('Choose a specialization');
  cleanup();
});

it('choosing a spec renders the talent tree; switching sets keeps them independent', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();

  const select = target.querySelector('select');
  select.value = 'marksmanship';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.talentSets[0].spec).toBe('marksmanship');
  expect(target.querySelector('.tier-section')).not.toBeNull();

  const chips = [...target.querySelectorAll('.chip-list .chip')];
  chips[1].click(); // Set B
  flushSync();
  expect(target.textContent).toContain('Choose a specialization above for Set B');
  cleanup();
});

it('the points readout and used-by hint reflect the selected set', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  const presetId = rosterStore.current.presets[0].id;
  rosterStore.setPresetTalentSet(presetId, 0);
  flushSync();
  expect(target.querySelector('.used-by').textContent).toContain('used by');

  const chips = [...target.querySelectorAll('.chip-list .chip')];
  chips[1].click(); // Set B - nothing points at it
  flushSync();
  expect(target.querySelector('.used-by').textContent).toBe('unused');
  cleanup();
});

it('Reset (two-step confirm) clears the allocation for the selected set only', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  rosterStore.setTalentSetSpec(0, 'marksmanship');
  flushSync();

  const plusButton = target.querySelectorAll('.rank-controls button')[1];
  plusButton.click();
  flushSync();
  expect(Object.keys(rosterStore.current.talentSets[0].allocation).length).toBeGreaterThan(0);

  const resetBtn = [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Reset Set A');
  resetBtn.click();
  flushSync();
  target.querySelector('.confirm-yes').click();
  flushSync();
  expect(rosterStore.current.talentSets[0].allocation).toEqual({});
  cleanup();
});
