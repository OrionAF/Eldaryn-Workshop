// Per-device view state (ia.md: "View state goes in a separate per-device UI key, never in the
// roster"). Everything here is a convenience: every read and write is guarded, a missing or broken
// store just yields the defaults, and nothing in the roster depends on it.

export const UI_KEY = 'eldaryn_ui_v1';

import { CPU_PROFILES, DEFAULT_CPU_PROFILE } from './tasks/cpuProfile.js';
import { normaliseCalibration } from './calibration.js';

export const DENSITIES = ['comfortable', 'compact'];
export const EFFORTS = ['quick', 'standard', 'thorough'];

/**
 * Preferences (G6): density, reduced motion, the effort tools start with (plan Q4: Standard), and the
 * CPU profile that sizes a job's worker pool (tasks/cpuProfile.js workersFor), and the last speed calibration
 * (calibration.js, null until the user runs it).
 */
export const defaultPrefs = () => ({ density: 'comfortable', reduceMotion: false, defaultEffort: 'standard', cpuProfile: DEFAULT_CPU_PROFILE, calibration: null });

const defaults = () => ({ v: 1, lastHash: null, areaLast: {}, optimiserSetups: {}, prefs: defaultPrefs() });

/** Any value -> valid preferences; a field that is missing or not one of the allowed values keeps its default. */
export function normalisePrefs(raw) {
  const out = defaultPrefs();
  if (raw && typeof raw === 'object') {
    if (DENSITIES.includes(raw.density)) out.density = raw.density;
    if (typeof raw.reduceMotion === 'boolean') out.reduceMotion = raw.reduceMotion;
    if (EFFORTS.includes(raw.defaultEffort)) out.defaultEffort = raw.defaultEffort;
    if (CPU_PROFILES.includes(raw.cpuProfile)) out.cpuProfile = raw.cpuProfile;
    out.calibration = normaliseCalibration(raw.calibration);
  }
  return out;
}

/** @returns {{v:1, lastHash:string|null, areaLast:Record<string,string>, optimiserSetups:Record<string,object>, prefs:{density:string, reduceMotion:boolean, defaultEffort:string, cpuProfile:string, calibration:object|null}}} */
export function loadUi() {
  const ui = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(UI_KEY));
    if (raw && typeof raw === 'object') {
      if (typeof raw.lastHash === 'string') ui.lastHash = raw.lastHash;
      if (raw.areaLast && typeof raw.areaLast === 'object') {
        for (const [k, v] of Object.entries(raw.areaLast)) if (typeof v === 'string') ui.areaLast[k] = v;
      }
      // the Optimiser page's setup, per character id (ui/optimiserSetup.js validates it on read)
      if (raw.optimiserSetups && typeof raw.optimiserSetups === 'object') {
        for (const [k, v] of Object.entries(raw.optimiserSetups)) if (v && typeof v === 'object') ui.optimiserSetups[k] = v;
      }
      ui.prefs = normalisePrefs(raw.prefs);
    }
  } catch {
    // no storage, blocked storage or junk: defaults
  }
  return ui;
}

/** Merge a patch (`areaLast` merges key by key) into the stored state. Returns whether it was written. */
export function saveUi(patch) {
  try {
    const cur = loadUi();
    const next = { ...cur, ...patch, areaLast: { ...cur.areaLast, ...(patch.areaLast ?? {}) }, optimiserSetups: { ...cur.optimiserSetups, ...(patch.optimiserSetups ?? {}) }, prefs: normalisePrefs({ ...cur.prefs, ...(patch.prefs ?? {}) }), v: 1 };
    localStorage.setItem(UI_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
