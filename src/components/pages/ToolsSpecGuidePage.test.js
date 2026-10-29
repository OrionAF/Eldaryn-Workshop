import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ToolsSpecGuidePage from './ToolsSpecGuidePage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import baseline from '../../data/specBaseline.json';

let target;
let app;

beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Guide', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
});
afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

const open = () => {
  app = mount(ToolsSpecGuidePage, { target });
  flushSync();
};
const card = () => target.querySelector('[data-testid="stat-priority"]');
const mainStats = () => [...card().querySelector('.list.main').querySelectorAll('[data-stat]')].map((s) => s.dataset.stat);

it('opens on the active preset\'s spec with its priority card', () => {
  rosterStore.setTalentSetSpec(0, 'WARRIOR_DPS');
  open();
  expect(target.querySelector('select').value).toBe('WARRIOR_DPS');
  expect(card().querySelector('.title').textContent).toBe('Warrior · Arms');
  expect(card().querySelector('.list.main').dataset.list).toBe('damage');
  expect(mainStats()[0]).toBe('totalAttackSpeed');
  expect(target.querySelector('[data-testid="keep"]').textContent).toContain('Attack Speed');
  expect(target.querySelector('[data-testid="spec-guide-text"]').textContent).toMatch(/^Warrior · Arms: stat priority\nDamage: Attack Speed > /);
});

it('a tank card leads with survival; with no talent spec it opens on the class\'s first spec', () => {
  rosterStore.setTalentSetSpec(0, 'WARRIOR_TANK');
  open();
  expect(card().querySelector('.list.main').dataset.list).toBe('survival');
  unmount(app);
  rosterStore.addCharacter('No spec', 'NECROMANCER');
  open();
  expect(target.querySelector('select').value).toBe('NECROMANCER_DEATHLORD');
});

it('switching spec changes the card; the typical totals stay folded below', () => {
  rosterStore.setCharacterLevel(85);
  open();
  const select = target.querySelector('select');
  select.value = 'MYSTIC_MAGE';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(mainStats()).toContain('totalSpellDamage');
  expect(target.querySelector('[data-testid="ignore"]').textContent).toContain('no effect for Mystic');
  const totals = target.querySelector('details.totals');
  expect(totals.open).toBe(false);
  expect(totals.querySelectorAll('thead th')).toHaveLength(1 + baseline.levels.length);
  expect(totals.querySelector('thead th.own').textContent).toContain('80');
});
