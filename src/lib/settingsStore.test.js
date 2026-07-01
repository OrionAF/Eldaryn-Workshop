import { it, expect, beforeEach } from 'vitest';
import { settingsStore } from './settingsStore.svelte.js';
import { getSpeedCritMultMultiplicative } from './dps.js';

beforeEach(() => {
  localStorage.clear();
});

it('defaults to additive (false), matching dps.js', () => {
  expect(settingsStore.speedCritMultMultiplicative).toBe(false);
  expect(getSpeedCritMultMultiplicative()).toBe(false);
});

it('setMultiplicative updates both the store and dps.js module state, and persists', async () => {
  settingsStore.setMultiplicative(true);
  expect(settingsStore.speedCritMultMultiplicative).toBe(true);
  expect(getSpeedCritMultMultiplicative()).toBe(true);

  const saved = JSON.parse(localStorage.getItem('eldaryn_optimiser_settings_v1'));
  expect(saved.speedCritMultMultiplicative).toBe(true);

  // Simulate a reload: a fresh loadSettings() read should recover the choice.
  const { loadSettings } = await import('./storage.js');
  expect(loadSettings().speedCritMultMultiplicative).toBe(true);

  settingsStore.setMultiplicative(false); // reset for other test files sharing dps.js module state
});
