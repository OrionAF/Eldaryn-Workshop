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
    expect(normalisePrefs({ density: 'huge', reduceMotion: 'yes', defaultEffort: 'warp', cpuProfile: 'turbo' })).toEqual(defaultPrefs());
    expect(normalisePrefs({ density: 'compact', defaultEffort: 'thorough' })).toEqual({ density: 'compact', reduceMotion: false, defaultEffort: 'thorough', cpuProfile: 'balanced', calibration: null, dropSets: 'all', debugLog: 'off' });
    expect(normalisePrefs({ cpuProfile: 'eco' }).cpuProfile).toBe('eco');
  });
  it('the default effort is Standard (plan Q4)', () => {
    expect(defaultPrefs().defaultEffort).toBe('standard');
  });
  it('the CPU profile defaults to balanced (J2)', () => {
    expect(defaultPrefs().cpuProfile).toBe('balanced');
  });
});

describe('Drop Check sets to compare against', () => {
  it('defaults to both sets and keeps only a known value', () => {
    expect(defaultPrefs().dropSets).toBe('all');
    expect(normalisePrefs({ dropSets: 'set1' }).dropSets).toBe('set1');
    expect(normalisePrefs({ dropSets: 'set2' }).dropSets).toBe('all');
  });
  it('is remembered on this device', () => {
    setPrefs({ dropSets: 'set1' });
    expect(prefs.dropSets).toBe('set1');
    expect(loadUi().prefs.dropSets).toBe('set1');
    setPrefs({ dropSets: 'all' });
  });
});

describe('Optimiser debug log level', () => {
  it('defaults to off, keeps only a known level, and old prefs without it load', () => {
    expect(defaultPrefs().debugLog).toBe('off');
    expect(normalisePrefs({ debugLog: 'fights' }).debugLog).toBe('fights');
    expect(normalisePrefs({ debugLog: 'everything' }).debugLog).toBe('off');
    localStorage.setItem(UI_KEY, JSON.stringify({ v: 1, prefs: { density: 'compact', dropSets: 'set1' } }));
    expect(loadUi().prefs).toMatchObject({ density: 'compact', dropSets: 'set1', debugLog: 'off' });
  });
  it('is remembered on this device', () => {
    setPrefs({ debugLog: 'builds' });
    expect(prefs.debugLog).toBe('builds');
    expect(loadUi().prefs.debugLog).toBe('builds');
    setPrefs({ debugLog: 'off' });
  });
});

describe('stored with the UI state, per device', () => {
  it('saveUi merges prefs field by field and keeps the rest of the UI key', () => {
    saveUi({ lastHash: '#/settings' });
    saveUi({ prefs: { density: 'compact' } });
    saveUi({ prefs: { reduceMotion: true } });
    const ui = loadUi();
    expect(ui.lastHash).toBe('#/settings');
    expect(ui.prefs).toEqual({ density: 'compact', reduceMotion: true, defaultEffort: 'standard', cpuProfile: 'balanced', calibration: null, dropSets: 'all', debugLog: 'off' });
  });
  it('a broken stored value yields the defaults', () => {
    localStorage.setItem(UI_KEY, '{"prefs": 7}');
    expect(loadUi().prefs).toEqual(defaultPrefs());
  });
});

describe('setPrefs', () => {
  it('stores the CPU profile on this device', () => {
    setPrefs({ cpuProfile: 'max' });
    expect(prefs.cpuProfile).toBe('max');
    expect(loadUi().prefs.cpuProfile).toBe('max');
  });
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
