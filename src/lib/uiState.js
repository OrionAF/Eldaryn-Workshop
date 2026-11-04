// Per-device view state (ia.md: "View state goes in a separate per-device UI key, never in the
// roster"). Everything here is a convenience: every read and write is guarded, a missing or broken
// store just yields the defaults, and nothing in the roster depends on it.

export const UI_KEY = 'eldaryn_ui_v1';

import { CPU_PROFILES, DEFAULT_CPU_PROFILE } from './tasks/cpuProfile.js';
import { normaliseCalibration } from './calibration.js';
import { DEBUG_LOG_LEVELS } from './model/debugLog.js';

export const DENSITIES = ['comfortable', 'compact'];
export const EFFORTS = ['quick', 'standard', 'thorough'];
/** Drop Check's "Compare against": every gear set, or Set 1 only (features/swap.js DROP_SET_SCOPES). */
export const DROP_SETS = ['all', 'set1'];
/** Opponent library list order (Tools > Opponents): as added, newest first, by name, or duel-ready first. */
export const OPPONENT_ORDERS = ['added', 'newest', 'name', 'ready'];

/**
 * Preferences (G6): density, reduced motion, the effort tools start with (plan Q4: Standard), and the
 * CPU profile that sizes a job's worker pool (tasks/cpuProfile.js workersFor), and the last speed calibration
 * (calibration.js, null until the user runs it), which gear sets Drop Check compares a drop against, and
 * the Optimiser's debug log level (model/debugLog.js; simulation.md §Debug log), and whether the game-data
 * import tools are shown (off by default: ia.md §5.4, Settings > Advanced).
 */
export const defaultPrefs = () => ({ density: 'comfortable', reduceMotion: false, defaultEffort: 'standard', cpuProfile: DEFAULT_CPU_PROFILE, calibration: null, dropSets: 'all', debugLog: 'off', showImport: false });

const defaults = () => ({ v: 1, lastHash: null, lastBackupAt: null, areaLast: {}, optimiserSetups: {}, dropSetups: {}, statPriority: { spec: null, range: null }, coreScoreSpec: null, opponents: { order: 'added', selectedId: null }, prefs: defaultPrefs() });

/** Any value -> valid preferences; a field that is missing or not one of the allowed values keeps its default. */
export function normalisePrefs(raw) {
  const out = defaultPrefs();
  if (raw && typeof raw === 'object') {
    if (DENSITIES.includes(raw.density)) out.density = raw.density;
    if (typeof raw.reduceMotion === 'boolean') out.reduceMotion = raw.reduceMotion;
    if (EFFORTS.includes(raw.defaultEffort)) out.defaultEffort = raw.defaultEffort;
    if (CPU_PROFILES.includes(raw.cpuProfile)) out.cpuProfile = raw.cpuProfile;
    out.calibration = normaliseCalibration(raw.calibration);
    if (DROP_SETS.includes(raw.dropSets)) out.dropSets = raw.dropSets;
    if (DEBUG_LOG_LEVELS.includes(raw.debugLog)) out.debugLog = raw.debugLog;
    if (typeof raw.showImport === 'boolean') out.showImport = raw.showImport;
  }
  return out;
}

/** @returns {{v:1, lastHash:string|null, lastBackupAt:number|null, areaLast:Record<string,string>, optimiserSetups:Record<string,object>, dropSetups:Record<string,object>, statPriority:{spec:string|null, range:string|null}, coreScoreSpec:string|null, opponents:{order:'added'|'newest'|'name'|'ready', selectedId:string|null}, prefs:{density:string, reduceMotion:boolean, defaultEffort:string, cpuProfile:string, calibration:object|null, dropSets:'all'|'set1', debugLog:'off'|'builds'|'fights', showImport:boolean}}} */
export function loadUi() {
  const ui = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(UI_KEY));
    if (raw && typeof raw === 'object') {
      if (typeof raw.lastHash === 'string') ui.lastHash = raw.lastHash;
      // when the user last exported (backupState.svelte.js); anything but a positive finite time is "never"
      if (Number.isFinite(raw.lastBackupAt) && raw.lastBackupAt > 0) ui.lastBackupAt = raw.lastBackupAt;
      if (raw.areaLast && typeof raw.areaLast === 'object') {
        for (const [k, v] of Object.entries(raw.areaLast)) if (typeof v === 'string') ui.areaLast[k] = v;
      }
      // the Optimiser page's setup, per character id (ui/optimiserSetup.js validates it on read)
      if (raw.optimiserSetups && typeof raw.optimiserSetups === 'object') {
        for (const [k, v] of Object.entries(raw.optimiserSetups)) if (v && typeof v === 'object') ui.optimiserSetups[k] = v;
      }
      // Drop Check's Measure settings, per character id (ui/dropSetup.js validates it on read)
      if (raw.dropSetups && typeof raw.dropSetups === 'object') {
        for (const [k, v] of Object.entries(raw.dropSetups)) if (v && typeof v === 'object') ui.dropSetups[k] = v;
      }
      // Stat Priorities' spec and level range (the page checks both against its data)
      const sp = raw.statPriority;
      if (sp && typeof sp === 'object') {
        if (typeof sp.spec === 'string') ui.statPriority.spec = sp.spec;
        if (typeof sp.range === 'string') ui.statPriority.range = sp.range;
      }
      // the spec Pet Cores are scored for (Character > Pets; the page checks it against the class)
      if (typeof raw.coreScoreSpec === 'string') ui.coreScoreSpec = raw.coreScoreSpec;
      // Opponent library: list order and the opponent last opened (the page falls back if the id is gone)
      const op = raw.opponents;
      if (op && typeof op === 'object') {
        if (OPPONENT_ORDERS.includes(op.order)) ui.opponents.order = op.order;
        if (typeof op.selectedId === 'string') ui.opponents.selectedId = op.selectedId;
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
    const next = { ...cur, ...patch, areaLast: { ...cur.areaLast, ...(patch.areaLast ?? {}) }, optimiserSetups: { ...cur.optimiserSetups, ...(patch.optimiserSetups ?? {}) }, dropSetups: { ...cur.dropSetups, ...(patch.dropSetups ?? {}) }, opponents: { ...cur.opponents, ...(patch.opponents ?? {}) }, prefs: normalisePrefs({ ...cur.prefs, ...(patch.prefs ?? {}) }), v: 1 };
    localStorage.setItem(UI_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
