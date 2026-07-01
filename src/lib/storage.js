/**
 * storage.js - persistence to localStorage + JSON export/import (handoff 6).
 *
 * The whole Roster is stored as one JSON blob. Applying a swap auto-saves.
 * Export downloads a .json backup; import reads one back (normalised through
 * the model so malformed/old files are safe to load).
 */

import { newRoster, normaliseRoster, getCurrent } from './model.js';

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

/**
 * "CharacterName_2026-07-01_1442.json" - the currently-selected character's
 * name (sanitised - filenames can't contain most punctuation) plus a local
 * datetime stamp, so repeated exports/backups don't overwrite each other and
 * are easy to tell apart. The export itself still contains the whole roster
 * (every character), same as before - this only names the file after
 * whoever you had selected when you exported.
 */
export function defaultExportFilename(roster) {
  const name = getCurrent(roster)?.name || 'roster';
  const safeName = name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'roster';
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${safeName}_${stamp}.json`;
}

/** Trigger a browser download of the roster as a .json file. */
export function downloadRoster(roster, filename = defaultExportFilename(roster)) {
  const blob = new Blob([exportRoster(roster)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Removed feature (the Speed/Crit Mult stacking toggle) used to persist
// under this key - still cleared by clearAllData() below in case an
// existing user's browser still has it from before the removal.
const LEGACY_SETTINGS_KEY = 'eldaryn_optimiser_settings_v1';

/** Hard reset: wipe every Eldaryn Workshop key from localStorage. */
export function clearAllData() {
  if (!hasLocalStorage) return;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch {
    // quota / private-mode failures are non-fatal
  }
}
