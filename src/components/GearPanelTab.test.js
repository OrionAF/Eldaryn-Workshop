import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import GearPanelTab from './GearPanelTab.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

function clickTab(el, text) {
  const btn = [...el.querySelectorAll('.mode-toggle button')].find((b) => b.textContent.trim() === text);
  btn.click();
  flushSync();
}

function fillFirstInput(scope, raw) {
  const input = scope.querySelectorAll('input')[0];
  input.value = raw;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
}

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(GearPanelTab, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('renders two silhouette columns, defaulting to the first slot selected', () => {
  const columns = target.querySelectorAll('.silhouette-column');
  expect(columns.length).toBe(2);
  expect(target.textContent).toContain('Slot selected: Head');
  cleanup();
});

it('clicking a slot in one loadout selects it in both silhouettes', () => {
  const columns = [...target.querySelectorAll('.silhouette-column')];
  const l1Ring = [...columns[0].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ring');
  l1Ring.click();
  flushSync();

  const l1RingAfter = [...columns[0].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ring');
  const l2Ring = [...columns[1].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Ring');
  expect(l1RingAfter.getAttribute('aria-pressed')).toBe('true');
  expect(l2Ring.getAttribute('aria-pressed')).toBe('true');
  expect(target.textContent).toContain('Slot selected: Ring');
  cleanup();
});

it('Compare mode shows the item input form and result row; Edit mode hides both', () => {
  expect(target.querySelector('.item-stat-input-form')).not.toBeNull();
  expect(target.querySelector('.upgrade-downgrade-row')).not.toBeNull();

  clickTab(target, 'Edit');
  expect(target.querySelector('.item-stat-input-form')).toBeNull();
  expect(target.querySelector('.upgrade-downgrade-row')).toBeNull();
  expect(target.querySelectorAll('.stats-summary-row input').length).toBeGreaterThan(0);
  cleanup();
});

it('full workflow: edit baseline, enter a candidate, watch deltas live, apply, then discard clears without applying', () => {
  // Give the character a non-zero baseline (attack + speed, so DPS = attack
  // exactly with crit/double_hit at 0) rather than the all-zero defaults
  // offensiveStats() starts with, which would make speed_factor 0 and every
  // DPS delta 0 regardless of attack.
  rosterStore.setProfileField(0, 'attack', 100);
  rosterStore.setProfileField(0, 'speed', 100);
  rosterStore.setProfileField(1, 'attack', 100);
  rosterStore.setProfileField(1, 'speed', 100);
  flushSync();

  // Select the Weapon slot (default is Head), then Edit mode to seed its
  // baseline equipped stats for both loadouts.
  const l1Columns = [...target.querySelectorAll('.silhouette-column')];
  [...l1Columns[0].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Weapon').click();
  flushSync();
  clickTab(target, 'Edit');
  const summaryColumns = [...target.querySelectorAll('.stats-summary-column')];
  fillFirstInput(summaryColumns[0], '10'); // Loadout 1 Weapon attack = 10
  fillFirstInput(summaryColumns[1], '10'); // Loadout 2 Weapon attack = 10
  expect(rosterStore.current.loadouts[0].gear.Weapon.attack).toBe(10);
  expect(rosterStore.current.loadouts[1].gear.Weapon.attack).toBe(10);

  // Back to Compare: enter a candidate that's a clear upgrade.
  clickTab(target, 'Compare');
  const dropForm = target.querySelector('.item-stat-input-form');
  fillFirstInput(dropForm, '60'); // candidate Weapon attack = 60 (was 10 -> +50)

  const resultCards = [...target.querySelectorAll('.result-card')];
  expect(resultCards.length).toBe(2);
  expect(resultCards[0].classList.contains('upgrade')).toBe(true);
  expect(resultCards[0].textContent).toContain('DPS 100.0 -> 150.0');

  // Apply to Loadout 1 only.
  [...resultCards[0].querySelectorAll('button')].find((b) => b.textContent.includes('Apply')).click();
  flushSync();

  expect(rosterStore.current.loadouts[0].gear.Weapon.attack).toBe(60);
  expect(rosterStore.current.loadouts[0].profileTotals.attack).toBe(150);
  expect(rosterStore.current.loadouts[1].gear.Weapon.attack).toBe(10); // untouched
  expect(rosterStore.roster.drop).toBe(null); // apply clears the shared drop

  // Start a fresh drop, then discard it - no changes should apply.
  clickTab(target, 'Edit');
  clickTab(target, 'Compare');
  const dropForm2 = target.querySelector('.item-stat-input-form');
  fillFirstInput(dropForm2, '999');
  const beforeL2Attack = rosterStore.current.loadouts[1].gear.Weapon.attack;
  target.querySelector('.discard').click();
  flushSync();

  expect(rosterStore.roster.drop).toBe(null);
  expect(rosterStore.current.loadouts[1].gear.Weapon.attack).toBe(beforeL2Attack);
  cleanup();
});

it('the drop survives a character switch', () => {
  rosterStore.addCharacter('Second Character');
  const charB = rosterStore.current.id;
  rosterStore.selectCharacter(rosterStore.roster.characters[0].id);
  flushSync();

  const dropForm = target.querySelector('.item-stat-input-form');
  fillFirstInput(dropForm, '77');
  expect(rosterStore.roster.drop.piece.attack).toBe(77);

  rosterStore.selectCharacter(charB);
  flushSync();
  expect(rosterStore.roster.drop.piece.attack).toBe(77);
  cleanup();
});
