/**
 * storage.js - persistence to localStorage + JSON export/import (handoff 6).
 *
 * The whole Roster is stored as one JSON blob. Applying a swap auto-saves.
 * Export downloads a .json backup; import reads one back (normalised through
 * the model so malformed/old files are safe to load).
 */

import { newRoster, normaliseRoster } from './model.js';

const KEY = 'eldaryn_optimiser_state_v1';

const hasLocalStorage = (() => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
})();

/** Load the roster from localStorage, or a fresh one if absent/corrupt. */
export function loadRoster() {
  if (!hasLocalStorage) return newRoster();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return newRoster();
    return normaliseRoster(JSON.parse(raw));
  } catch {
    return newRoster();
  }
}

/** Persist the roster to localStorage. */
export function saveRoster(roster) {
  if (!hasLocalStorage) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(roster));
  } catch {
    // quota / private-mode failures are non-fatal
  }
}

/** Serialise the roster to a pretty JSON string for export. */
export function exportRoster(roster) {
  return JSON.stringify(roster, null, 2);
}

/** Parse + normalise an imported JSON string into a valid roster. */
export function importRoster(jsonText) {
  return normaliseRoster(JSON.parse(jsonText));
}

/** Trigger a browser download of the roster as a .json file. */
export function downloadRoster(roster, filename = 'eldaryn-optimiser.json') {
  const blob = new Blob([exportRoster(roster)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
