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
  for (const m of [...rosterStore.current.mounts.entries]) {
    rosterStore.updateMount(m.id, 'baseHpPct', 0);
    rosterStore.updateMount(m.id, 'baseAtkPct', 0);
  }
  for (const g of [...rosterStore.current.glyphs.entries]) rosterStore.removeMountGlyph(g.id);
});

it('renders both sections with no nested tabs', () => {
  expect(target.textContent).toContain('Mount & Glyphs');
  expect(target.textContent).toContain('Glyph Inventory');
  expect(target.querySelector('[role="tablist"]')).toBeNull();
});

it('lists the full fixed mount catalogue with name and rarity - stats entry only, no add/remove/riding controls', () => {
  const rows = [...target.querySelectorAll('.mounts-section .entry-list li')];
  expect(rows.length).toBe(11); // the full catalogue, nothing else
  expect(target.textContent).toContain('Night Wolf');
  expect(target.textContent).toContain('Crystal Drake');
  expect(target.textContent).toContain('Scorpion Hound');
  expect(target.querySelector('.mounts-section .btn-gold')).toBeNull(); // no Add Mount
  expect([...target.querySelectorAll('.mounts-section button')].length).toBe(0); // no Remove either
  expect(target.querySelector('.mounts-section input[type="radio"]')).toBeNull(); // Riding moved to the Presets editor
});

it('editing a catalogue mount\'s Base HP%/ATK% writes through rosterStore.updateMount', () => {
  const crystalBeastRow = [...target.querySelectorAll('.mounts-section .entry-list li')].find((li) =>
    li.textContent.includes('Crystal Beast')
  );
  const [hpInput, atkInput] = [...crystalBeastRow.querySelectorAll('.base-stat input')];
  hpInput.value = '19';
  hpInput.dispatchEvent(new Event('blur', { bubbles: true }));
  atkInput.value = '10';
  atkInput.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  const mount = rosterStore.current.mounts.entries.find((m) => m.id === 'crystal_beast');
  expect(mount.baseHpPct).toBe(19);
  expect(mount.baseAtkPct).toBe(10);
});

it('saving a glyph to inventory and socketing it enforces the tier cap', () => {
  const addGlyphBtn = target.querySelectorAll('.add-form button')[0];
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

it('adds a glyph with the selected rarity, and a Major-tier special Ember Curse glyph without a value field', () => {
  const selects = () => [...target.querySelectorAll('.glyphs-section .add-form select')];
  const [tierSelect, raritySelect, statSelect] = selects();

  raritySelect.value = 'Epic';
  raritySelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  target.querySelectorAll('.add-form button')[0].click();
  flushSync();
  expect(rosterStore.current.glyphs.entries[0]).toMatchObject({ rarity: 'Epic', special: null });

  // The special option only exists on the Major tier.
  expect([...statSelect.options].some((o) => o.value === 'special:ember-curse-glyph')).toBe(false);
  tierSelect.value = 'major';
  tierSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect([...statSelect.options].some((o) => o.value === 'special:ember-curse-glyph')).toBe(true);

  statSelect.value = 'special:ember-curse-glyph';
  statSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(target.querySelector('.glyphs-section .add-form input[aria-label="Value"]')).toBeNull();
  target.querySelectorAll('.add-form button')[0].click();
  flushSync();

  const special = rosterStore.current.glyphs.entries[1];
  expect(special).toMatchObject({ tier: 'major', special: 'ember-curse-glyph' });
  expect(target.textContent).toContain('Ember Curse');
  expect(target.textContent).toContain('stacks up to 1 more time');
});
