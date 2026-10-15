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

function mountApp({ empty, hash }) {
  localStorage.clear();
  rosterStore.roster.characters.splice(0);
  if (!empty) rosterStore.addCharacter('Aria', 'WARRIOR');
  history.replaceState(null, '', hash ?? (empty ? '#/welcome' : '#/character/overview'));
  syncRouter();
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(App, { target });
  flushSync();
  cleanup.push(() => (unmount(app), target.remove()));
  return target;
}

it('Settings with an empty roster: the Import section is reachable and shows one import dialog for a report', async () => {
  const target = mountApp({ empty: true, hash: '#/settings' });
  expect(location.hash).toBe('#/settings'); // not redirected to Welcome
  expect(target.querySelector('[data-testid="import-section"]')).not.toBeNull();
  expect(target.querySelector('.welcome-shell')).toBeNull();
  loadImportText(JSON.stringify({ player: { name: 'Fresh', class: 'MYSTIC', level: 5 }, equipment: {} }));
  flushSync();
  await tick();
  expect(document.querySelectorAll('dialog').length).toBe(1);
});

it('a rejected file shows its reason in the Settings Import section, with no dialog', async () => {
  const target = mountApp({ empty: true, hash: '#/settings' });
  loadImportText('{ "a": 1,\n  "b": }');
  flushSync();
  await tick();
  expect(target.querySelector('[data-testid="import-section"] [role="alert"]').textContent).toMatch(/line \d+|JSON|valid/i);
  expect(document.querySelector('dialog[open]')).toBeNull();
});

it('Welcome links to Settings, Import instead of hosting an import panel', () => {
  const target = mountApp({ empty: true });
  const link = target.querySelector('[data-testid="welcome-import-link"] a');
  expect(link.getAttribute('href')).toBe('#/settings');
  expect(target.querySelector('input[type="file"]')).toBeNull();
  expect(target.textContent).not.toContain('Import your game profile');
});

it('importing from Settings with an empty roster leaves for Overview once a character exists', async () => {
  const target = mountApp({ empty: true, hash: '#/settings' });
  rosterStore.addCharacter('Fresh', 'MYSTIC');
  flushSync();
  await tick();
  expect(location.hash).toBe('#/character/overview');
  expect(target.querySelector('.welcome-shell')).toBeNull();
});

it('the shell has no Import button in the top bar or tab bar', () => {
  const target = mountApp({ empty: false });
  expect(target.querySelector('header.topbar').textContent).not.toMatch(/Import/);
  expect(target.querySelector('nav[aria-label="Areas"]').textContent).not.toMatch(/Import/);
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

it('the Oblivion link keeps its full name when CSS hides the full label (phone)', () => {
  const target = mountApp({ empty: false });
  const link = target.querySelector('a[data-page="tools/oblivion"]');
  expect(link.getAttribute('aria-label')).toBe('Oblivion Floors');
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
