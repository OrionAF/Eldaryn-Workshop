/**
 * storage.js - persistence to localStorage + JSON export/import (handoff 6).
 *
 * The whole Roster is stored as one JSON blob under the v2 key. Export downloads
 * a .json backup; import reads one back (normalised through the model so
 * malformed/old files are safe to load). Rebuild-plan §3 "Rules":
 *  - the v1 key (`eldaryn_optimiser_state_v1`) is READ for migration when no v2 blob
 *    exists, and migration never deletes or overwrites it (only Reset all data does);
 *  - import accepts both v1 and v2 JSON (model/index.js dispatches on schemaVersion), and a game
 *    profile JSON (model/gameProfile.js), which is added to the roster as a new character.
 */

import { emptyRoster, normaliseRoster, normaliseCharacter, getCurrent } from './model/index.js';
import { enforceRosterRunsBudget } from './model/runs.js';
import { isGameProfile, gameProfileToCharacter, importedCharacterName } from './model/gameProfile.js';

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

/**
 * Persist the roster to localStorage. Run history is first trimmed roster-wide to the byte budget
 * (model/runs.js; mutates `roster`). A failed write is never thrown, but it is reported so the UI can
 * say the work is not saved (store `saveState`).
 * @returns {{ok: boolean, error: string|null, trimmed: number, dropped: number}}
 */
export function saveRoster(roster, { runsBudget } = {}) {
  if (!hasLocalStorage) return { ok: false, error: 'Browser storage is unavailable', trimmed: 0, dropped: 0 };
  try {
    const { trimmed, dropped } = enforceRosterRunsBudget(roster.characters ?? [], runsBudget ? { byteBudget: runsBudget } : undefined);
    localStorage.setItem(KEY, JSON.stringify(roster));
    return { ok: true, error: null, trimmed, dropped };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), trimmed: 0, dropped: 0 };
  }
}

/** A rejected import. `line` is the 1-based line of a JSON syntax error. */
export class ImportError extends Error {
  constructor(message, { line = null, cause } = {}) {
    super(message, { cause });
    this.name = 'ImportError';
    this.line = line;
  }
}

/**
 * Offset of the first syntax error in JSON `text` (null when it is valid). Engines word their messages
 * differently (some give no position), so a small recursive-descent scan finds it.
 */
function jsonErrorOffset(text) {
  let i = 0;
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i])) i++;
  };
  const fail = () => {
    throw i;
  };
  const lit = (word) => {
    if (!text.startsWith(word, i)) fail();
    i += word.length;
  };
  const string = () => {
    i++; // opening quote
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') i++;
      else if (text[i] < ' ') fail();
      i++;
    }
    if (i >= text.length) fail();
    i++;
  };
  const value = () => {
    ws();
    const ch = text[i];
    if (ch === '{') {
      i++;
      ws();
      if (text[i] === '}') return void i++;
      for (;;) {
        ws();
        if (text[i] !== '"') fail();
        string();
        ws();
        if (text[i] !== ':') fail();
        i++;
        value();
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === '}') return void i++;
        else fail();
      }
    } else if (ch === '[') {
      i++;
      ws();
      if (text[i] === ']') return void i++;
      for (;;) {
        value();
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === ']') return void i++;
        else fail();
      }
    } else if (ch === '"') string();
    else if (ch === 't') lit('true');
    else if (ch === 'f') lit('false');
    else if (ch === 'n') lit('null');
    else {
      const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
      if (!m) fail();
      i += m[0].length;
    }
  };
  try {
    value();
    ws();
    if (i < text.length) fail();
    return null;
  } catch (at) {
    return typeof at === 'number' ? at : null;
  }
}

/** 1-based line of the first syntax error in `text`, or null. */
function syntaxErrorLine(text) {
  const at = jsonErrorOffset(text);
  return at === null ? null : text.slice(0, at).split('\n').length;
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
 * Import any supported JSON text into `roster` (the current one, which a game profile is added to).
 *  - game profile: a NEW character is appended and selected; its name gets " (imported)" when taken;
 *  - app export (v1 or v2): replaces the roster, as before.
 * Pure: returns a new roster and leaves `roster` untouched. Throws ImportError on unparseable JSON, and on
 * JSON that is neither a profile nor a roster with at least one character (it never yields an empty roster).
 * `report` (array) receives the notes of the profile mapping (gameProfileToCharacter) and of normalising the
 * imported character (`defaulted`/`dropped` entries of the model).
 * @returns {{kind: 'profile'|'roster', roster: object, character: object|null}}
 */
export function importJson(jsonText, roster = emptyRoster(), { now, report } = {}) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    const line = syntaxErrorLine(String(jsonText));
    throw new ImportError(`This is not valid JSON${line ? ` (line ${line})` : ''}: ${e.message}`, { line, cause: e });
  }
  if (!isGameProfile(parsed)) {
    const imported = normaliseRoster(parsed);
    if (imported.characters.length === 0) {
      throw new ImportError('This JSON is neither a game profile nor an Eldaryn export with a character, so nothing was imported.');
    }
    return { kind: 'roster', roster: imported, character: null };
  }
  const character = normaliseCharacter(gameProfileToCharacter(parsed, { ...(now ? { now } : {}), report }), { report });
  character.name = importedCharacterName(character.name, roster.characters.map((c) => c.name));
  const characters = [...roster.characters, character];
  return { kind: 'profile', roster: { schemaVersion: roster.schemaVersion, characters, currentId: character.id }, character };
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
