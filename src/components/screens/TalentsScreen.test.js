import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TalentsScreen from './TalentsScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Test', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(TalentsScreen, { target, props: {} });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('shows Set A / Set B and a spec prompt', () => {
  const chips = [...target.querySelectorAll('.chip-list .chip')];
  expect(chips.map((c) => c.textContent.trim())).toEqual(['Set A', 'Set B']);
  expect(target.textContent).toContain('Choose a specialization');
  cleanup();
});

it('lists only the class specs and allocates points with the + button', () => {
  const sel = target.querySelector('select');
  expect([...sel.options].map((o) => o.textContent.trim())).toEqual(['Choose a spec...', 'Protection', 'Arms']);
  sel.value = 'WARRIOR_DPS';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(target.textContent).toContain('0 / 29 pts');
  target.querySelector('button[aria-label="Raise Sharpened Blade"]').click();
  flushSync();
  expect(target.textContent).toContain('1 / 29 pts');
  expect(rosterStore.current.talentSets[0].allocation.dps_t1_sharpened_blade).toBe(1);
  cleanup();
});
