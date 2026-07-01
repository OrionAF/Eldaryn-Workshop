import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ProfileStatsTab from './ProfileStatsTab.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(ProfileStatsTab, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('renders both loadout columns with names and independent field sets', () => {
  const headers = [...target.querySelectorAll('h2')].map((h) => h.textContent);
  expect(headers).toEqual(['Loadout 1', 'Loadout 2']);
  cleanup();
});

it('editing a field in one loadout column updates only that loadout', () => {
  const columns = [...target.querySelectorAll('.loadout-column')];
  const l1AttackInput = columns[0].querySelectorAll('input')[0]; // "attack" is first field
  l1AttackInput.value = '50.000';
  l1AttackInput.dispatchEvent(new Event('input', { bubbles: true }));
  l1AttackInput.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.loadouts[0].profileTotals.attack).toBe(50000);
  expect(rosterStore.current.loadouts[1].profileTotals.attack).toBe(0);
  cleanup();
});

it('the higher loadout value is bolded via the highlight class on both columns', () => {
  rosterStore.setProfileField(0, 'attack', 500);
  rosterStore.setProfileField(1, 'attack', 100);
  flushSync();

  const columns = [...target.querySelectorAll('.loadout-column')];
  const l1AttackLabel = columns[0].querySelectorAll('label')[0];
  const l2AttackLabel = columns[1].querySelectorAll('label')[0];
  expect(l1AttackLabel.classList.contains('highlight')).toBe(true);
  expect(l2AttackLabel.classList.contains('highlight')).toBe(false);
  cleanup();
});
