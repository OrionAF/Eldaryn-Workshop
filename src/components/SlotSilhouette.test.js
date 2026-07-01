import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SlotSilhouette from './SlotSilhouette.svelte';
import { SLOTS } from '../lib/constants.js';
import { emptyStats } from '../lib/model.js';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

function emptyGear() {
  const g = {};
  for (const s of SLOTS) g[s] = emptyStats();
  return g;
}

it('renders all 9 slots and marks the selected one', () => {
  const app = mount(SlotSilhouette, {
    target,
    props: { gear: emptyGear(), selectedSlot: 'Chest', onSelect: () => {}, loadoutLabel: 'Loadout 1' },
  });
  flushSync();

  const buttons = [...target.querySelectorAll('button')];
  expect(buttons.map((b) => b.textContent.trim()).sort()).toEqual([...SLOTS].sort());
  const chest = buttons.find((b) => b.textContent.trim() === 'Chest');
  expect(chest.getAttribute('aria-pressed')).toBe('true');
  expect(buttons.find((b) => b.textContent.trim() === 'Head').getAttribute('aria-pressed')).toBe('false');
  unmount(app);
});

it('clicking a slot calls onSelect with that slot name', () => {
  let picked = null;
  const app = mount(SlotSilhouette, {
    target,
    props: { gear: emptyGear(), selectedSlot: 'Head', onSelect: (s) => (picked = s), loadoutLabel: 'Loadout 1' },
  });
  flushSync();

  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Weapon').click();
  flushSync();
  expect(picked).toBe('Weapon');
  unmount(app);
});

it('marks a slot as "filled" when its gear has any non-zero stat', () => {
  const gear = emptyGear();
  gear.Weapon.attack = 500;
  const app = mount(SlotSilhouette, {
    target,
    props: { gear, selectedSlot: 'Head', onSelect: () => {}, loadoutLabel: 'Loadout 1' },
  });
  flushSync();

  const weapon = [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Weapon');
  const head = [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Head');
  expect(weapon.classList.contains('filled')).toBe(true);
  expect(head.classList.contains('filled')).toBe(false);
  unmount(app);
});
