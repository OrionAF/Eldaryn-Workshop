import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import EnemyPicker from './EnemyPicker.svelte';

let target, app;
afterEach(() => {
  unmount(app);
  target.remove();
});
const render = (props) => {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(EnemyPicker, { target, props });
  flushSync();
};

const raidSelect = () => {
  const label = [...target.querySelectorAll('label')].find((l) => l.textContent === 'Village raid');
  return document.getElementById(label.htmlFor);
};

it('the raid select lists all five village raids by name and emits a raid spec', () => {
  const got = [];
  render({ value: { kind: 'raid', id: 'raid_1', step: 1 }, onchange: (s) => got.push(s) });
  const sel = raidSelect();
  expect([...sel.options].map((o) => o.textContent)).toEqual(
    ['Bandit Village', 'Fortified Stronghold', 'Royal Garrison', 'Shadow Enclave', 'Obsidian Citadel'],
  );
  sel.value = 'raid_3';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(got.at(-1)).toEqual({ kind: 'raid', id: 'raid_3', step: 1 });
});

it('marks raids above the character level', () => {
  render({ value: { kind: 'raid', id: 'raid_1', step: 1 }, playerLevel: 5, onchange: () => {} });
  expect(raidSelect().options[0].textContent).toBe('Bandit Village (needs level 10)');
});
