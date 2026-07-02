import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import RelicsSource from './RelicsSource.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { RELICS_BY_CLASS, RELIC_EQUIP_CAP } from '../lib/relicsData.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(RelicsSource, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('shows a hint instead of the relic list when the character has no class chosen', () => {
  expect(target.querySelector('.set-selector')).toBeNull();
  expect(target.textContent).toContain('Choose a class');
  cleanup();
});

it('Set labels spell out which loadout each maps to', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
  const labels = [...target.querySelectorAll('.set-card')].map((b) => b.textContent.trim());
  expect(labels).toEqual(['Set A (Loadout 1)', 'Set B (Loadout 2)']);
  cleanup();
});

it('lists every relic for the class, tier-sectioned, with Bronze having 1 stat and Silver having 2', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const tierHeadings = [...target.querySelectorAll('h3')].map((h) => h.textContent);
  expect(tierHeadings).toEqual(['Bronze', 'Silver', 'Gold']);

  const basaltRow = [...target.querySelectorAll('.relic-row')].find((r) => r.textContent.includes('Basalt Guard'));
  expect(basaltRow.querySelectorAll('.relic-stat').length).toBe(1);

  const fortuneRow = [...target.querySelectorAll('.relic-row')].find((r) => r.textContent.includes('Fortune Token'));
  expect(fortuneRow.querySelectorAll('.relic-stat').length).toBe(2);
  cleanup();
});

it('+ raises a relic level (clamped to maxLevel), and the displayed stat value scales with it', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const def = RELICS_BY_CLASS.Warrior.find((r) => r.id === 'basalt-guard'); // dmg_reduction 3.0 -> 12.0, maxLevel 10
  const row = () => [...target.querySelectorAll('.relic-row')].find((r) => r.textContent.includes('Basalt Guard'));
  const plusButton = () => row().querySelectorAll('.rank-controls button')[1];

  expect(row().querySelector('.relic-stat').textContent.trim()).toContain('+3.0%');

  for (let i = 0; i < 15; i++) {
    plusButton().click();
    flushSync();
  }

  expect(row().querySelector('.relic-level-badge').textContent).toBe(`LV ${def.maxLevel}/${def.maxLevel}`);
  expect(row().querySelector('.relic-stat').textContent.trim()).toContain('+12.0%');
  expect(plusButton().disabled).toBe(true);
  cleanup();
});

it('Equip checkbox writes through to the store, and the equipped counter tracks the selected Set', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const row = [...target.querySelectorAll('.relic-row')].find((r) => r.textContent.includes('Basalt Guard'));
  row.querySelector('.equip-checkbox input').click();
  flushSync();

  expect(target.querySelector('.equip-readout').textContent).toContain(`1 / ${RELIC_EQUIP_CAP}`);
  expect(rosterStore.current.loadouts[0].relics.entries.find((e) => e.defId === 'basalt-guard').equipped).toBe(true);
  cleanup();
});

it('equipping past the cap shows an error and does not equip a 5th relic', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  const rows = [...target.querySelectorAll('.relic-row')];
  for (let i = 0; i < RELIC_EQUIP_CAP; i++) {
    rows[i].querySelector('.equip-checkbox input').click();
    flushSync();
  }
  expect(target.querySelector('.equip-error')).toBeNull();

  rows[RELIC_EQUIP_CAP].querySelector('.equip-checkbox input').click();
  flushSync();

  expect(target.querySelector('.equip-error')).not.toBeNull();
  // The store, not the raw checkbox DOM state, is the source of truth here -
  // a rejected onchange can leave the native checkbox visually toggled even
  // though the underlying value never changed (same as GlyphInventory).
  const equippedCount = rosterStore.current.loadouts[0].relics.entries.filter((e) => e.equipped).length;
  expect(equippedCount).toBe(RELIC_EQUIP_CAP);
  cleanup();
});

it('switching Set shows that loadout\'s independent relic state', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();

  [...target.querySelectorAll('.relic-row')].find((r) => r.textContent.includes('Basalt Guard')).querySelector('.equip-checkbox input').click();
  flushSync();
  expect(target.querySelector('.equip-readout').textContent).toContain('1 /');

  [...target.querySelectorAll('.set-card')][1].click(); // Set B
  flushSync();
  expect(target.querySelector('.equip-readout').textContent).toContain('0 /');
  const basaltCheckbox = [...target.querySelectorAll('.relic-row')].find((r) => r.textContent.includes('Basalt Guard')).querySelector('.equip-checkbox input');
  expect(basaltCheckbox.checked).toBe(false);
  cleanup();
});
