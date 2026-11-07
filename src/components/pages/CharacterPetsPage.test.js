import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PetsScreen from './CharacterPetsPage.svelte';
import pageSource from './CharacterPetsPage.svelte?raw';
import { rosterStore } from '../../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  const id = rosterStore.addCharacter('Test', 'WARRIOR');
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PetsScreen, { target, props: {} });
  flushSync();
});
afterEach(() => {
  unmount(app);
  target.remove();
});

const btn = (label) => [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const byLabel = (text) => document.getElementById([...target.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(text))?.htmlFor);
const click = (el) => {
  el.click();
  flushSync();
};
const change = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};

it('starts empty (saying why old pets are gone), adds a core in edit mode, and names it by rarity', () => {
  expect(target.textContent).toContain('No Pet Cores yet');
  expect(target.textContent).toContain('2.9.1');
  change(byLabel('Core rarity to add'), 'Mythic');
  click(btn('+ Add core'));
  expect(rosterStore.current.pets.cores[0]).toMatchObject({ rarity: 'Mythic', baseAttack: 3850, baseHp: 9750 });
  expect(target.querySelectorAll('.pet-card')).toHaveLength(1);
  // the new core opens in the editor drawer; the card itself never grows into an editor
  expect(target.querySelector('.core-editor select')).not.toBeNull();
  expect(target.querySelector('.pet-card select')).toBeNull();
  click(btn('Done'));
  expect(target.querySelector('.core-editor')).toBeNull();
  expect(target.querySelector('.card-title').textContent).toBe('Mythic Core');
});

it('edits rarity, base stats and secondaries through the edit controls', () => {
  click(btn('+ Add core'));
  change(byLabel('Add secondary stat'), 'ATTACK_PERCENT');
  expect(rosterStore.current.pets.cores[0].secondaries[0].type).toBe('ATTACK_PERCENT');
  const base = byLabel('Base Attack');
  base.value = '200';
  base.dispatchEvent(new Event('input', { bubbles: true }));
  base.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();
  expect(rosterStore.current.pets.cores[0].baseAttack).toBe(200);
  change(byLabel('Rarity'), 'Rare');
  expect(rosterStore.current.pets.cores[0]).toMatchObject({ rarity: 'Rare', baseAttack: 730 });
  click(btn('Done'));
  expect(target.querySelector('.sec-line').textContent).toContain('+1.8%');
});

it('altar level steppers write the store', () => {
  click(target.querySelector('button[aria-label="Increase Altar level"]'));
  expect(rosterStore.current.pets.altar.level).toBe(2);
  expect(target.querySelector('input[aria-label="Altar level"]').value).toBe('2');
});

it('changing the tier asks first, names the cores and presets it will clear, then wipes', () => {
  click(btn('+ Add core'));
  const id = rosterStore.current.pets.cores[0].id;
  const presetName = rosterStore.current.presets[0].name;
  rosterStore.setPresetPet(rosterStore.current.presets[0].id, id);
  flushSync();
  change(byLabel('Core altar tier'), '2');
  click(btn('Change tier'));
  expect(rosterStore.current.pets.altar.tier).toBe(1);
  const dialog = document.querySelector('dialog');
  expect(dialog.textContent).toContain('Common Core');
  expect(dialog.textContent).toContain(presetName);
  click([...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Wipe collection'));
  expect(rosterStore.current.pets.altar.tier).toBe(2);
  expect(rosterStore.current.pets.cores).toHaveLength(0);
  expect(rosterStore.current.presets[0].petId).toBeNull();
});

it('the altar level can be typed into the stepper, and the slider follows', () => {
  const el = target.querySelector('input[aria-label="Altar level"]');
  el.value = '12';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.pets.altar.level).toBe(12);
  expect(target.querySelector('input[type="range"][aria-label="Core altar level"]').value).toBe('12');
});

// jsdom applies no layout, so the 1440 overflow fix (scrollWidth 1479) is guarded at the source: the grid carries
// no fixed max-width (auto-fill would count columns it cannot fit) and its wrapper may shrink and scrolls inside itself.
it('the pet grid cannot widen the page', () => {
  const css = pageSource.split('<style>')[1];
  const rule = (sel) => css.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  expect(rule('.pet-grid')).toContain('min-width: 0');
  expect(rule('.pet-grid')).not.toContain('max-width');
  expect(rule('.page')).toMatch(/min-width: 0/);
  expect(rule('.page')).toMatch(/overflow-x: auto/);
});

it('Used in sets a preset to the core, a second pick clears it, and the other preset is untouched', () => {
  click(btn('+ Add core'));
  const id = rosterStore.current.pets.cores[0].id;
  const [a, b] = rosterStore.current.presets;
  const pick = (n) => {
    target.querySelector('.pet-card button[aria-haspopup]').click();
    flushSync();
    target.querySelectorAll('.pet-card [role^="menuitem"]')[n].click();
    flushSync();
  };
  const menuText = () => target.querySelector('.pet-card button[aria-haspopup]').textContent;
  pick(0);
  expect(rosterStore.current.presets[0].petId).toBe(id);
  expect(rosterStore.current.presets[1].petId).toBe(b.petId);
  expect(menuText()).toContain(a.name);
  pick(0);
  expect(rosterStore.current.presets[0].petId).toBeNull();
  expect(menuText()).toContain('Used in: none');
});

it('Used in reassigns a preset that uses another core to this one', () => {
  click(btn('+ Add core'));
  click(btn('+ Add core'));
  const [c1, c2] = rosterStore.current.pets.cores.map((c) => c.id);
  const presetId = rosterStore.current.presets[0].id;
  rosterStore.setPresetPet(presetId, c2);
  target.querySelector('.pet-card button[aria-haspopup]').click();
  flushSync();
  target.querySelectorAll('.pet-card [role^="menuitem"]')[0].click();
  flushSync();
  expect(rosterStore.current.presets[0].petId).toBe(c1);
});

it('Show: Unused hides a core a preset uses, and Sort orders by rarity', () => {
  change(byLabel('Core rarity to add'), 'Common');
  click(btn('+ Add core'));
  change(byLabel('Core rarity to add'), 'Mythic');
  click(btn('+ Add core'));
  click(btn('Done'));
  const [common, mythic] = rosterStore.current.pets.cores;
  rosterStore.setPresetPet(rosterStore.current.presets[0].id, common.id);
  flushSync();
  expect(target.querySelectorAll('.pet-card')).toHaveLength(2);
  change(byLabel('Show'), 'unused');
  expect(target.querySelectorAll('.pet-card')).toHaveLength(1);
  expect(target.querySelector('.card-title').textContent).toBe('Mythic Core');
  change(byLabel('Show'), 'used');
  expect(target.querySelector('.card-title').textContent).toBe('Common Core');
  change(byLabel('Show'), 'all');
  change(byLabel('Sort'), 'rarity');
  expect([...target.querySelectorAll('.card-title')].map((e) => e.textContent)).toEqual(['Mythic Core', 'Common Core']);
  expect(mythic.id).not.toBe(common.id);
});

it('Duplicate (in the editor) adds a copy of the core and opens the copy', () => {
  click(btn('+ Add core'));
  click(btn('Duplicate'));
  const [a, b] = rosterStore.current.pets.cores;
  expect(rosterStore.current.pets.cores).toHaveLength(2);
  expect(b).toMatchObject({ rarity: a.rarity, baseAttack: a.baseAttack, baseHp: a.baseHp });
  expect(target.querySelectorAll('.pet-card.editing')).toHaveLength(1);
});
