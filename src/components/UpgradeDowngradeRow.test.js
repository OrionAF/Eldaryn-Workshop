import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import UpgradeDowngradeRow from './UpgradeDowngradeRow.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.setProfileField(0, 'attack', 100);
  rosterStore.setProfileField(0, 'speed', 200);
  rosterStore.setProfileField(1, 'attack', 100);
  rosterStore.setProfileField(1, 'speed', 200);
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(UpgradeDowngradeRow, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('renders nothing without an active drop', () => {
  expect(target.querySelector('.result-card')).toBeNull();
  cleanup();
});

it('shows an upgrade/downgrade card per loadout with the new DPS once a drop starts', () => {
  rosterStore.startDrop('Weapon');
  rosterStore.setDropField('speed', 100); // +100 speed -> 200-0+100 = 300 -> DPS = 100*3 = 300
  flushSync();

  const cards = target.querySelectorAll('.result-card');
  expect(cards.length).toBe(2);
  expect(target.textContent).toContain('300.0');
  expect(cards[0].classList.contains('upgrade')).toBe(true);
  cleanup();
});

it('Apply applies the drop to that loadout only; Discard clears it for both', () => {
  rosterStore.startDrop('Weapon');
  rosterStore.setDropField('speed', 100);
  flushSync();

  [...target.querySelectorAll('.result-card')][0].querySelector('button').click();
  flushSync();
  expect(rosterStore.current.loadouts[0].gear.Weapon.speed).toBe(100);
  expect(rosterStore.roster.drop).toBeNull(); // applying clears the shared drop
  cleanup();
});
