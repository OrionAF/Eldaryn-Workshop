import { it, expect, vi } from 'vitest';
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

async function mountWelcome() {
  localStorage.clear();
  rosterStore.roster.characters.splice(0);
  history.replaceState(null, '', '#/welcome');
  syncRouter();
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(App, { target });
  flushSync();
  return { target, done: () => (unmount(app), target.remove()) };
}

it('Welcome: the start button says what is missing while disabled, and the level is optional', async () => {
  const { target, done } = await mountWelcome();
  const submit = () => target.querySelector('form button[type="submit"]');
  expect(submit().textContent.trim()).toBe('Add a name and a class');
  expect(submit().disabled || submit().getAttribute('aria-disabled') === 'true').toBe(true);
  const name = target.querySelector('form input[type="text"]');
  name.value = 'Lvl';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(submit().textContent.trim()).toBe('Add a class');
  const cls = target.querySelector('form select');
  cls.value = 'WARRIOR';
  cls.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(submit().textContent.trim()).toBe('Get started');
  done();
});

it('Settings > Restore a backup with an empty roster: junk shows the reason and creates nothing; a profile is reported, then created and Welcome is left', async () => {
  const { target, done } = await mountWelcome();
  expect(target.querySelector('[data-testid="welcome-import-link"] a').getAttribute('href')).toBe('#/settings');
  history.replaceState(null, '', '#/settings'); // what following the Welcome link does
  syncRouter();
  flushSync();
  await tick();
  flushSync();
  expect(location.hash).toBe('#/settings');
  const input = target.querySelector('[data-testid="restore-backup"] input[type="file"]');
  const send = (text) => {
    Object.defineProperty(input, 'files', { value: [new File([text], 'x.json')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  send('{"hello": 1}');
  await vi.waitFor(() => {
    flushSync();
    expect(target.querySelector('[data-testid="restore-backup"] [role="alert"]').textContent).toContain('Valid JSON, but not a roster backup');
  });
  expect(rosterStore.roster.characters).toHaveLength(0);
  send(JSON.stringify({ player: { name: 'Hero', class: 'WARRIOR', level: 10 }, equipment: {} }));
  await vi.waitFor(() => {
    flushSync();
    expect(target.querySelector('dialog .report')).not.toBeNull();
  });
  expect(rosterStore.roster.characters).toHaveLength(0);
  const create = [...target.querySelectorAll('dialog button')].find((b) => b.textContent.trim() === 'Create character');
  create.click();
  flushSync();
  await tick();
  flushSync();
  expect(rosterStore.current.name).toBe('Hero');
  expect(target.querySelector('h1').textContent).toBe('Overview');
  expect(target.querySelector('.welcome-card')).toBeNull();
  done();
});
