import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import GearLoadoutsScreen from './GearLoadoutsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(GearLoadoutsScreen, { target, props: {} });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('defaults to Loadout 1, Weapon slot, showing the seeded preset as a user', () => {
  expect(target.querySelector('.field-col .micro-label').textContent).toBe('Loadout 1 — Weapon');
  expect(target.querySelector('.used-by').textContent).toContain('used by');
  cleanup();
});

it('switching the loadout chip changes which loadout is shown, and its own used-by note', () => {
  const chips = [...target.querySelectorAll('.chip-list .chip')];
  chips[1].click(); // Loadout 2
  flushSync();
  expect(target.querySelector('.field-col .micro-label').textContent).toBe('Loadout 2 — Weapon');
  expect(target.querySelector('.used-by').textContent).toContain('No presets use this loadout yet');
  cleanup();
});

it('clicking a silhouette slot switches which slot is being edited', () => {
  target.querySelector('.slot[aria-pressed]:not(.selected)').click();
  flushSync();
  const selected = target.querySelector('.slot.selected');
  expect(target.querySelector('.field-col .micro-label').textContent).toContain(selected.textContent.trim());
  cleanup();
});

it('editing a stat field writes through rosterStore.setGearField', () => {
  const input = target.querySelector('.stats-fields input');
  input.value = '500';
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.loadouts[0].gear.Weapon.attack).toBe(500);

  rosterStore.setGearField('Weapon', 0, 'attack', 0); // cleanup
  cleanup();
});
