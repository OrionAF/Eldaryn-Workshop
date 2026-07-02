import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import GlyphInventory from './GlyphInventory.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  for (const g of [...rosterStore.current.sources.mountGlyphs.entries]) rosterStore.removeMountGlyph(g.id);
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(GlyphInventory, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('add-form fields are labeled for assistive tech, and the value input uses a decimal keyboard on mobile', () => {
  expect(target.querySelector('.add-form select[aria-label="Tier"]')).not.toBeNull();
  expect(target.querySelector('.add-form select[aria-label="Stat"]')).not.toBeNull();
  const valueInput = target.querySelector('.add-form input[aria-label="Value"]');
  expect(valueInput).not.toBeNull();
  expect(valueInput.inputMode).toBe('decimal');
  cleanup();
});

it('adds a glyph via the form with tier/stat/value, labeled like the in-game card', () => {
  const [tierSelect, statSelect] = target.querySelectorAll('.add-form select');
  tierSelect.value = 'minor';
  tierSelect.dispatchEvent(new Event('change', { bubbles: true }));
  statSelect.value = 'attack_pct';
  statSelect.dispatchEvent(new Event('change', { bubbles: true }));
  const valueInput = target.querySelector('.add-form input[type="text"]');
  valueInput.value = '4.1';
  valueInput.dispatchEvent(new Event('input', { bubbles: true }));
  target.querySelector('.add-form button').click();
  flushSync();

  expect(rosterStore.current.sources.mountGlyphs.entries.length).toBe(1);
  const glyph = rosterStore.current.sources.mountGlyphs.entries[0];
  expect(glyph.tier).toBe('minor');
  expect(glyph.statKey).toBe('attack_pct');
  expect(glyph.value).toBe(4.1);
  expect(target.querySelector('.glyph-label').textContent).toContain('Minor - +4.1% Attack %');
  cleanup();
});

it('equip checkbox toggles equipped and updates the tier counter', () => {
  const id = rosterStore.addMountGlyph('minor', 'attack_pct', 4.1);
  flushSync();

  expect(target.textContent).toContain('Minor: 0/3 equipped');
  target.querySelector('.equip-checkbox input').click();
  flushSync();

  expect(rosterStore.current.sources.mountGlyphs.entries.find((g) => g.id === id).equipped).toBe(true);
  expect(target.textContent).toContain('Minor: 1/3 equipped');
  cleanup();
});

it('equipping past the tier cap is rejected with a visible error, and the checkbox reverts', () => {
  rosterStore.addMountGlyph('mythic', 'crit', 5);
  const secondId = rosterStore.addMountGlyph('mythic', 'crit', 6);
  rosterStore.setGlyphEquipped(rosterStore.current.sources.mountGlyphs.entries[0].id, true); // fill the 1-slot Mythic cap
  flushSync();

  const rows = [...target.querySelectorAll('.entry-list li')];
  const secondRow = rows.find((r) => r.textContent.includes('+6%'));
  secondRow.querySelector('.equip-checkbox input').click();
  flushSync();

  expect(target.querySelector('.equip-error')).not.toBeNull();
  expect(target.querySelector('.equip-error').textContent).toContain('Mythic');
  expect(rosterStore.current.sources.mountGlyphs.entries.find((g) => g.id === secondId).equipped).toBe(false);
  cleanup();
});

it('Remove requires a second click (Confirm remove) before it deletes the glyph', () => {
  const id = rosterStore.addMountGlyph('major', 'speed', 25);
  flushSync();
  const row = target.querySelector('.entry-list li');
  [...row.querySelectorAll('button')].find((b) => b.textContent === 'Remove').click();
  flushSync();

  expect(rosterStore.current.sources.mountGlyphs.entries.some((g) => g.id === id)).toBe(true);
  [...row.querySelectorAll('button')].find((b) => b.textContent === 'Confirm remove').click();
  flushSync();
  expect(rosterStore.current.sources.mountGlyphs.entries.some((g) => g.id === id)).toBe(false);
  cleanup();
});
