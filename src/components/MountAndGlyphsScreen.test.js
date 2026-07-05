import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import MountAndGlyphsScreen from './MountAndGlyphsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(MountAndGlyphsScreen, { target, props: {} });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
  for (const m of [...rosterStore.current.mounts.entries]) rosterStore.removeMount(m.id);
  for (const g of [...rosterStore.current.glyphs.entries]) rosterStore.removeMountGlyph(g.id);
});

it('renders both sections with no nested tabs', () => {
  expect(target.textContent).toContain('Mount & Glyphs');
  expect(target.textContent).toContain('Glyph Inventory');
  expect(target.querySelector('[role="tablist"]')).toBeNull();
});

it('adding a mount auto-rides the first one; a second does not steal Riding', () => {
  target.querySelectorAll('.add-form button')[0].click();
  flushSync();

  const nameInput = target.querySelector('input[aria-label="Mount name"]');
  nameInput.value = 'Crystal Beast';
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  [...target.querySelectorAll('.modal button')].find((b) => b.textContent.trim() === 'Add Mount').click();
  flushSync();

  expect(rosterStore.current.mounts.entries.length).toBe(1);
  expect(rosterStore.current.mounts.activeId).toBe(rosterStore.current.mounts.entries[0].id);
});

it('Add Mount modal sets base HP%/ATK% at creation time', () => {
  target.querySelectorAll('.add-form button')[0].click();
  flushSync();

  const nameInput = target.querySelector('input[aria-label="Mount name"]');
  nameInput.value = 'Crystal Beast';
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));

  const [hpInput, atkInput] = [...target.querySelectorAll('.modal .base-stat input')];
  hpInput.value = '12';
  hpInput.dispatchEvent(new Event('input', { bubbles: true }));
  atkInput.value = '8';
  atkInput.dispatchEvent(new Event('input', { bubbles: true }));

  [...target.querySelectorAll('.modal button')].find((b) => b.textContent.trim() === 'Add Mount').click();
  flushSync();

  const mount = rosterStore.current.mounts.entries.find((m) => m.name === 'Crystal Beast');
  expect(mount.baseHpPct).toBe(12);
  expect(mount.baseAtkPct).toBe(8);
});

it('editing Base HP%/ATK% writes through rosterStore.updateMount', () => {
  const id = rosterStore.addMount('Beast', 'Rare');
  flushSync();
  const hpInput = [...target.querySelectorAll('.base-stat input')][0];
  hpInput.value = '19';
  hpInput.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.mounts.entries.find((m) => m.id === id).baseHpPct).toBe(19);
});

it('saving a glyph to inventory and socketing it enforces the tier cap', () => {
  const addGlyphBtn = target.querySelectorAll('.add-form button')[1];
  for (let i = 0; i < 4; i++) {
    addGlyphBtn.click();
    flushSync();
  }
  expect(rosterStore.current.glyphs.entries.length).toBe(4);

  const checkboxes = () => [...target.querySelectorAll('input[type="checkbox"]')];
  checkboxes()[0].click();
  flushSync();
  checkboxes()[1].click();
  flushSync();
  checkboxes()[2].click();
  flushSync();
  expect(rosterStore.current.glyphs.entries.filter((g) => g.equipped).length).toBe(3); // Minor cap is 3

  checkboxes()[3].click(); // 4th minor - rejected
  flushSync();
  expect(rosterStore.current.glyphs.entries.filter((g) => g.equipped).length).toBe(3);
  expect(target.querySelector('.glyph-error')).not.toBeNull();
});
