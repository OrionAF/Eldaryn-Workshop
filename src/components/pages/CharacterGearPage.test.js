import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CharacterGearPage from './CharacterGearPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { field, setField } from '../gear/fieldKit.js';

let target;
beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Gear Page', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
});

const q = (label) => field(target, label);
const slotBtn = (s) => target.querySelector(`[data-slot="${s}"]`);
const change = setField;
const tab = (text) => [...target.querySelectorAll('[role="tab"]')].find((b) => b.textContent.trim().startsWith(text));
const press = (el) => {
  el.click();
  flushSync();
};
const button = (text) => [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

it('base realm: 9 slots, Set 1 / Set 2 tabs, editing writes to the selected set only', () => {
  const app = mount(CharacterGearPage, { target });
  flushSync();
  expect(target.querySelectorAll('.silhouette .slot')).toHaveLength(9);
  change(q('Rarity'), 'EPIC');
  change(q('Attack'), '1.500');
  expect(rosterStore.current.equipment.set1.items.WEAPON).toMatchObject({ rarity: 'EPIC', primaryStats: { attack: 1500, hp: 0 } });
  expect(rosterStore.current.equipment.set2.items.WEAPON).toBeNull();

  press(tab('Set 2'));
  press(slotBtn('RING'));
  change(q('Rarity'), 'RARE');
  expect(rosterStore.current.equipment.set2.items.RING.rarity).toBe('RARE');
  expect(rosterStore.current.equipment.set1.items.RING).toBeNull();
  unmount(app);
});

it('set tabs say which presets use them', () => {
  const app = mount(CharacterGearPage, { target });
  flushSync();
  expect(tab('Set 1').textContent).toContain('used by Preset 1');
  expect(tab('Set 2').textContent).toContain('used by Preset 2');
  unmount(app);
});

it('realm="oblivion": 12 slots, edits the Oblivion loadout and its own stone pool', () => {
  const app = mount(CharacterGearPage, { target, props: { realm: 'oblivion' } });
  flushSync();
  expect(target.querySelectorAll('.silhouette .slot')).toHaveLength(12);
  expect(tab('Set 1')).toBeUndefined();
  press(slotBtn('RIFT_CORE'));
  change(q('Rarity'), 'OBLIVION');
  change(q('Item level'), '400');
  expect(rosterStore.current.equipment.oblivion.items.RIFT_CORE).toMatchObject({ rarity: 'OBLIVION', itemLevel: 400 });
  press(tab('Enchant stones'));
  expect([...q('Stone type').options].map((o) => o.value)).toEqual(['OBLIVION']);
  unmount(app);
});

it('the Oblivion tab is locked with a reason until Oblivion is unlocked', () => {
  const app = mount(CharacterGearPage, { target });
  flushSync();
  const locked = tab('Oblivion');
  expect(locked.disabled || locked.getAttribute('aria-disabled') === 'true').toBe(true);
  expect(locked.title).toContain('Unlock Oblivion');
  rosterStore.setOblivionUnlocked(true);
  flushSync();
  press(tab('Oblivion'));
  expect(target.querySelectorAll('.silhouette .slot')).toHaveLength(12);
  expect(target.textContent).toContain('One loadout');
  unmount(app);
});

it('a stone can be added, socketed in both sets, and the Oblivion pool stays empty', () => {
  const app = mount(CharacterGearPage, { target });
  flushSync();
  const id = rosterStore.addEnchantStone('base', { type: 'PVE_ATTACK', quality: 60, stats: [] });
  flushSync();
  press(tab('Enchant stones'));
  press(target.querySelector('.stone-tile'));
  press(button('Socket in Set 1 Sword'));
  press(tab('Set 2'));
  // the selection survives the set switch: the pool is shared, so the same stone is still selected
  expect(target.querySelector('.stone-tile.selected')).not.toBeNull();
  press(button('Socket in Set 2 Sword'));
  const eq = rosterStore.current.equipment;
  expect(eq.set1.enchantSlots.WEAPON).toBe(id);
  expect(eq.set2.enchantSlots.WEAPON).toBe(id);
  expect(rosterStore.current.oblivionEnchantStones).toHaveLength(0);
  expect(target.querySelector('.stone-socketed').textContent).toBe('Set 1: Sword | Set 2: Sword');
  unmount(app);
});

it('the item panel footer shows the socketed stone and can unsocket it', () => {
  const id = rosterStore.addEnchantStone('base', { type: 'PVE_ATTACK', quality: 60, stats: [] });
  rosterStore.socketStone('set1', 'WEAPON', id);
  const app = mount(CharacterGearPage, { target });
  flushSync();
  expect(target.querySelector('.socket-line').textContent).toContain('socket:');
  press(button('Unsocket'));
  expect(rosterStore.current.equipment.set1.enchantSlots.WEAPON).toBeNull();
  unmount(app);
});

it('a stone can be switched off, which the grid marks as inactive', () => {
  const id = rosterStore.addEnchantStone('base', { type: 'PVE_ATTACK', quality: 60, stats: [] });
  const app = mount(CharacterGearPage, { target });
  flushSync();
  press(tab('Enchant stones'));
  press(target.querySelector('.stone-tile'));
  const box = [...target.querySelectorAll('input[type="checkbox"]')].find((c) => c.closest('label')?.textContent.includes('Activated'));
  expect(box.checked).toBe(true);
  press(box);
  expect(rosterStore.current.enchantStones.find((s) => s.id === id).activated).toBe(false);
  expect(target.querySelector('.stone-tile').textContent).toContain('Inactive');
  unmount(app);
});

it('the stone grid filters by type', () => {
  rosterStore.addEnchantStone('base', { type: 'PVE_ATTACK', quality: 60, stats: [] });
  rosterStore.addEnchantStone('base', { type: 'PVE_DEFENSE', quality: 40, stats: [] });
  const app = mount(CharacterGearPage, { target });
  flushSync();
  press(tab('Enchant stones'));
  expect(target.querySelectorAll('.stone-tile')).toHaveLength(2);
  const select = [...target.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent === 'All types'));
  change(select, 'PVE_ATTACK');
  expect(target.querySelectorAll('.stone-tile')).toHaveLength(1);
  unmount(app);
});

const stepBtn = (name) => target.querySelector(`button[aria-label="${name}"]`);
const key = (el, k) => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  flushSync();
};

it('Next / Previous slot step through the 9 base slots and wrap', () => {
  const app = mount(CharacterGearPage, { target });
  flushSync();
  // Weapon is the 6th slot in silhouette order.
  expect(target.textContent).toContain('Slot 6 of 9');
  for (let i = 0; i < 3; i++) press(stepBtn('Next slot'));
  expect(target.textContent).toContain('Slot 9 of 9');
  press(stepBtn('Next slot'));
  expect(target.textContent).toContain('Slot 1 of 9');
  press(stepBtn('Previous slot'));
  expect(target.textContent).toContain('Slot 9 of 9');
  unmount(app);
});

it('Oblivion realm cycles 12 slots', () => {
  const app = mount(CharacterGearPage, { target, props: { realm: 'oblivion' } });
  flushSync();
  const n = Number(/Slot (\d+) of 12/.exec(target.textContent)[1]);
  for (let i = n; i < 12; i++) press(stepBtn('Next slot'));
  expect(target.textContent).toContain('Slot 12 of 12');
  press(stepBtn('Next slot'));
  expect(target.textContent).toContain('Slot 1 of 12');
  press(stepBtn('Previous slot'));
  expect(target.textContent).toContain('Slot 12 of 12');
  unmount(app);
});

it('[ and ] step slots, but are ignored while typing in a field', () => {
  const app = mount(CharacterGearPage, { target });
  flushSync();
  key(target.querySelector('.layout'), ']');
  expect(target.textContent).toContain('Slot 7 of 9');
  key(target.querySelector('.layout'), '[');
  expect(target.textContent).toContain('Slot 6 of 9');
  key(q('Attack'), ']');
  expect(target.textContent).toContain('Slot 6 of 9');
  unmount(app);
});
