import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Sidebar from './Sidebar.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;

function render(props = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(Sidebar, { target, props: { activeScreen: 'presets', onSelectScreen: () => {}, ...props } });
  flushSync();
}

/** jsdom has no matchMedia - stub it as always matching the mobile breakpoint. */
function stubMobile() {
  window.matchMedia = (query) => ({
    matches: true,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  unmount(app);
  target.remove();
  delete window.matchMedia;
});

it('desktop: renders the left rail with Preset/Character nav groups', () => {
  render();
  expect(target.querySelector('nav.sidebar')).not.toBeNull();
  expect(target.querySelector('.bottom-bar')).toBeNull();
  const labels = [...target.querySelectorAll('.nav-item')].map((b) => b.textContent.trim());
  expect(labels).toEqual([
    'Presets',
    'Drop Check',
    'Gear Loadouts',
    'Talent Sets',
    'Pets',
    'Relics',
    'Sigils',
    'Simulation',
    'PVP',
    'Mount & Glyphs',
    'Awakening',
    'Transcendence',
  ]);
});

it('desktop: clicking a nav item calls onSelectScreen', () => {
  let selected = null;
  render({ onSelectScreen: (id) => (selected = id) });
  [...target.querySelectorAll('.nav-item')].find((b) => b.textContent.trim() === 'Relics').click();
  flushSync();
  expect(selected).toBe('relics');
});

it('mobile: renders a bottom bar with 4 main items + More, no left rail', () => {
  stubMobile();
  render();
  expect(target.querySelector('nav.sidebar')).toBeNull();
  const bar = target.querySelector('.bottom-bar');
  expect(bar).not.toBeNull();
  const labels = [...bar.querySelectorAll('.bottom-item')].map((b) => b.textContent.trim());
  expect(labels).toEqual(['Presets', 'Drop Check', 'Gear Loadouts', 'Talent Sets', 'More']);
});

it('mobile: More opens a sheet with the remaining nav (Pets/Relics/Sigils/Simulation/PVP/Mount & Glyphs/Awakening/Transcendence) + account panel', () => {
  stubMobile();
  render();
  expect(target.querySelector('.more-sheet')).toBeNull();

  [...target.querySelectorAll('.bottom-item')].find((b) => b.textContent.trim() === 'More').click();
  flushSync();

  const sheet = target.querySelector('.more-sheet');
  expect(sheet).not.toBeNull();
  const labels = [...sheet.querySelectorAll('.nav-item')].map((b) => b.textContent.trim());
  expect(labels).toEqual(['Pets', 'Relics', 'Sigils', 'Simulation', 'PVP', 'Mount & Glyphs', 'Awakening', 'Transcendence']);
  expect(sheet.querySelector('.change-character')).not.toBeNull();
  expect(sheet.querySelector('.reset-toggle')).not.toBeNull();
});

it('mobile: selecting a screen from the More sheet closes it', () => {
  stubMobile();
  let selected = null;
  render({ onSelectScreen: (id) => (selected = id) });

  [...target.querySelectorAll('.bottom-item')].find((b) => b.textContent.trim() === 'More').click();
  flushSync();
  [...target.querySelectorAll('.more-sheet .nav-item')].find((b) => b.textContent.trim() === 'Awakening').click();
  flushSync();

  expect(selected).toBe('awakening');
  expect(target.querySelector('.more-sheet')).toBeNull();
});

it('mobile: tapping the backdrop closes the sheet without navigating', () => {
  stubMobile();
  let selected = null;
  render({ onSelectScreen: (id) => (selected = id) });

  [...target.querySelectorAll('.bottom-item')].find((b) => b.textContent.trim() === 'More').click();
  flushSync();
  target.querySelector('.more-backdrop').click();
  flushSync();

  expect(target.querySelector('.more-sheet')).toBeNull();
  expect(selected).toBe(null);
});

it('mobile: character switching still works from inside the sheet', () => {
  stubMobile();
  render();
  const altId = rosterStore.addCharacter('Alt');
  flushSync();

  [...target.querySelectorAll('.bottom-item')].find((b) => b.textContent.trim() === 'More').click();
  flushSync();
  target.querySelector('.change-character').click();
  flushSync();
  [...target.querySelectorAll('.character-button')].find((b) => b.textContent.includes('Alt')).click();
  flushSync();

  expect(rosterStore.current.id).toBe(altId);
  rosterStore.deleteCharacter(altId); // cleanup
});
