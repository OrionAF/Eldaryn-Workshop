/**
 * settingsStore.svelte.js - reactive wrapper around dps.js's module-level
 * Speed/CritMult stacking flag (not part of Roster - it's a global toggle,
 * not per-character data), persisted under its own localStorage key.
 */
import { getSpeedCritMultMultiplicative, setSpeedCritMultMultiplicative } from './dps.js';
import { loadSettings, saveSettings } from './storage.js';

function createSettingsStore() {
  const initial = loadSettings();
  setSpeedCritMultMultiplicative(initial.speedCritMultMultiplicative);
  let speedCritMultMultiplicative = $state(initial.speedCritMultMultiplicative);

  function setMultiplicative(value) {
    setSpeedCritMultMultiplicative(value);
    speedCritMultMultiplicative = value;
    saveSettings({ speedCritMultMultiplicative: value });
  }

  return {
    get speedCritMultMultiplicative() {
      return speedCritMultMultiplicative;
    },
    setMultiplicative,
  };
}

export const settingsStore = createSettingsStore();
