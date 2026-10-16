import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import MountsScreen from './CharacterMountsPage.svelte';
import pageSource from './CharacterMountsPage.svelte?raw';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { MOUNT_SPECIES } from '../../lib/game/mountsGlyphs.js';
import { field } from '../gear/fieldKit.js';

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

const byLabel = (text) => document.getElementById([...target.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(text)).htmlFor);
const showTab = (name) => {
  [...target.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes(name)).click();
  flushSync();
};

function addMountUi(species) {
  showTab('Mounts');
  pick(byLabel('Mount species'), species);
  byText(target, 'button', '+ Add mount').click();
  flushSync();
}
function addGlyphUi({ tier, glyphType, rarity, sealed = false }) {
  showTab('Glyph inventory');
  pick(field(target, 'Tier'), tier);
  pick(field(target, 'Glyph'), glyphType);
  if (rarity) pick(field(target, 'Rarity'), rarity);
  const box = target.querySelector('.add-form input[type="checkbox"]');
  box.checked = sealed;
  box.dispatchEvent(new Event('change', { bubbles: true }));
  byText(target, 'button', 'Add to inventory').click();
  flushSync();
}

it('shows an empty state and offers all 13 species', () => {
  expect(target.textContent).toContain('Mounts & Glyphs');
  expect(target.textContent).toContain('No mounts yet');
  expect(byLabel('Mount species').querySelectorAll('option').length).toBe(MOUNT_SPECIES.length);
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

it('Ridden in toggles a named preset on the mount', () => {
  addMountUi('NIGHT_WOLF');
  cards()[0].querySelector('button[aria-haspopup="menu"]').click();
  flushSync();
  const pid = rosterStore.current.presets[0].id;
  [...cards()[0].querySelectorAll('[role^="menuitem"]')][0].click();
  flushSync();
  expect(rosterStore.current.presets.find((p) => p.id === pid).mountId).toBe(rosterStore.current.mounts[0].id);
  expect(cards()[0].textContent).toContain('Ridden in: ' + rosterStore.current.presets[0].name);
});

it('major glyph choices are limited to the class', () => {
  showTab('Glyph inventory');
  const options = [...field(target, 'Glyph').querySelectorAll('option')].map((o) => o.value);
  expect(options).toContain('g-swift');
  pick(field(target, 'Tier'), 'major');
  const majors = [...field(target, 'Glyph').querySelectorAll('option')].map((o) => o.value);
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
  showTab('Mounts');
  cards()[0].querySelector('.socket').click();
  flushSync();
  let option = document.querySelector('.option');
  expect(option.disabled).toBe(true);
  document.querySelector('.modal-close').click();
  flushSync();

  showTab('Glyph inventory');
  byText(target, 'button', 'Unlock').click();
  flushSync();
  expect(rosterStore.current.glyphs[0].sealed).toBe(false);

  showTab('Mounts');
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
  pick(field(target, 'Secondary stat'), 'critChance');
  const v = field(target, 'Secondary value');
  v.value = '1.9';
  v.dispatchEvent(new Event('input', { bubbles: true }));
  v.dispatchEvent(new Event('blur'));
  flushSync();
  expect(rosterStore.current.glyphs[0].secondary.stat).toBe('critChance');
  expect(rosterStore.current.glyphs[0].secondary.quality).toBeCloseTo(0.3, 1);
  expect(target.textContent).toContain('0.6-5');
});

it('a character with a different class sees that class\'s majors after switching', () => {
  showTab('Glyph inventory');
  rosterStore.setCharacterClass(rosterStore.current.id, 'MYSTIC');
  flushSync();
  pick(field(target, 'Tier'), 'major');
  const majors = [...field(target, 'Glyph').querySelectorAll('option')].map((o) => o.value);
  expect(majors).toHaveLength(17);
  expect(majors).toContain('sg-m-runic-dmg');
});

it('a major glyph whose sigil is not equipped is inert in the presets that ride its mount, named', () => {
  addMountUi('NIGHT_WOLF');
  addGlyphUi({ tier: 'major', glyphType: 'sg-warborn-cd', rarity: 'Rare' });
  const c = rosterStore.current;
  rosterStore.setMountSocket(c.mounts[0].id, 'major', 0, c.glyphs[0].id);
  flushSync();
  expect(target.textContent).not.toContain('Inert in');
  const p0 = rosterStore.current.presets[0];
  rosterStore.setPresetMount(p0.id, c.mounts[0].id);
  flushSync();
  const glyphCard = target.querySelector(`[data-glyph-id="${c.glyphs[0].id}"]`);
  expect(glyphCard.textContent).toContain(`Inert in ${p0.name}: its sigil is not equipped`);
});

it('Ridden in names every preset, checks the riders, and rides from the menu', () => {
  addMountUi('NIGHT_WOLF');
  const [p0, p1] = rosterStore.current.presets;
  cards()[0].querySelector('button[aria-haspopup="menu"]').click();
  flushSync();
  const items = [...cards()[0].querySelectorAll('[role^="menuitem"]')];
  expect(items.map((i) => i.textContent).join('|')).toContain(p1.name);
  items.find((i) => i.textContent.includes(p1.name)).click();
  flushSync();
  expect(rosterStore.current.presets[1].mountId).toBe(rosterStore.current.mounts[0].id);
  expect(rosterStore.current.presets[0].mountId).toBeNull();
  expect(cards()[0].textContent).toContain(`Ridden in: ${p1.name}`);
  expect(p0.name).not.toBe(p1.name);
});

it('shows glyphs in tabs: Mounts and Glyph inventory', () => {
  expect([...target.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim())).toEqual(expect.arrayContaining([expect.stringContaining('Mounts'), expect.stringContaining('Glyph inventory')]));
});

it('opens on the glyph inventory when the hash tab says so', () => {
  unmount(app);
  app = mount(MountsScreen, { target, props: { tab: 'glyphs' } });
  flushSync();
  expect(target.querySelector('#mg-panel-glyphs')).not.toBeNull();
  expect(target.querySelector('#mg-panel-mounts')).toBeNull();
});

// jsdom applies no layout and loads no component CSS, so the 1440 overflow fix (scrollWidth 1483) is
// guarded at the source: an auto-fill grid may not carry a fixed max-width, and its wrappers must shrink.
const rule = (css, selector) => css.match(new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

it('the grids cannot widen their panel: no fixed cap, and the wrappers above them may shrink', () => {
  const css = pageSource.split('<style>')[1];
  for (const grid of ['.mount-grid', '.glyph-grid']) {
    expect(rule(css, grid), grid).toContain('min-width: 0');
    expect(rule(css, grid), grid).not.toContain('max-width');
  }
  expect(rule(css, '.page')).toMatch(/min-width: 0/);
  expect(rule(css, '.page')).toMatch(/overflow-x: auto/);
});

it('the Health and Attack fields and slider ends show the level-scaled values the game shows; a typed value stores its level-1 roll', async () => {
  const { setField } = await import('../gear/fieldKit.js');
  addMountUi('CRYSTAL_DRAKE');
  const id = rosterStore.current.mounts[0].id;
  rosterStore.updateMount(id, { level: 2, baseHp: 37, baseAtk: 25 });
  flushSync();
  const card = cards()[0];
  const hp = field(card, 'Health');
  const atk = field(card, 'Attack');
  expect(hp.value).toBe('41'); // round(37 * 1.1)
  expect(atk.value).toBe('28'); // round(25 * 1.1)
  const bounds = [...card.querySelectorAll('.bound')].map((b) => b.textContent.trim());
  expect(bounds).toEqual(['41', '43', '26', '29']); // the Crystal Drake roll range 37-39 / 24-26 at level 2
  expect(card.querySelector('[data-testid="mount-roll"]').textContent.replace(/\s+/g, ' ')).toContain('level 1: 37%, 25%');
  setField(hp, '42');
  expect(rosterStore.current.mounts[0].baseHp).toBe(38);
  expect(field(cards()[0], 'Health').value).toBe('42');
});
