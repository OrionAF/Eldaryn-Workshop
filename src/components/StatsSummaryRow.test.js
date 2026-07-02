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

it('Compare mode hides a defensive/bonus field only when it is 0 in BOTH loadouts', () => {
  rosterStore.setGearField('Weapon', 0, 'block_chance', 5); // Loadout 1 has it, Loadout 2 doesn't
  render({ selectedSlot: 'Weapon', mode: 'compare' });

  let labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).toContain('Block Chance %'); // kept - non-zero in at least one loadout
  expect(labels).not.toContain('Miss Chance %'); // 0 in both - hidden

  rosterStore.setGearField('Weapon', 0, 'block_chance', 0); // now 0 in both
  flushSync();
  labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).not.toContain('Block Chance %');
  cleanup();
});

it('Compare mode never hides the primary combat/sustain stats, even at 0', () => {
  render({ selectedSlot: 'Weapon', mode: 'compare' });
  const labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).toContain('Attack');
  expect(labels).toContain('Speed %');
  expect(labels).toContain('Critical %');
  expect(labels).toContain('Lifesteal %');
  expect(labels).toContain('HP Regen %/s');
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
