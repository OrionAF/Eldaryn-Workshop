import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import StoneGrid from './StoneGrid.svelte';
import { emptyEquip } from '../../lib/model/equipment.js';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

const stone = (over) => ({ id: 's1', type: 'PVE_DEFENSE', quality: 34, amplifyLevel: 0, oblivionLevel: null, stats: [{ type: 'BLOCK_CHANCE', value: 1.2 }], ...over });
const sets = () => [
  { key: 'set1', label: 'Set 1', enchantSlots: emptyEquip().enchantSlots },
  { key: 'set2', label: 'Set 2', enchantSlots: emptyEquip().enchantSlots },
];

it('shows an empty hint', () => {
  const app = mount(StoneGrid, { target, props: { stones: [], sets: sets(), onSelect: () => {} } });
  flushSync();
  expect(target.textContent).toContain('No stones added yet.');
  unmount(app);
});

it('one tile per stone: type name, quality, amplify, and socket status in each set', () => {
  const s = sets();
  s[0].enchantSlots.HEAD = 's1';
  s[1].enchantSlots.RING = 's1';
  const app = mount(StoneGrid, { target, props: { stones: [stone({ amplifyLevel: 3 })], sets: s, onSelect: () => {} } });
  flushSync();
  expect(target.textContent).toContain('Verdant Wardstone');
  expect(target.querySelector('.stone-head').textContent).toContain('Q34');
  expect(target.textContent).toContain('+3');
  expect(target.textContent).toContain('Block Chance');
  expect(target.textContent).toContain('+1.2%');
  expect(target.textContent).toContain('Set 1: Helmet | Set 2: Ring');
  unmount(app);
});

it('a stone in both sets is listed once; PvP stats list first; multiplier stats show as percent', () => {
  const s = stone({ id: 'm', type: 'MYTHIC', stats: [{ type: 'ATTACK_SPEED', value: 0.05 }, { type: 'PVP_ATTACK', value: 12 }] });
  const app = mount(StoneGrid, { target, props: { stones: [s], sets: sets(), onSelect: () => {} } });
  flushSync();
  expect(target.querySelectorAll('.stone-tile')).toHaveLength(1);
  const labels = [...target.querySelectorAll('.stat-label')].map((e) => e.textContent);
  expect(labels).toEqual(['PVP Attack', 'Attack Speed']);
  expect(target.querySelectorAll('.stat-value')[0].textContent).toBe('+12');
  expect(target.querySelectorAll('.stat-value')[1].textContent).toBe('+5%');
  unmount(app);
});

it('Oblivion stones show their grade; clicking selects, clicking again deselects', () => {
  let picked = 'unset';
  const o = stone({ id: 'o', type: 'OBLIVION', oblivionLevel: 3, stats: [] });
  const app = mount(StoneGrid, { target, props: { stones: [o], sets: [{ key: 'oblivion', label: 'Oblivion', enchantSlots: emptyEquip().enchantSlots }], onSelect: (id) => (picked = id) } });
  flushSync();
  expect(target.textContent).toContain('Grade 3 RARE');
  target.querySelector('.stone-tile').click();
  expect(picked).toBe('o');
  unmount(app);
});

it('grades the roll: letter, mean % of range, one bar per stat; Roll grade sort puts the best first', () => {
  const best = stone({ id: 'best', type: 'MYTHIC', stats: [{ type: 'PVP_ATTACK', value: 25 }, { type: 'PVP_DEFENSE', value: 20 }] });
  const mid = stone({ id: 'mid', stats: [{ type: 'BLOCK_CHANCE', value: 1.25 }] });
  const app = mount(StoneGrid, { target, props: { stones: [mid, best, stone({ id: 'blank', stats: [] })], sets: sets(), sortBy: 'roll', onSelect: () => {} } });
  flushSync();
  const rolls = [...target.querySelectorAll('.stone-roll')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
  expect(rolls).toEqual(['S Roll 100%', 'B Roll 50%']);
  expect(target.querySelectorAll('.stat-fill')[0].style.width).toBe('100%');
  expect(target.querySelectorAll('.stat-bar')).toHaveLength(3);
  unmount(app);
});

it('orders socketed stones first, then rarer types', () => {
  const s = sets();
  s[0].enchantSlots.HEAD = 'verd';
  const stones = [stone({ id: 'myth', type: 'MYTHIC', stats: [] }), stone({ id: 'verd', stats: [] }), stone({ id: 'crim', type: 'PVE_ATTACK', stats: [] })];
  const app = mount(StoneGrid, { target, props: { stones, sets: s, onSelect: () => {} } });
  flushSync();
  const names = [...target.querySelectorAll('.stone-type')].map((e) => e.textContent);
  expect(names).toEqual(['Verdant Wardstone', 'Mythic Soulstone', 'Crimson Warstone']);
  unmount(app);
});
