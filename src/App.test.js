import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import App from './App.svelte';
import { rosterStore } from './lib/rosterStore.svelte.js';
import { syncRouter, go, router } from './lib/router.svelte.js';
import { notify, resetNotifications } from './lib/notify.svelte.js';
import { resetImportFlow } from './lib/importFlow.svelte.js';

let target, app;

const q = (sel) => target.querySelector(sel);
const qa = (sel) => [...target.querySelectorAll(sel)];
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const click = (el) => {
  el.click();
  flushSync();
};
const byText = (sel, text) => qa(sel).find((b) => b.textContent.trim() === text);

function open(hash = '#/builds/presets') {
  history.replaceState(null, '', hash);
  syncRouter();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(App, { target });
  flushSync();
}

function onlyCharacter(name, cls) {
  const id = rosterStore.addCharacter(name, cls);
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
  return id;
}

beforeEach(() => {
  localStorage.clear();
  resetNotifications();
  resetImportFlow();
  onlyCharacter('Aria', 'WARRIOR');
});
afterEach(() => {
  unmount(app);
  target.remove();
  document.body.innerHTML = '';
});

it('rail: 18 pages in three labelled groups, Oblivion Floors always listed but locked', () => {
  open();
  const groups = qa('nav[aria-label="Main"] section.group');
  expect(groups.map((g) => g.querySelector('h2').textContent.trim())).toEqual(['Character', 'Builds', 'Tools']);
  expect(groups.map((g) => g.querySelectorAll('a.item').length)).toEqual([10, 3, 5]);
  const oblivion = q('a.item[data-page="tools/oblivion"]');
  expect(oblivion.textContent).toContain('locked');
  expect(oblivion.textContent).toContain('Oblivion Floors');
  rosterStore.setOblivionUnlocked(true);
  flushSync();
  expect(q('a.item[data-page="tools/oblivion"]').textContent).not.toContain('locked');
});

it('deep link opens the page: title, aria-current and the scope badge', () => {
  open('#/tools/duel');
  expect(q('h1').textContent).toBe('Duel');
  expect(q('a.item[aria-current="page"]').dataset.page).toBe('tools/duel');
  expect(q('.context-header').textContent).toContain('Tool');
});

it('an unknown route lands on Presets (B1)', () => {
  open('#/nonsense/at/all');
  expect(q('h1').textContent).toBe('Presets');
  expect(location.hash).toBe('#/builds/presets');
});

it('clicking a rail item navigates, and back/forward return', async () => {
  open();
  q('a.item[data-page="character/relics"]').click();
  await vi.waitFor(() => {
    flushSync();
    expect(q('h1').textContent).toBe('Relics');
  });
  go('tools/optimiser');
  flushSync();
  expect(q('h1').textContent).toBe('Optimiser');
  history.back();
  await vi.waitFor(() => {
    flushSync();
    expect(q('h1').textContent).toBe('Relics');
  });
  history.forward();
  await vi.waitFor(() => {
    flushSync();
    expect(q('h1').textContent).toBe('Optimiser');
  });
});

it('a reload returns to the same page (fresh mount on the same hash)', () => {
  open('#/character/gear/set2');
  unmount(app);
  target.remove();
  syncRouter();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(App, { target });
  flushSync();
  expect(q('h1').textContent).toBe('Gear');
  expect(router.route.tab).toBe('set2');
});

it('the Oblivion locked state unlocks inline instead of sending the user away', () => {
  open('#/tools/oblivion');
  click(byText('button', 'Unlock Oblivion'));
  expect(rosterStore.current.oblivion.unlocked).toBe(true);
  expect(q('[data-testid="power"]')).toBeTruthy();
});

it('a classless character opens Overview with the class picker focused and other pages say "needs class"', async () => {
  const id = rosterStore.addCharacter('Nobody', null);
  expect(rosterStore.current.id).toBe(id);
  open('#/character/overview');
  await tick();
  flushSync();
  expect(document.activeElement?.tagName).toBe('SELECT');
  expect(q('a.item[data-page="character/gear"]').textContent).toContain('needs class');
  expect(q('a.item[data-page="character/overview"]').textContent).not.toContain('needs class');
  go('character/gear');
  flushSync();
  expect(q('main').textContent).toContain('Choose a class first');
});

it('character switcher: switch, New requires a class, delete is disabled for the last character', () => {
  open();
  const trigger = q('.switcher .current');
  expect(trigger.textContent).toContain('Aria');
  expect(trigger.textContent).toContain('Warrior');

  click(trigger);
  click(byText('[role^="menuitem"]', '+ New character'));
  const dialog = [...document.querySelectorAll('dialog')].find((d) => d.textContent.includes('New character'));
  const create = [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Create character');
  expect(create.getAttribute('aria-disabled')).toBe('true');
  const name = dialog.querySelector('input[type="text"]');
  name.value = 'Brom';
  name.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(create.getAttribute('aria-disabled')).toBe('true'); // still no class
  const cls = dialog.querySelector('select');
  cls.value = 'SENTINEL';
  cls.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(create.getAttribute('aria-disabled')).toBeNull();
  click(create);
  expect(rosterStore.current).toMatchObject({ name: 'Brom', class: 'SENTINEL' });
  expect(q('h1').textContent).toBe('Overview');

  click(q('.switcher .current'));
  click(byText('[role^="menuitem"]', 'Edit character'));
  const edit = [...document.querySelectorAll('dialog')].find((d) => d.textContent.includes('Edit character'));
  expect(edit.querySelector('button[disabled], button[aria-disabled="true"]')).toBeNull(); // two characters: delete allowed
  rosterStore.deleteCharacter(rosterStore.roster.characters.find((c) => c.name === 'Aria').id);
  flushSync();
  const del = [...edit.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete character');
  expect(del.disabled).toBe(true);
});

it('G2: preset select sets the active preset; realm control is locked until Oblivion is unlocked', () => {
  open();
  const second = rosterStore.current.presets[1];
  const select = q('#context-preset select');
  select.value = second.id;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.activePresetId).toBe(second.id);

  const oblivionSeg = q('.realm button[data-value="oblivion"]');
  expect(oblivionSeg.disabled).toBe(true);
  rosterStore.setOblivionUnlocked(true);
  flushSync();
  const unlocked = q('.realm button[data-value="oblivion"]');
  expect(unlocked.disabled).toBe(false);
  click(unlocked);
  expect(rosterStore.current.oblivion.activeRealm).toBe('oblivion');
});

it('save state reads Saved, and "Not saved" with the reason once a write fails', () => {
  open();
  rosterStore.renameCharacter(rosterStore.current.id, 'Aria 2');
  flushSync();
  expect(q('[data-testid="save-state"]').textContent).toContain('Saved');
  const real = Storage.prototype.setItem;
  Storage.prototype.setItem = () => {
    throw new Error('QuotaExceeded');
  };
  try {
    rosterStore.renameCharacter(rosterStore.current.id, 'Aria 3');
    flushSync();
    const state = q('[data-testid="save-state"]');
    expect(state.textContent).toContain('Not saved');
    expect(state.title).toContain('QuotaExceeded');
  } finally {
    Storage.prototype.setItem = real;
  }
});

it('notifications: a message shows in the live region and the Activity drawer, errors stay', () => {
  open();
  notify('Level saved');
  notify('Import failed: bad file', { kind: 'error' });
  flushSync();
  const live = q('div[aria-label="Notifications"]');
  expect(live.textContent).toContain('Level saved');
  expect(live.querySelector('[role="alert"]').textContent).toContain('Import failed');
  const bell = q('button[aria-label^="Notifications"]');
  expect(bell.getAttribute('aria-label')).toBe('Notifications, 2 unread');
  click(bell);
  const log = document.querySelector('ol[aria-label="Session activity"]');
  expect(log.textContent).toContain('Level saved');
  expect(log.textContent).toContain('Import failed');
  expect(q('button[aria-label^="Notifications"]').getAttribute('aria-label')).toBe('Notifications');
});

it('a screen calling setStatus raises a toast (setStatus -> notify)', () => {
  open('#/character/pets');
  const tier = document.getElementById([...qa('main label')].find((l) => l.textContent.trim() === 'Pet altar tier').htmlFor);
  tier.value = String(Number(tier.value) === 1 ? 2 : 1);
  tier.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  click([...qa('main button')].find((b) => b.textContent.trim() === 'Change tier'));
  click([...qa('main button')].find((b) => b.textContent.trim() === 'Wipe collection'));
  expect(q('div[aria-label="Notifications"]').textContent).toContain('collection cleared');
});

it('phone area bar: Character / Builds / Tools / Import, the current area marked', () => {
  open('#/tools/duel');
  const tabs = qa('nav[aria-label="Areas"] .tab');
  expect(tabs.map((t) => t.querySelector('.micro-label').textContent.trim())).toEqual(['Character', 'Builds', 'Tools', 'Import']);
  expect(tabs.filter((t) => t.getAttribute('aria-current') === 'page').map((t) => t.querySelector('.micro-label').textContent.trim())).toEqual(['Tools']);
  expect(tabs[2].getAttribute('href')).toBe('#/tools/duel'); // last-used page of the area
});

it('Import: junk shows the specific reason in the dialog and changes nothing; a profile is reported, then created', async () => {
  open('#/builds/presets');
  const before = JSON.stringify(rosterStore.roster);
  const input = q('dialog input[type="file"]');
  const send = (text) => {
    Object.defineProperty(input, 'files', { value: [new File([text], 'x.json', { type: 'application/json' })], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  send('{nope');
  await vi.waitFor(() => {
    flushSync();
    expect(q('dialog [role="alert"]').textContent).toContain('not valid JSON');
  });
  expect(JSON.stringify(rosterStore.roster)).toBe(before);

  send(JSON.stringify({ player: { name: 'Profile Hero', class: 'MYSTIC', level: 44 }, equipment: {} }));
  await vi.waitFor(() => {
    flushSync();
    expect(q('dialog .report').textContent).toContain('Profile Hero');
  });
  expect(JSON.stringify(rosterStore.roster)).toBe(before); // the report writes nothing
  const importDialog = qa('dialog').find((d) => d.querySelector('.report'));
  click([...importDialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Create character'));
  await vi.waitFor(() => {
    flushSync();
    expect(rosterStore.current.name).toBe('Profile Hero');
  });
  flushSync();
  expect(q('h1').textContent).toBe('Overview');
  expect(q('div[aria-label="Notifications"]').textContent).toContain('Created Profile Hero from a game profile');
});

it('Settings route renders Data, Preferences and the RESET danger zone', () => {
  open('#/settings');
  expect(q('h1').textContent).toBe('Data & Settings');
  expect(q('[aria-label="Danger Zone"]')).not.toBeNull();
  expect(byText('button', 'Export all characters')).toBeTruthy();
  expect(byText('button', 'Export Aria')).toBeTruthy();
  expect(qa('h2').map((h) => h.textContent.trim())).toEqual(expect.arrayContaining(['Data', 'Preferences', 'Danger zone']));
});

it('switching characters raises a "Switched to" notification and keeps the page', () => {
  rosterStore.addCharacter('Alt', 'MYSTIC');
  const aria = rosterStore.roster.characters.find((c) => c.name === 'Aria');
  open('#/character/relics');
  click(q('.switcher .current'));
  click(qa('[role^="menuitem"]').find((b) => b.textContent.trim().startsWith('Aria')));
  expect(rosterStore.current.id).toBe(aria.id);
  expect(q('div[aria-label="Notifications"]').textContent).toContain('Switched to Aria');
  expect(q('h1').textContent).toBe('Relics');
  expect(q('.switcher .current').textContent).toContain('Warrior');
});
