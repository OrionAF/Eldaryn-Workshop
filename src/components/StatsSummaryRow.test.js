import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import StatsSummaryRow from './StatsSummaryRow.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
});

function render(props) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(StatsSummaryRow, { target, props });
  flushSync();
}
function cleanup() {
  unmount(app);
  target.remove();
}

it('Compare mode renders read-only text, no inputs', () => {
  render({ selectedSlot: 'Weapon', mode: 'compare' });
  expect(target.querySelectorAll('input').length).toBe(0);
  cleanup();
});

it('Edit mode renders editable inputs that write to loadout.gear[slot] via the store', () => {
  render({ selectedSlot: 'Weapon', mode: 'edit' });
  const columns = [...target.querySelectorAll('.stats-summary-column')];
  const l1AttackInput = columns[0].querySelectorAll('input')[0];
  l1AttackInput.value = '1.500';
  l1AttackInput.dispatchEvent(new Event('input', { bubbles: true }));
  l1AttackInput.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.loadouts[0].gear.Weapon.attack).toBe(1500);
  expect(rosterStore.current.loadouts[1].gear.Weapon.attack).toBe(0);
  cleanup();
});
