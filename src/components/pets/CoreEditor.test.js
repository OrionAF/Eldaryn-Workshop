import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CoreEditor from './CoreEditor.svelte';
import { formatFlat } from '../../lib/format.js';

let target, app;
afterEach(() => {
  if (app) unmount(app);
  target?.remove();
});

const pet = { id: 'p', rarity: 'Legendary', baseAttack: 2350, baseHp: 6700, secondaries: [{ type: 'ATTACK_PERCENT', value: 10 }] };
const render = (props) => {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(CoreEditor, { target, props: { pet, types: ['ATTACK_PERCENT', 'HP_PERCENT'], ...props } });
  flushSync();
};

it('shows where each base roll sits in the rarity band, with the band ends as flat numbers', () => {
  render({});
  const meters = [...target.querySelectorAll('[role="meter"]')];
  expect(meters[0].textContent).toContain(formatFlat(2070));
  expect(meters[0].textContent).toContain(formatFlat(2530));
  expect(meters[0].getAttribute('aria-label')).toBe('Base Attack in the Legendary band');
});

it('reads a typed base roll as a flat number ("." is a thousands separator)', () => {
  const got = [];
  render({ onBase: (stat, v) => got.push([stat, v]) });
  const input = document.getElementById([...target.querySelectorAll('label')].find((l) => l.textContent === 'Base Attack').htmlFor);
  input.value = '2.400';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();
  expect(got).toEqual([['attack', 2400]]);
});

it('offers only the stats not already taken when adding a secondary', () => {
  render({});
  const add = document.getElementById([...target.querySelectorAll('label')].find((l) => l.textContent === 'Add secondary stat').htmlFor);
  expect([...add.options].map((o) => o.value)).toEqual(['', 'HP_PERCENT']);
});
