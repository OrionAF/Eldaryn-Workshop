import { it, expect, vi, beforeEach, afterEach } from 'vitest';
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

it('desktop: renders the left rail with the final nav (Oblivion hidden)', () => {
  render();
  expect(target.querySelector('nav.sidebar')).not.toBeNull();
  expect(target.querySelector('.bottom-bar')).toBeNull();
  const labels = [...target.querySelectorAll('.nav-item')].map((b) => b.textContent.trim());
  expect(labels).toEqual([
    'Character',
    'Presets',
    'Drop Check',
    'Gear',
    'Talents',
    'Sigils',
    'Pets',
    'Mounts',
    'Relics',
    'Awakening',
    'Transcendence',
    'Optimiser',
    'Duel',
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
  expect(labels).toEqual(['Presets', 'Drop Check', 'Optimiser', 'Duel', 'More']);
});

it('mobile: More opens a sheet with the remaining nav (Character, Gear ... Transcendence) + account panel', () => {
  stubMobile();
  render();
  expect(target.querySelector('.more-sheet')).toBeNull();

  [...target.querySelectorAll('.bottom-item')].find((b) => b.textContent.trim() === 'More').click();
  flushSync();

  const sheet = target.querySelector('.more-sheet');
  expect(sheet).not.toBeNull();
  const labels = [...sheet.querySelectorAll('.nav-item')].map((b) => b.textContent.trim());
  expect(labels).toEqual(['Character', 'Gear', 'Talents', 'Sigils', 'Pets', 'Mounts', 'Relics', 'Awakening', 'Transcendence']);
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

it('Import accepts a game profile JSON: a new character is selected and the status message is set', async () => {
  const messages = [];
  render({ onStatus: (m) => messages.push(m) });
  const before = rosterStore.roster.characters.length;
  const json = JSON.stringify({ player: { name: 'Profile Hero', class: 'MYSTIC', level: 44 }, equipment: {} });
  const input = target.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new File([json], 'profile.json', { type: 'application/json' })], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => expect(messages).toEqual(['Imported Profile Hero from a game profile']));
  flushSync();
  expect(rosterStore.roster.characters).toHaveLength(before + 1);
  expect(rosterStore.current).toMatchObject({ name: 'Profile Hero', class: 'MYSTIC', level: 44 });
  expect(target.querySelector('.import-error')).toBeNull();
  rosterStore.deleteCharacter(rosterStore.current.id); // cleanup
});

it('Import shows the error for a file that is not parseable JSON', async () => {
  render();
  const input = target.querySelector('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new File(['{nope'], 'bad.json')], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => {
    flushSync();
    expect(target.querySelector('.import-error')?.textContent).toContain('not a valid roster file or game profile');
  });
});
