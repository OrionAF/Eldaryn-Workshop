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
const stats = () => [...target.querySelectorAll('[data-testid="spec-baseline"] tbody tr[data-stat]')].map((r) => r.dataset.stat);
const headers = () => [...target.querySelectorAll('[data-testid="spec-baseline"] thead th')].map((th) => th.textContent.trim());

it('opens on the active preset\'s spec with a column per level, the character\'s band highlighted', () => {
  rosterStore.setTalentSetSpec(0, 'WARRIOR_DPS');
  rosterStore.setCharacterLevel(85);
  open();
  expect(target.querySelector('select').value).toBe('WARRIOR_DPS');
  expect(headers()).toHaveLength(1 + baseline.levels.length);
  expect(stats().slice(0, 2)).toEqual(['totalAttack', 'totalHp']);
  const own = target.querySelectorAll('thead th.own');
  expect(own).toHaveLength(1);
  expect(own[0].textContent).toContain('80');
  expect(target.querySelector('[data-testid="spec-guide-text"]').textContent).toContain('Warrior · Arms: stat baseline (Damage build)');
});

it('a tank spec opens on Balanced; with no talent spec it opens on the class\'s first spec', () => {
  rosterStore.setTalentSetSpec(0, 'WARRIOR_TANK');
  open();
  expect(target.querySelector('[aria-pressed="true"]').textContent.trim()).toBe('Balanced');
  unmount(app);
  rosterStore.addCharacter('No spec', 'NECROMANCER');
  open();
  expect(target.querySelector('select').value).toBe('NECROMANCER_DEATHLORD');
});

it('switching spec and build changes the table', () => {
  open();
  const select = target.querySelector('select');
  select.value = 'MYSTIC_MAGE';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(stats()).toContain('totalSpellDamage');
  const damage = target.querySelector('[data-stat="totalSpellDamage"]').textContent;
  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Balanced').click();
  flushSync();
  expect(target.querySelector('[data-testid="spec-guide-text"]').textContent).toContain('(Balanced build)');
  expect(target.querySelector('[data-stat="totalSpellDamage"]').textContent).not.toBe(damage);
});
