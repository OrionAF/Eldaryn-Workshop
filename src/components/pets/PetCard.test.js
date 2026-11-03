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
