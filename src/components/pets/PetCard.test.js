import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PetCard from './PetCard.svelte';
import { petFlatAttack, petFlatHp, petSecondaryValue } from '../../lib/engine/sources/pet.js';
import { petSpeciesById } from '../../lib/game/pets.js';
import { formatFlat } from '../../lib/format.js';

let target, app;
afterEach(() => {
  if (app) unmount(app);
  target?.remove();
});

const pet = { id: 'p', species: 'INFERNAL_DRAKE', rarity: 'Legendary', secondaries: [{ type: 'ATTACK_PERCENT', value: 10 }] };
const render = (props) => {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PetCard, { target, props: { pet, species: [], types: [], usedBy: [], ...props } });
  flushSync();
};

it('shows the altar-scaled ATK/HP and secondaries from the engine pet source', () => {
  render({ altarLevel: 30, altarTier: 2 });
  const def = petSpeciesById('INFERNAL_DRAKE');
  const text = target.querySelector('[data-testid="pet-preview"]').textContent;
  expect(text).toContain(formatFlat(petFlatAttack(def.baseAttack, 30, 2)));
  expect(text).toContain(formatFlat(petFlatHp(def.baseHp, 30, 2)));
  expect(target.querySelector('.sec-line').textContent).toContain(`+${petSecondaryValue(10, 30).toFixed(1)}%`);
});

it('shows base values only when no altar is passed', () => {
  render({});
  expect(target.querySelector('[data-testid="pet-preview"]')).toBeNull();
  expect(target.querySelector('.scaled')).toBeNull();
});
