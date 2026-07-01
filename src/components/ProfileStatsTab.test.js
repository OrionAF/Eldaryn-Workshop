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

it('a manually-entered value above a stat cap displays clamped to the cap', () => {
  rosterStore.setProfileField(0, 'crit', 999); // cap is 80
  flushSync();

  const columns = [...target.querySelectorAll('.loadout-column')];
  const critInput = [...columns[0].querySelectorAll('label')].find((l) => l.textContent.includes('Critical %')).querySelector('input');
  expect(critInput.value).toBe('80');
  // The raw stored value is untouched - only the displayed/effective read clamps.
  expect(rosterStore.current.loadouts[0].profileTotals.crit).toBe(999);
  cleanup();
});

it('with no class chosen, neither Warrior- nor Sentinel-only fields show', () => {
  const labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).not.toContain('Block Chance %');
  expect(labels).not.toContain('DMG Reduction %');
  expect(labels).not.toContain('Miss Chance %');
  expect(labels).not.toContain('Blind Chance %');
  expect(labels).not.toContain('Paralyze Chance %');
  cleanup();
});

it('Warrior shows Block Chance/DMG Reduction but not the Sentinel-only fields', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).toContain('Block Chance %');
  expect(labels).toContain('DMG Reduction %');
  expect(labels).not.toContain('Miss Chance %');
  expect(labels).not.toContain('Blind Chance %');
  expect(labels).not.toContain('Paralyze Chance %');
  cleanup();
});

it('Sentinel shows Miss/Blind/Paralyze Chance but not the Warrior-only fields', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();

  const labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).toContain('Miss Chance %');
  expect(labels).toContain('Blind Chance %');
  expect(labels).toContain('Paralyze Chance %');
  expect(labels).not.toContain('Block Chance %');
  expect(labels).not.toContain('DMG Reduction %');
  cleanup();
});

it('switching class updates the visible field set live', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
  expect([...target.querySelectorAll('.field-label')].map((l) => l.textContent)).toContain('Block Chance %');

  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  const labels = [...target.querySelectorAll('.field-label')].map((l) => l.textContent);
  expect(labels).not.toContain('Block Chance %');
  expect(labels).toContain('Miss Chance %');
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

it('Calculated mode shows a read-only computed total and preserves the manual value underneath, unchanged on switching back', () => {
  rosterStore.setLoadoutTotalsMode(0, 'manual');
  rosterStore.setProfileField(0, 'attack', 12345);
  rosterStore.setGearField('Weapon', 0, 'attack', 500);
  flushSync();

  let columns = [...target.querySelectorAll('.loadout-column')];
  expect(columns[0].querySelectorAll('input').length).toBeGreaterThan(0); // manual: editable

  const calcButton = [...columns[0].querySelectorAll('.totals-toggle button')].find((b) => b.textContent.trim() === 'Calculated');
  calcButton.click();
  flushSync();

  columns = [...target.querySelectorAll('.loadout-column')];
  expect(columns[0].querySelectorAll('input').length).toBe(0); // read-only now
  expect(columns[0].textContent).toContain('510'); // BASE_ATTACK(10) + gear(500) = 510, Calculated
  expect(rosterStore.current.loadouts[0].profileTotals.attack).toBe(12345); // manual value untouched underneath

  const manualButton = [...columns[0].querySelectorAll('.totals-toggle button')].find((b) => b.textContent.trim() === 'Manual');
  manualButton.click();
  flushSync();

  columns = [...target.querySelectorAll('.loadout-column')];
  const attackInput = columns[0].querySelectorAll('input')[0];
  expect(attackInput.value).toBe('12.345'); // restored, unchanged
  cleanup();
});
