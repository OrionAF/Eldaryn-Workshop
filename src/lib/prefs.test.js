import { describe, it, expect, beforeEach } from 'vitest';
import { loadUi, saveUi, normalisePrefs, defaultPrefs, UI_KEY } from './uiState.js';
import { prefs, setPrefs, applyPrefs } from './prefs.svelte.js';

beforeEach(() => {
  localStorage.clear();
  applyPrefs();
});

describe('normalisePrefs', () => {
  it('falls back per field and ignores junk', () => {
    expect(normalisePrefs(null)).toEqual(defaultPrefs());
    expect(normalisePrefs({ density: 'huge', reduceMotion: 'yes', defaultEffort: 'warp' })).toEqual(defaultPrefs());
    expect(normalisePrefs({ density: 'compact', defaultEffort: 'thorough' })).toEqual({ density: 'compact', reduceMotion: false, defaultEffort: 'thorough' });
  });
  it('the default effort is Standard (plan Q4)', () => {
    expect(defaultPrefs().defaultEffort).toBe('standard');
  });
});

describe('stored with the UI state, per device', () => {
  it('saveUi merges prefs field by field and keeps the rest of the UI key', () => {
    saveUi({ lastHash: '#/settings' });
    saveUi({ prefs: { density: 'compact' } });
    saveUi({ prefs: { reduceMotion: true } });
    const ui = loadUi();
    expect(ui.lastHash).toBe('#/settings');
    expect(ui.prefs).toEqual({ density: 'compact', reduceMotion: true, defaultEffort: 'standard' });
  });
  it('a broken stored value yields the defaults', () => {
    localStorage.setItem(UI_KEY, '{"prefs": 7}');
    expect(loadUi().prefs).toEqual(defaultPrefs());
  });
});

describe('setPrefs', () => {
  it('updates the reactive state, persists, and sets the attributes on <html>', () => {
    setPrefs({ density: 'compact', reduceMotion: true });
    expect(prefs.density).toBe('compact');
    expect(document.documentElement.dataset.density).toBe('compact');
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
    expect(loadUi().prefs.density).toBe('compact');
    setPrefs({ reduceMotion: false });
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined();
  });
  it('ignores an invalid value', () => {
    setPrefs({ defaultEffort: 'warp' });
    expect(prefs.defaultEffort).toBe('standard');
  });
});
