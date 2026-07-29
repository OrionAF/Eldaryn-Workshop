import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import MountAndGlyphsScreen from './MountAndGlyphsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { MOUNT_DEFS } from '../lib/mountsData.js';

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
  // rosterStore is a module singleton: reset the character-wide state this
  // screen writes, or it leaks into the next test.
  for (const g of [...rosterStore.current.glyphs.entries]) rosterStore.removeMountGlyph(g.id);
  for (const m of rosterStore.current.mounts.entries) rosterStore.setMountStar(m.id, 0);
});

const cards = () => [...target.querySelectorAll('.mount-card')];
const cardFor = (name) => cards().find((c) => c.textContent.includes(name));
const starsIn = (card) => [...card.querySelectorAll('.star')];
const mountState = (id) => rosterStore.current.mounts.entries.find((m) => m.id === id);

function addMinorGlyph(value = '4') {
  const form = target.querySelector('.add-form');
  const valueInput = form.querySelector('input[aria-label="Glyph value"]');
  valueInput.value = value;
  valueInput.dispatchEvent(new Event('input', { bubbles: true }));
  [...form.querySelectorAll('button')].find((b) => b.textContent.includes('Add to Inventory')).click();
  flushSync();
}

function openGlyphPicker(name) {
  [...cardFor(name).querySelectorAll('button')].find((b) => b.textContent.trim() === 'Glyphs').click();
  flushSync();
}

it('renders both sections', () => {
  expect(target.textContent).toContain('Mounts & Glyphs');
  expect(target.textContent).toContain('Glyph Inventory');
});

it('lists the full fixed mount catalogue as cards - no add/remove/riding controls', () => {
  expect(cards().length).toBe(MOUNT_DEFS.length);
  expect(target.textContent).toContain('Night Wolf');
  // Riding is chosen in the Presets editor, not here.
  expect(target.querySelector('.mount-card input[type="radio"]')).toBeNull();
  expect(target.querySelector('.mount-card input[type="checkbox"]')).toBeNull();
});

it('every mount shows 5 stars, locking the ones with no catalogue data', () => {
  // Common/Uncommon/Rare have 1-2 star data; the two Epics have 1-3.
  const common = cardFor('Night Wolf');
  expect(starsIn(common).length).toBe(5);
  expect(starsIn(common).filter((s) => s.classList.contains('locked')).length).toBe(3);

  const epic = cardFor('Storm Roc');
  expect(starsIn(epic).length).toBe(5);
  expect(starsIn(epic).filter((s) => s.classList.contains('locked')).length).toBe(2);
});

it('a mount is unowned until a star is picked, and picking one reveals the sliders', () => {
  const card = cardFor('Crystal Beast');
  expect(card.textContent).toContain('not owned');
  expect(card.querySelectorAll('input[type="range"]').length).toBe(0);

  starsIn(card)[0].click();
  flushSync();

  const owned = cardFor('Crystal Beast');
  expect(owned.textContent).not.toContain('not owned');
  expect(mountState('crystal_beast').star).toBe(1);
  expect(owned.querySelectorAll('input[type="range"]').length).toBe(2);
  expect(owned.textContent).toContain('Health:');
  expect(owned.textContent).toContain('Attack:');
});

it('clicking the lit first star un-owns the mount again', () => {
  starsIn(cardFor('Crystal Beast'))[0].click();
  flushSync();
  expect(mountState('crystal_beast').star).toBe(1);

  starsIn(cardFor('Crystal Beast'))[0].click();
  flushSync();
  expect(mountState('crystal_beast').star).toBe(0);
  expect(cardFor('Crystal Beast').textContent).toContain('not owned');
});

it('the sliders are bounded by the star range, default to its minimum, and write through', () => {
  starsIn(cardFor('Crystal Beast'))[0].click();
  flushSync();

  // crystal_beast star 1: hp [17,19], atk [10,12].
  const [hp, atk] = [...cardFor('Crystal Beast').querySelectorAll('input[type="range"]')];
  expect([hp.min, hp.max]).toEqual(['17', '19']);
  expect([atk.min, atk.max]).toEqual(['10', '12']);
  expect(hp.value).toBe('17'); // defaults to the minimum

  hp.value = '99'; // out of range - the store clamps
  hp.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(mountState('crystal_beast').hpPct).toBe(19);
});

it('an owned mount shows its Glyphs button and six slots', () => {
  starsIn(cardFor('Crystal Beast'))[0].click();
  flushSync();

  const owned = cardFor('Crystal Beast');
  expect([...owned.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Glyphs')).toBe(true);
  expect(owned.querySelectorAll('.glyph-slot').length).toBe(6);
});

it('adds a minor glyph with the chosen stat, value and rarity', () => {
  const [, statSelect, raritySelect] = [...target.querySelectorAll('.add-form select')];
  raritySelect.value = 'Epic';
  raritySelect.dispatchEvent(new Event('change', { bubbles: true }));
  statSelect.value = 'crit';
  statSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  addMinorGlyph('4,5'); // comma decimal, like every other field
  const [glyph] = rosterStore.current.glyphs.entries;
  expect(glyph).toMatchObject({ tier: 'minor', rarity: 'Epic', statKey: 'crit', value: 4.5, special: null });
  expect(target.querySelectorAll('.glyph-card').length).toBe(1);
});

it('a Major glyph is picked from the catalogue and stores its variant id - no value field', () => {
  const [tierSelect] = [...target.querySelectorAll('.add-form select')];
  tierSelect.value = 'major';
  tierSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  // Major glyphs have no free-form stat/value - the catalogue supplies both.
  expect(target.querySelector('.add-form input[aria-label="Glyph value"]')).toBeNull();

  const [, glyphSelect, raritySelect] = [...target.querySelectorAll('.add-form select')];
  glyphSelect.value = 'warhaste-emblem';
  glyphSelect.dispatchEvent(new Event('change', { bubbles: true }));
  raritySelect.value = 'Rare';
  raritySelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  [...target.querySelectorAll('.add-form button')].find((b) => b.textContent.includes('Add to Inventory')).click();
  flushSync();

  const [glyph] = rosterStore.current.glyphs.entries;
  expect(glyph).toMatchObject({ tier: 'major', rarity: 'Rare', special: 'warhaste-emblem:rare' });
  // The card shows the resolved effect and which sigil it retunes.
  const card = target.querySelector('.glyph-card');
  expect(card.textContent).toContain('Warhaste Emblem');
  expect(card.textContent).toContain('Cooldown -> 12s');
  expect(card.textContent).toContain('Warborn Fury');
});

it('a major glyph reads as inert while its sigil is not equipped anywhere', () => {
  const [tierSelect] = [...target.querySelectorAll('.add-form select')];
  tierSelect.value = 'major';
  tierSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  [...target.querySelectorAll('.add-form button')].find((b) => b.textContent.includes('Add to Inventory')).click();
  flushSync();

  const card = target.querySelector('.glyph-card');
  expect(card.classList.contains('inert')).toBe(true);
  expect(card.textContent).toContain('not equipped');
});

it("the glyph picker equips onto one mount and enforces that mount's tier cap", () => {
  for (let i = 0; i < 4; i += 1) addMinorGlyph(String(i + 1));
  starsIn(cardFor('Crystal Beast'))[0].click();
  flushSync();
  openGlyphPicker('Crystal Beast');

  const options = [...target.querySelectorAll('.option')];
  expect(options.length).toBe(4);
  options[0].click();
  options[1].click();
  options[2].click();
  flushSync();

  expect(mountState('crystal_beast').glyphIds.length).toBe(3);

  // Fourth minor exceeds the cap of 3 - the option is disabled, not silently ignored.
  const remaining = [...target.querySelectorAll('.option')].find((o) => !o.classList.contains('on'));
  expect(remaining.disabled).toBe(true);
  expect(mountState('crystal_beast').glyphIds.length).toBe(3);
});

it('the same glyph can sit on several mounts at once', () => {
  addMinorGlyph('3');
  for (const name of ['Crystal Beast', 'Night Wolf']) {
    starsIn(cardFor(name))[0].click();
    flushSync();
    openGlyphPicker(name);
    target.querySelector('.option').click();
    flushSync();
    target.querySelector('.modal-close').click();
    flushSync();
  }

  const glyphId = rosterStore.current.glyphs.entries[0].id;
  const carrying = rosterStore.current.mounts.entries.filter((m) => m.glyphIds.includes(glyphId));
  expect(carrying.map((m) => m.id).sort()).toEqual(['crystal_beast', 'night_wolf']);
  // And the card's button reports the count.
  expect(target.querySelector('.glyph-card').textContent).toContain('On 2 mounts');
});

it('removing a glyph takes two clicks and strips it off every mount', () => {
  addMinorGlyph('3');
  starsIn(cardFor('Crystal Beast'))[0].click();
  flushSync();
  const glyphId = rosterStore.current.glyphs.entries[0].id;
  rosterStore.setMountGlyph('crystal_beast', glyphId, true);
  flushSync();

  const remove = [...target.querySelectorAll('.glyph-card button')].find((b) => b.textContent.includes('Remove'));
  remove.click();
  flushSync();
  expect(rosterStore.current.glyphs.entries.length).toBe(1); // first click only arms it
  expect(target.querySelector('.glyph-card button.is-confirming').textContent).toContain('Confirm remove');

  target.querySelector('.glyph-card button.is-confirming').click();
  flushSync();
  expect(rosterStore.current.glyphs.entries.length).toBe(0);
  expect(rosterStore.current.mounts.entries.every((m) => !m.glyphIds.includes(glyphId))).toBe(true);
});
