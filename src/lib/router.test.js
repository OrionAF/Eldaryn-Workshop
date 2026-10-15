import { describe, it, expect, beforeEach } from 'vitest';
import { router, go, areaHash, syncRouter } from './router.svelte.js';
import { UI_KEY, loadUi, saveUi, defaultPrefs } from './uiState.js';

const tick = () => new Promise((r) => setTimeout(r, 10));

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '#/builds/presets');
  syncRouter();
});

describe('router', () => {
  it('opens a deep link and keeps the tab', () => {
    history.replaceState(null, '', '#/character/gear/set2');
    syncRouter();
    expect(router.route).toMatchObject({ kind: 'page', id: 'character/gear', tab: 'set2' });
  });

  it('rewrites an unknown hash to Presets (B1) without adding a history entry', () => {
    const before = history.length;
    history.replaceState(null, '', '#/does/not/exist');
    syncRouter();
    expect(router.route.id).toBe('builds/presets');
    expect(location.hash).toBe('#/builds/presets');
    expect(history.length).toBe(before);
  });

  it('a bare URL reopens the last page from the UI key', () => {
    saveUi({ lastHash: '#/tools/duel' });
    history.replaceState(null, '', '#');
    syncRouter();
    expect(router.route.id).toBe('tools/duel');
  });

  it('go() navigates to a legacy screen id and sets the hash', () => {
    go('duel');
    expect(router.route.id).toBe('tools/duel');
    expect(location.hash).toBe('#/tools/duel');
    go('nonsense');
    expect(router.route.id).toBe('tools/duel');
  });

  it('go(replace) swaps the entry; Back/Forward follow the hash', async () => {
    go('tools/optimiser');
    go('character/pets');
    expect(router.route.id).toBe('character/pets');
    history.back();
    await tick();
    expect(router.route.id).toBe('tools/optimiser');
    history.forward();
    await tick();
    expect(router.route.id).toBe('character/pets');
    go('settings', { replace: true });
    expect(router.route.kind).toBe('settings');
  });

  it('a reload returns to the same page (the hash is the state)', () => {
    go('character/relics');
    syncRouter(); // what the module does at load
    expect(router.route.id).toBe('character/relics');
  });

  it('remembers the last page per area for the area tabs', () => {
    go('tools/oblivion');
    go('character/talents');
    expect(areaHash('tools')).toBe('#/tools/oblivion');
    expect(areaHash('character')).toBe('#/character/talents');
    expect(areaHash('builds')).toBe('#/builds/presets');
  });
});

describe('UI key', () => {
  it('survives junk and unavailable storage', () => {
    localStorage.setItem(UI_KEY, '{not json');
    expect(loadUi()).toEqual({ v: 1, lastHash: null, areaLast: {}, optimiserSetups: {}, prefs: defaultPrefs() });
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(loadUi().lastHash).toBeNull();
    } finally {
      Storage.prototype.getItem = real;
    }
    const realSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    try {
      expect(saveUi({ lastHash: '#/x' })).toBe(false);
    } finally {
      Storage.prototype.setItem = realSet;
    }
  });
});
