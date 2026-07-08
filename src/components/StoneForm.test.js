import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import StoneForm from './StoneForm.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app, selectedStoneId;

function renderForm({ loadoutIndex = 0, selectedSlot = 'Weapon', selectedStoneId: sid = null } = {}) {
  selectedStoneId = sid;
  app = mount(StoneForm, {
    target,
    props: {
      character: rosterStore.current,
      loadoutIndex,
      selectedSlot,
      selectedStoneId,
      onDeselect: () => (selectedStoneId = null),
    },
  });
  flushSync();
}

beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  unmount(app);
  target.remove();
  for (const s of [...rosterStore.current.stoneInventory]) rosterStore.removeStone(s.id);
});

it('Add mode: Verdant defaults to two free dropdowns, no PVP rows', () => {
  renderForm();
  expect(target.textContent).toContain('Add Stones to Inventory');
  expect(target.querySelectorAll('select[aria-label^="Bonus stat"]').length).toBe(2);
  expect(target.querySelector('input[aria-label="PVP Attack value"]')).toBeNull();
  expect(target.querySelector('select[aria-label="PVP stat"]')).toBeNull();
});

it('Add mode: switching to Eldaryn shows two fixed (blank) PVP value inputs and exactly one free dropdown', () => {
  renderForm();
  const typeSelect = target.querySelector('select[aria-label="Stone type"]');
  typeSelect.value = 'eldaryn';
  typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(target.querySelector('input[aria-label="PVP Attack value"]')).not.toBeNull();
  expect(target.querySelector('input[aria-label="PVP Defense value"]')).not.toBeNull();
  expect(target.querySelector('input[aria-label="PVP Attack value"]').value).toBe('');
  expect(target.querySelectorAll('select[aria-label^="Bonus stat"]').length).toBe(1);
});

it('Add mode: switching to Azure shows a PVP-Attack-or-Defense picker and one free dropdown', () => {
  renderForm();
  const typeSelect = target.querySelector('select[aria-label="Stone type"]');
  typeSelect.value = 'azure';
  typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  const pvpStatSelect = target.querySelector('select[aria-label="PVP stat"]');
  expect(pvpStatSelect).not.toBeNull();
  expect([...pvpStatSelect.options].map((o) => o.value)).toEqual(['pvp_attack', 'pvp_defense']);
  expect(target.querySelectorAll('select[aria-label^="Bonus stat"]').length).toBe(1);
});

it('Add mode: free dropdowns never offer flat Attack/Health but do offer their % variants', () => {
  renderForm();
  for (const select of target.querySelectorAll('select[aria-label^="Bonus stat"]')) {
    const labels = [...select.options].map((o) => o.textContent);
    for (const core of ['Attack', 'Health']) expect(labels).not.toContain(core);
    for (const pct of ['Attack %', 'Health %']) expect(labels).toContain(pct);
  }
});

it('Add mode: the second free dropdown excludes whatever the first one already picked', () => {
  renderForm();
  const [first, second] = target.querySelectorAll('select[aria-label^="Bonus stat"]');
  first.value = 'crit';
  first.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  const secondOptions = [...target.querySelectorAll('select[aria-label^="Bonus stat"]')][1];
  expect([...secondOptions.options].some((o) => o.value === 'crit')).toBe(false);
});

it('Add to Inventory is disabled until every free dropdown has a selection, then creates the stone', () => {
  renderForm();
  const addBtn = [...target.querySelectorAll('button')].find((b) => b.textContent === 'Add to Inventory');
  expect(addBtn.disabled).toBe(true);

  const [first, second] = target.querySelectorAll('select[aria-label^="Bonus stat"]');
  first.value = 'crit';
  first.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(addBtn.disabled).toBe(true); // second still unset

  second.value = 'lifesteal';
  second.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(addBtn.disabled).toBe(false);

  const qualityInput = target.querySelector('input[aria-label="Quality"]');
  qualityInput.value = '34';
  qualityInput.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  addBtn.click();
  flushSync();

  expect(rosterStore.current.stoneInventory.length).toBe(1);
  const stone = rosterStore.current.stoneInventory[0];
  expect(stone.type).toBe('verdant');
  expect(stone.quality).toBe(34);
  expect(stone.rolledKeys.sort()).toEqual(['crit', 'lifesteal'].sort());
});

it('Details mode: selecting a stone shows Save/Socket Stone/Remove and locks type/rolled stats to read-only labels', () => {
  const id = rosterStore.addStone({ type: 'crimson', quality: 10, rolledKeys: ['crit', 'lifesteal'], stats: { crit: 5, lifesteal: 2 } });
  renderForm({ selectedStoneId: id });

  expect(target.textContent).toContain('Crimson Warstone');
  expect(target.querySelector('select[aria-label="Stone type"]')).toBeNull(); // no type dropdown in Details mode
  const buttons = [...target.querySelectorAll('button')].map((b) => b.textContent);
  expect(buttons).toContain('Save');
  expect(buttons).toContain('Socket Stone');
  expect(buttons).toContain('Remove');
  expect(target.textContent).toContain('Click this stone again in the inventory to unselect it and add a new stone.');
});

it('Details mode: Save only updates quality/values, never rolledKeys/type', () => {
  const id = rosterStore.addStone({ type: 'crimson', quality: 10, rolledKeys: ['crit'], stats: { crit: 5 } });
  renderForm({ selectedStoneId: id });

  const qualityInput = target.querySelector('input[aria-label="Quality"]');
  qualityInput.value = '20';
  qualityInput.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  const critInput = target.querySelector('input[aria-label="Critical %"]');
  critInput.value = '9.5';
  critInput.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  [...target.querySelectorAll('button')].find((b) => b.textContent === 'Save').click();
  flushSync();

  const stone = rosterStore.current.stoneInventory.find((s) => s.id === id);
  expect(stone.quality).toBe(20);
  expect(stone.stats.crit).toBe(9.5);
  expect(stone.rolledKeys).toEqual(['crit']);
  expect(stone.type).toBe('crimson');
});

it('Details mode: Socket Stone sockets into the currently selected slot, then the button flips to Unsocket', () => {
  const id = rosterStore.addStone({ type: 'verdant', quality: 1, rolledKeys: ['crit'], stats: { crit: 1 } });
  renderForm({ selectedStoneId: id, selectedSlot: 'Chest' });

  [...target.querySelectorAll('button')].find((b) => b.textContent === 'Socket Stone').click();
  flushSync();
  expect(rosterStore.current.loadouts[0].socketedStones.Chest).toBe(id);

  unmount(app);
  renderForm({ selectedStoneId: id, selectedSlot: 'Chest' });
  const toggled = [...target.querySelectorAll('button')].find((b) => b.textContent === 'Unsocket');
  expect(toggled).not.toBeUndefined();
  toggled.click();
  flushSync();
  expect(rosterStore.current.loadouts[0].socketedStones.Chest).toBe(null);
});

it('Details mode: Remove deletes the stone and calls onDeselect', () => {
  const id = rosterStore.addStone({ type: 'verdant', quality: 1, rolledKeys: [], stats: {} });
  renderForm({ selectedStoneId: id });

  const removeBtn = [...target.querySelectorAll('button')].find((b) => b.textContent === 'Remove');
  removeBtn.click();
  flushSync();
  const confirmBtn = [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Confirm remove'));
  confirmBtn.click();
  flushSync();

  expect(rosterStore.current.stoneInventory.some((s) => s.id === id)).toBe(false);
  expect(selectedStoneId).toBe(null);
});
