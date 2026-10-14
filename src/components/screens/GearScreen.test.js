import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import GearScreen from './GearScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';

let target;
beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Gear Screen', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
});

const q = (label) => target.querySelector(`[aria-label="${label}"]`);
const slotBtn = (s) => target.querySelector(`[data-slot="${s}"]`);
function change(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}
const chip = (text) => [...target.querySelectorAll('.chip')].find((b) => b.textContent.trim() === text);

it('base realm: 9 slots, Set 1 / Set 2 chips, editing writes to the selected set only', () => {
  const app = mount(GearScreen, { target });
  flushSync();
  expect(target.querySelectorAll('.silhouette .slot')).toHaveLength(9);
  change(q('Rarity'), 'EPIC');
  change(q('Attack'), '1.500');
  expect(rosterStore.current.equipment.set1.items.WEAPON).toMatchObject({ rarity: 'EPIC', primaryStats: { attack: 1500, hp: 0 } });
  expect(rosterStore.current.equipment.set2.items.WEAPON).toBeNull();

  chip('Set 2').click();
  flushSync();
  slotBtn('RING').click();
  flushSync();
  change(q('Rarity'), 'RARE');
  expect(rosterStore.current.equipment.set2.items.RING.rarity).toBe('RARE');
  expect(rosterStore.current.equipment.set1.items.RING).toBeNull();
  unmount(app);
});

it('realm="oblivion": 12 slots, edits the Oblivion loadout and its own stone pool', () => {
  const app = mount(GearScreen, { target, props: { realm: 'oblivion' } });
  flushSync();
  expect(target.querySelectorAll('.silhouette .slot')).toHaveLength(12);
  expect(chip('Set 1')).toBeUndefined();
  slotBtn('RIFT_CORE').click();
  flushSync();
  change(q('Rarity'), 'OBLIVION');
  change(q('Item level'), '400');
  expect(rosterStore.current.equipment.oblivion.items.RIFT_CORE).toMatchObject({ rarity: 'OBLIVION', itemLevel: 400 });
  expect([...q('Stone type').options].map((o) => o.value)).toEqual(['OBLIVION']);
  unmount(app);
});

it('without a realm prop an Oblivion-unlocked character gets a realm toggle', () => {
  const app = mount(GearScreen, { target });
  flushSync();
  expect(chip('Oblivion')).toBeUndefined();
  rosterStore.setOblivionUnlocked(true);
  flushSync();
  chip('Oblivion').click();
  flushSync();
  expect(target.querySelectorAll('.silhouette .slot')).toHaveLength(12);
  expect(target.querySelector('h2').textContent).toBe('Oblivion Gear');
  unmount(app);
});

it('a stone can be added, socketed in both sets, and the Oblivion pool stays empty', () => {
  const app = mount(GearScreen, { target });
  flushSync();
  const id = rosterStore.addEnchantStone('base', { type: 'PVE_ATTACK', quality: 60, stats: [] });
  flushSync();
  target.querySelector('.stone-tile').click();
  flushSync();
  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Socket in Set 1 Sword').click();
  flushSync();
  chip('Set 2').click();
  flushSync();
  target.querySelector('.stone-tile').click();
  flushSync();
  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Socket in Set 2 Sword').click();
  flushSync();
  const eq = rosterStore.current.equipment;
  expect(eq.set1.enchantSlots.WEAPON).toBe(id);
  expect(eq.set2.enchantSlots.WEAPON).toBe(id);
  expect(rosterStore.current.oblivionEnchantStones).toHaveLength(0);
  expect(target.querySelector('.stone-socketed').textContent).toBe('Set 1: Sword | Set 2: Sword');
  unmount(app);
});

it('shows which presets use the selected set', () => {
  const app = mount(GearScreen, { target });
  flushSync();
  expect(target.querySelector('.used-by').textContent).toContain('Set 1 is used by');
  unmount(app);
});
