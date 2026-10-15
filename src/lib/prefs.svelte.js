// Preferences (G6) as reactive state. Stored per device in the UI key (uiState.js), never in the roster.
// They are mirrored onto <html> as `data-density` and `data-reduce-motion`, which the shell CSS reads.
import { loadUi, saveUi, normalisePrefs } from './uiState.js';

let state = $state(loadUi().prefs);

function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.density = state.density;
  if (state.reduceMotion) root.dataset.reduceMotion = 'true';
  else delete root.dataset.reduceMotion;
}

export const prefs = {
  get density() {
    return state.density;
  },
  get reduceMotion() {
    return state.reduceMotion;
  },
  get defaultEffort() {
    return state.defaultEffort;
  },
};

/** Change one or more preferences, apply them, and remember them on this device. */
export function setPrefs(patch) {
  state = normalisePrefs({ ...state, ...patch });
  saveUi({ prefs: state });
  apply();
}

/** Re-read the stored preferences and apply them (app start, tests). */
export function applyPrefs() {
  state = loadUi().prefs;
  apply();
}
