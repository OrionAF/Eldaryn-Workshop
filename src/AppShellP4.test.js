import { it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync, createRawSnippet } from 'svelte';
import App from './App.svelte';
import { rosterStore } from './lib/rosterStore.svelte.js';
import { syncRouter } from './lib/router.svelte.js';
import { loadImportText, resetImportFlow } from './lib/importFlow.svelte.js';
import { inspector } from './lib/inspector.svelte.js';
import { resetNotifications } from './lib/notify.svelte.js';
import { unitFor } from './components/import/importUnits.js';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
let cleanup = [];
afterEach(() => {
  for (const f of cleanup.splice(0)) f();
  resetImportFlow();
  resetNotifications();
  inspector.clear();
});

function mountApp({ empty }) {
  localStorage.clear();
  rosterStore.roster.characters.splice(0);
  if (!empty) rosterStore.addCharacter('Aria', 'WARRIOR');
  history.replaceState(null, '', empty ? '#/welcome' : '#/character/overview');
  syncRouter();
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(App, { target });
  flushSync();
  cleanup.push(() => (unmount(app), target.remove()));
  return target;
}

it('the Welcome page and a picked file show exactly one import dialog', async () => {
  mountApp({ empty: true });
  loadImportText('{"not":"a known file"}');
  flushSync();
  await tick();
  expect(document.querySelectorAll('dialog').length).toBe(1);
});

it('a rejected file shows its reason on the Welcome page', async () => {
  mountApp({ empty: true });
  loadImportText('{ "a": 1,\n  "b": }');
  flushSync();
  await tick();
  const dialog = document.querySelector('dialog[open]');
  expect(dialog.textContent).toMatch(/line \d+|JSON|valid/i);
});

it('the first tab stop is a skip link to the main landmark', () => {
  const target = mountApp({ empty: false });
  const first = target.querySelector('a, button, input, select');
  expect(first.className).toContain('skip-link');
  expect(first.getAttribute('href')).toBe('#main');
  expect(target.querySelector('main#main')).not.toBeNull();
});

it('the Welcome page has a main landmark and the skip link', () => {
  const target = mountApp({ empty: true });
  expect(target.querySelector('main#main')).not.toBeNull();
  expect(target.querySelector('.skip-link')).not.toBeNull();
});

it('rail icons are SVG, not text glyphs that can render as tofu', () => {
  const target = mountApp({ empty: false });
  const nav = target.querySelector('nav[aria-label="Main"]');
  const icons = [...nav.querySelectorAll('.glyph')];
  expect(icons.length).toBeGreaterThan(10);
  for (const i of icons) expect(i.querySelector('svg'), i.outerHTML).not.toBeNull();
  expect(nav.textContent).not.toContain('⚿');
  expect(nav.querySelector('.lock svg')).not.toBeNull();
});

it('the phone strip has a short label for Oblivion Floors', () => {
  const target = mountApp({ empty: false });
  const link = target.querySelector('a[data-page="tools/oblivion"]');
  expect(link.querySelector('.label-short').textContent.trim()).toBe('Oblivion');
});

it('index.html links an icon and the file exists', async () => {
  const fs = await import('node:fs');
  const html = fs.readFileSync('index.html', 'utf8');
  expect(html).toMatch(/<link rel="icon"[^>]*href="%BASE_URL%favicon\.svg"/);
  expect(fs.existsSync('public/favicon.svg')).toBe(true);
});

it('the app renders the inspector content into #shell-inspector', () => {
  const target = mountApp({ empty: false });
  inspector.set(createRawSnippet(() => ({ render: () => '<p id="insp-probe">detail</p>' })));
  flushSync();
  expect(target.querySelector('#shell-inspector #insp-probe')).not.toBeNull();
  inspector.clear();
  flushSync();
  expect(target.querySelector('#insp-probe')).toBeNull();
});

it('import report units are singular for one', () => {
  expect(unitFor(1, 'pets')).toBe('pet');
  expect(unitFor(1, 'presets')).toBe('preset');
  expect(unitFor(1, 'stones')).toBe('stone');
  expect(unitFor(1, 'points')).toBe('point');
  expect(unitFor(2, 'pets')).toBe('pets');
  expect(unitFor(0, 'pets')).toBe('pets');
});
