import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PetCard from './PetCard.svelte';
import { calculateCoreBonuses } from '../../lib/engine/sources/petCore.js';
import { petSecondaryValue } from '../../lib/engine/sources/pet.js';
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
  app = mount(PetCard, { target, props: { pet, types: [], usedBy: [], ...props } });
  flushSync();
};

it('shows the altar-scaled ATK/HP and secondaries from the engine core source', () => {
  render({ altarLevel: 30, altarTier: 2 });
  const b = calculateCoreBonuses(pet, 30, 2);
  const text = target.querySelector('[data-testid="pet-preview"]').textContent;
  expect(text).toContain(formatFlat(b.flatAttack));
  expect(text).toContain(formatFlat(b.flatHp));
  expect(target.querySelector('.sec-line').textContent).toContain(`+${petSecondaryValue(10, 30).toFixed(1)}%`);
  expect(target.querySelector('.card-title').textContent).toBe('Legendary Core');
});

it('shows base values only when no altar is passed', () => {
  render({});
  expect(target.querySelector('[data-testid="pet-preview"]')).toBeNull();
  expect(target.querySelector('.scaled')).toBeNull();
  expect(target.querySelector('.base-stats').textContent).toContain(formatFlat(2350));
});

it('edit mode hints the rarity band of the base rolls', () => {
  render({ editing: true });
  expect(target.querySelector('.hint').textContent).toContain(`${formatFlat(2070)}-${formatFlat(2530)}`);
});

it('Used in lists every preset, checks the ones using this core, and reports the picked preset id', () => {
  const picked = [];
  const presets = [{ id: 'a', name: 'PvP', petId: 'p' }, { id: 'b', name: 'PvE', petId: 'other' }, { id: 'c', name: 'Spare', petId: null }];
  render({ presets, onUse: (id) => picked.push(id) });
  target.querySelector('button[aria-haspopup]').click();
  flushSync();
  const items = [...target.querySelectorAll('[role^="menuitem"]')];
  expect(items.map((i) => i.textContent)).toEqual([expect.stringContaining('PvP'), expect.stringContaining('PvE'), expect.stringContaining('Spare')]);
  expect(items[0].getAttribute('aria-checked')).toBe('true');
  expect(items[1].getAttribute('aria-checked')).toBe('false');
  expect(items[1].textContent).toContain('uses another');
  items[2].click();
  flushSync();
  expect(picked).toEqual(['c']);
});

it('Used in with no presets renders "none" and an empty menu without crashing', () => {
  render({});
  const btn = target.querySelector('button[aria-haspopup]');
  expect(btn.textContent).toContain('Used in: none');
  btn.click();
  flushSync();
  expect(target.querySelectorAll('[role^="menuitem"]').length).toBe(0);
});

it('the Used in button summarises the presets using this core', () => {
  render({ presets: [{ id: 'a', name: 'PvP', petId: 'p' }, { id: 'b', name: 'PvE', petId: 'other' }] });
  expect(target.querySelector('button[aria-haspopup]').textContent).toContain('Used in: PvP');
  expect(target.querySelector('button[aria-haspopup]').textContent).not.toContain('PvE');
});
