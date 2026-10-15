import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import App from './App.svelte';
import { rosterStore } from './lib/rosterStore.svelte.js';
import { syncRouter, go } from './lib/router.svelte.js';
import { notify, resetNotifications, notifications } from './lib/notify.svelte.js';

let target, app;
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

function open(hash) {
  history.replaceState(null, '', hash);
  syncRouter();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(App, { target });
  flushSync();
}

beforeEach(() => {
  localStorage.clear();
  resetNotifications();
  const id = rosterStore.addCharacter('Aria', 'WARRIOR');
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
});
afterEach(() => {
  unmount(app);
  target.remove();
  document.body.innerHTML = '';
});

it('P8: a success toast raised just before a navigation is gone after the next route change', async () => {
  open('#/builds/presets');
  go('character/overview');
  notify('Created Aria from a game profile', { kind: 'success' });
  flushSync();
  await tick();
  go('tools/duel');
  flushSync();
  await tick();
  go('builds/presets');
  flushSync();
  await tick();
  expect(notifications.toasts.filter((t) => t.kind === 'success')).toEqual([]);
});

it('P8: error toasts stay across route changes', async () => {
  open('#/builds/presets');
  notify('Import failed', { kind: 'error' });
  go('character/overview');
  flushSync();
  await tick();
  go('builds/presets');
  flushSync();
  await tick();
  expect(notifications.toasts.map((t) => t.message)).toEqual(['Import failed']);
});

it('P8: #/welcome with a character loaded redirects to the default route', async () => {
  open('#/welcome');
  await tick();
  flushSync();
  expect(location.hash).not.toBe('#/welcome');
  expect(target.querySelector('main#main').children.length).toBeGreaterThan(0);
});
