import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import RelicsScreen from './RelicsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { RELICS_BY_CLASS } from '../lib/relicsData.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(RelicsScreen, { target, props: {} });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
  rosterStore.setCharacterClass(rosterStore.current.id, null); // resets relicLevels/preset relicIds for the next test
});

it('shows an onboarding hint with no class chosen', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();
});

it('lists every relic for the class, tier-sectioned, starting at level 1 - no equip control', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();

  expect(target.querySelectorAll('.relic-row').length).toBe(RELICS_BY_CLASS.Sentinel.length);
  expect(target.querySelector('input[type="checkbox"]')).toBeNull(); // no equip checkbox anymore
  const firstRow = target.querySelector('.relic-row');
  expect(firstRow.querySelector('.relic-level-badge').textContent).toContain('LV 1/');
});

it('+/- level buttons write through rosterStore.setRelicLevel, clamped to [1, maxLevel]', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  const def = RELICS_BY_CLASS.Sentinel[0];

  const row = target.querySelector('.relic-row');
  const [minusBtn, plusBtn] = row.querySelectorAll('.rank-controls button');
  expect(minusBtn.disabled).toBe(true); // already at level 1

  plusBtn.click();
  flushSync();
  expect(rosterStore.current.relicLevels[def.id]).toBe(2);
  expect(row.querySelector('.relic-level-badge').textContent).toContain('LV 2/');
});

it('a relic level is the SAME everywhere (character-wide), not per-preset', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  const def = RELICS_BY_CLASS.Sentinel[0];
  rosterStore.setRelicLevel(def.id, 7);
  flushSync();
  expect(target.querySelector('.relic-level-badge').textContent).toContain('LV 7/');
});

it('shows "equipped in ..." for presets that equip this relic, "—" otherwise', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  const def = RELICS_BY_CLASS.Sentinel[0];
  flushSync();
  expect(target.querySelector('.used-by').textContent).toBe('—');

  const presetId = rosterStore.current.presets[0].id;
  rosterStore.toggleRelicOnPreset(presetId, def.id, true);
  flushSync();
  expect(target.querySelector('.used-by').textContent).toContain('equipped in');
});
