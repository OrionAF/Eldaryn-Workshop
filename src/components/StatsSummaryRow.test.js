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

it('hides Warrior/Sentinel-only fields with no class chosen, and shows the right ones once a class is set', () => {
  render({ selectedSlot: 'Weapon', mode: 'edit' });
  let labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).not.toContain('Block Chance %');
  expect(labels).not.toContain('Miss Chance %');

  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
  labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).toContain('Block Chance %');
  expect(labels).toContain('DMG Reduction %');
  expect(labels).not.toContain('Miss Chance %');
  cleanup();
});

it('Compare mode renders read-only text, no inputs', () => {
  render({ selectedSlot: 'Weapon', mode: 'compare' });
  expect(target.querySelectorAll('input').length).toBe(0);
  cleanup();
});

function columnLabels(i) {
  const column = target.querySelectorAll('.stats-summary-column')[i];
  return [...column.querySelectorAll('.field-label')].map((l) => l.textContent);
}

it('Compare mode hides a field independently per column - non-zero in one loadout does not force it to show in the other', () => {
  rosterStore.setGearField('Weapon', 0, 'block_chance', 5); // Loadout 1 has it, Loadout 2 doesn't
  render({ selectedSlot: 'Weapon', mode: 'compare' });

  expect(columnLabels(0)).toContain('Block Chance %'); // Loadout 1 - non-zero, shown
  expect(columnLabels(1)).not.toContain('Block Chance %'); // Loadout 2 - 0 for this column, hidden
  expect(columnLabels(0)).not.toContain('Miss Chance %'); // 0 in this column too - hidden

  rosterStore.setGearField('Weapon', 0, 'block_chance', 0); // reset - rosterStore is a shared singleton across tests
  cleanup();
});

it('Compare mode hides EVERY field at 0 for a column, not just the defensive ones', () => {
  render({ selectedSlot: 'Weapon', mode: 'compare' });
  expect(columnLabels(0)).toEqual([]); // a completely empty slot has nothing worth comparing
  expect(columnLabels(1)).toEqual([]);
  cleanup();
});

it('Compare mode keeps a primary stat only on the column(s) where it is actually non-zero', () => {
  rosterStore.setGearField('Weapon', 0, 'attack', 1500);
  rosterStore.setGearField('Weapon', 1, 'speed', 10);
  render({ selectedSlot: 'Weapon', mode: 'compare' });

  expect(columnLabels(0)).toContain('Attack');
  expect(columnLabels(0)).not.toContain('Speed %'); // 0 on this loadout - hidden here
  expect(columnLabels(1)).toContain('Speed %');
  expect(columnLabels(1)).not.toContain('Attack'); // 0 on this loadout - hidden here
  expect(columnLabels(0)).not.toContain('Critical %'); // 0 on both - hidden everywhere
  expect(columnLabels(1)).not.toContain('Critical %');

  rosterStore.setGearField('Weapon', 0, 'attack', 0); // reset - rosterStore is a shared singleton across tests
  rosterStore.setGearField('Weapon', 1, 'speed', 0);
  cleanup();
});

it('Edit mode always shows every field, regardless of zero values', () => {
  render({ selectedSlot: 'Weapon', mode: 'edit' });
  const labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).toContain('Penetration %'); // 0 in both loadouts, but Edit mode keeps it
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
