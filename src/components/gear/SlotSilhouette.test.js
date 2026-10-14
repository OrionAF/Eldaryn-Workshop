import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SlotSilhouette from './SlotSilhouette.svelte';
import { defaultEquipment } from '../../lib/model/equipment.js';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

const { equipment } = defaultEquipment();
const slots = () => [...target.querySelectorAll('button')].map((b) => b.dataset.slot);

it('renders 9 slots for the base realm and 12 for Oblivion', () => {
  let app = mount(SlotSilhouette, { target, props: { items: equipment.set1.items, selectedSlot: 'CHEST', onSelect: () => {} } });
  flushSync();
  expect(slots()).toHaveLength(9);
  expect(slots()).not.toContain('BELT');
  unmount(app);
  target.innerHTML = '';
  app = mount(SlotSilhouette, { target, props: { items: equipment.oblivion.items, realm: 'oblivion', selectedSlot: 'BELT', onSelect: () => {} } });
  flushSync();
  expect(slots()).toHaveLength(12);
  expect(slots()).toEqual(expect.arrayContaining(['BELT', 'GLOVES', 'RIFT_CORE']));
  expect(target.querySelector('[data-slot="BELT"]').getAttribute('aria-pressed')).toBe('true');
  unmount(app);
});

it('uses class weapon names, marks filled slots and reports selection', () => {
  let picked = null;
  const items = { ...equipment.set1.items, WEAPON: { rarity: 'EPIC', itemLevel: 42, quality: null, primaryStats: { attack: 1, hp: 1 }, secondaryStats: [], conduit: null } };
  const app = mount(SlotSilhouette, { target, props: { items, cls: 'MYSTIC', selectedSlot: 'HEAD', onSelect: (s) => (picked = s) } });
  flushSync();
  const weapon = target.querySelector('[data-slot="WEAPON"]');
  expect(weapon.textContent).toContain('Staff');
  expect(weapon.textContent).toContain('42');
  expect(weapon.classList.contains('filled')).toBe(true);
  expect(target.querySelector('[data-slot="HEAD"]').classList.contains('filled')).toBe(false);
  weapon.click();
  expect(picked).toBe('WEAPON');
  unmount(app);
});

it('shows a stone dot for a socketed slot', () => {
  const app = mount(SlotSilhouette, {
    target,
    props: { items: equipment.set1.items, selectedSlot: 'HEAD', onSelect: () => {}, stoneColors: { RING: 'var(--stone-azure)' } },
  });
  flushSync();
  expect(target.querySelector('[data-slot="RING"] .stone-dot')).not.toBeNull();
  expect(target.querySelector('[data-slot="HEAD"] .stone-dot')).toBeNull();
  unmount(app);
});
