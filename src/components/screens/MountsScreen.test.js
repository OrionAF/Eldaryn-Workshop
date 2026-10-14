import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import MountsScreen from './MountsScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { MOUNT_SPECIES } from '../../lib/game/mountsGlyphs.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Mounty', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(MountsScreen, { target, props: { setStatus: () => {}, onNavigate: () => {} } });
  flushSync();
});
afterEach(() => {
  unmount(app);
  target.remove();
});

const cards = () => [...target.querySelectorAll('.mount-card')];
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((el) => el.textContent.includes(text));
const pick = (el, value) => {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
};

function addMountUi(species) {
  pick(target.querySelector('select[aria-label="Mount species"]'), species);
  byText(target, 'button', 'Add mount').click();
  flushSync();
}
function addGlyphUi({ tier, glyphType, rarity, sealed = false }) {
  pick(target.querySelector('select[aria-label="Glyph tier"]'), tier);
  pick(target.querySelector('select[aria-label="Glyph type"]'), glyphType);
  if (rarity) pick(target.querySelector('select[aria-label="Glyph rarity"]'), rarity);
  const box = target.querySelector('.add-form input[type="checkbox"]');
  box.checked = sealed;
  box.dispatchEvent(new Event('change', { bubbles: true }));
  byText(target, 'button', 'Add to inventory').click();
  flushSync();
}

it('shows an empty state and offers all 13 species', () => {
  expect(target.textContent).toContain('Mounts & Glyphs');
  expect(target.textContent).toContain('No mounts yet');
  expect(target.querySelectorAll('select[aria-label="Mount species"] option').length).toBe(MOUNT_SPECIES.length);
});

it('adds a mount card with level, rolls, effective bonus and six sockets', () => {
  addMountUi('STORM_ROC');
  expect(cards()).toHaveLength(1);
  const card = cards()[0];
  expect(card.textContent).toContain('Storm Roc');
  expect(card.textContent).toContain('Epic');
  expect(card.textContent).toContain('+34% HP');
  expect(card.querySelectorAll('.socket')).toHaveLength(6);
  expect(card.querySelectorAll('[role="radio"]').length).toBe(5);
  expect(rosterStore.current.mounts[0].species).toBe('STORM_ROC');
});

it('the level stars write the level, and the effective bonus follows', () => {
  addMountUi('STORM_ROC');
  const stars = cards()[0].querySelectorAll('[role="radio"]');
  stars[4].click();
  flushSync();
  expect(rosterStore.current.mounts[0].level).toBe(5);
  expect(cards()[0].textContent).toContain('+48% HP'); // round(34 * 1.4)
});

it('Ride toggles the active preset mount', () => {
  addMountUi('NIGHT_WOLF');
  const ride = byText(cards()[0], 'button', 'Ride with');
  ride.click();
  flushSync();
  const pid = rosterStore.current.activePresetId;
  expect(rosterStore.current.presets.find((p) => p.id === pid).mountId).toBe(rosterStore.current.mounts[0].id);
  expect(cards()[0].textContent).toContain('Riding');
});

it('major glyph choices are limited to the class', () => {
  const options = [...target.querySelectorAll('select[aria-label="Glyph type"] option')].map((o) => o.value);
  expect(options).toContain('g-swift');
  pick(target.querySelector('select[aria-label="Glyph tier"]'), 'major');
  const majors = [...target.querySelectorAll('select[aria-label="Glyph type"] option')].map((o) => o.value);
  expect(majors).toHaveLength(12); // Warrior has 12 majors
  expect(majors).toContain('sg-warborn-cd');
  expect(majors).not.toContain('sg-phantom-cd');
});

it('adds glyphs, unlocks a sealed one, and sockets it through the picker', () => {
  addMountUi('NIGHT_WOLF');
  addGlyphUi({ tier: 'minor', glyphType: 'g-swift', sealed: true });
  expect(rosterStore.current.glyphs).toHaveLength(1);
  expect(target.textContent).toContain('Sealed');

  // sealed glyphs are listed but disabled in the picker
  cards()[0].querySelector('.socket').click();
  flushSync();
  let option = document.querySelector('.option');
  expect(option.disabled).toBe(true);
  document.querySelector('.modal-close').click();
  flushSync();

  byText(target, 'button', 'Unlock').click();
  flushSync();
  expect(rosterStore.current.glyphs[0].sealed).toBe(false);

  cards()[0].querySelector('.socket').click();
  flushSync();
  option = document.querySelector('.option');
  expect(option.disabled).toBe(false);
  option.click();
  flushSync();
  expect(rosterStore.current.mounts[0].glyphs.minor[0]).toBe(rosterStore.current.glyphs[0].id);
  expect(cards()[0].querySelector('.socket.filled')).not.toBeNull();
});

it('a minor glyph secondary is entered as stat + value', () => {
  addGlyphUi({ tier: 'minor', glyphType: 'g-keen' });
  pick(target.querySelector('select[aria-label="Secondary stat"]'), 'critChance');
  pick(target.querySelector('input[aria-label="Secondary value"]'), '2.8');
  expect(rosterStore.current.glyphs[0].secondary.stat).toBe('critChance');
  expect(rosterStore.current.glyphs[0].secondary.quality).toBeCloseTo(0.5, 5);
  expect(target.textContent).toContain('0.6-5');
});

it('a character with a different class sees that class\'s majors after switching', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'MYSTIC');
  flushSync();
  pick(target.querySelector('select[aria-label="Glyph tier"]'), 'major');
  const majors = [...target.querySelectorAll('select[aria-label="Glyph type"] option')].map((o) => o.value);
  expect(majors).toHaveLength(17);
  expect(majors).toContain('sg-m-runic-dmg');
});
