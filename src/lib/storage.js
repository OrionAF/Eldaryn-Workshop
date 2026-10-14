/**
 * storage.js - persistence to localStorage + JSON export/import (handoff 6).
 *
 * The whole Roster is stored as one JSON blob under the v2 key. Export downloads
 * a .json backup; import reads one back (normalised through the model so
 * malformed/old files are safe to load). Rebuild-plan §3 "Rules":
 *  - the v1 key (`eldaryn_optimiser_state_v1`) is READ for migration when no v2 blob
 *    exists, and migration never deletes or overwrites it (only Reset all data does);
 *  - import accepts both v1 and v2 JSON (model/index.js dispatches on schemaVersion).
 */

import { emptyRoster, normaliseRoster, getCurrent } from './model/index.js';

export const KEY = 'eldaryn_optimiser_state_v2';
export const KEY_V1 = 'eldaryn_optimiser_state_v1';

const hasLocalStorage = (() => {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
})();

/**
 * Load the roster from localStorage, or an empty one if absent/corrupt. With no v2 blob the v1
 * blob (if any) is migrated in memory; nothing is written until the first persist().
 */
export function loadRoster() {
  if (!hasLocalStorage) return emptyRoster();
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(KEY_V1);
    if (!raw) return emptyRoster();
    return normaliseRoster(JSON.parse(raw));
  } catch {
    return emptyRoster();
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

/**
 * Hard reset (the user typed RESET in Settings): wipes the v2 blob, the v1 blob and the removed
 * settings key. This is the one place the v1 key is deleted; migration itself never touches it.
 */
export function clearAllData() {
  if (!hasLocalStorage) return;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_V1);
    localStorage.removeItem(LEGACY_SETTINGS_KEY);
  } catch {
    // quota / private-mode failures are non-fatal
  }
}
