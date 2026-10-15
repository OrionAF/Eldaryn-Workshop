import { it, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import App from './App.svelte';
import { rosterStore } from './lib/rosterStore.svelte.js';
import { syncRouter } from './lib/router.svelte.js';

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

it('an empty roster shows Welcome at #/welcome; creating the first character opens Overview', async () => {
  localStorage.clear();
  // what Reset all data leaves behind after the reload
  rosterStore.roster.characters.splice(0);
  history.replaceState(null, '', '#/builds/presets');
  syncRouter();
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(App, { target });
  flushSync();
  const q = (sel) => target.querySelector(sel);

  expect(q('.welcome-card')).not.toBeNull();
  expect(q('nav[aria-label="Main"]')).toBeNull();
  await tick();
  expect(location.hash).toBe('#/welcome');

  const name = q('.welcome-card input[type="text"]');
  name.value = 'First';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  const cls = q('.welcome-card select');
  cls.value = 'MYSTIC';
  cls.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Get started').click();
  flushSync();
  await tick();
  flushSync();

  expect(q('h1').textContent).toBe('Overview');
  expect(location.hash).toBe('#/character/overview');
  unmount(app);
  target.remove();
});

it('#/welcome with characters present redirects to Presets', async () => {
  localStorage.clear();
  if (rosterStore.roster.characters.length === 0) rosterStore.addCharacter('Aria', 'WARRIOR');
  history.replaceState(null, '', '#/welcome');
  syncRouter();
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(App, { target });
  flushSync();
  await tick();
  flushSync();
  expect(target.querySelector('h1').textContent).toBe('Presets');
  expect(location.hash).toBe('#/builds/presets');
  unmount(app);
  target.remove();
});
