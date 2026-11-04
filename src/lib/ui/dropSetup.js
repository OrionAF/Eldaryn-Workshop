// ui/dropSetup.js - Drop Check's Measure settings (presets compared, which metrics run, the survival enemy,
// the PVP opponents, effort): defaults and validation of a stored setup. Pure. Kept per character in the UI
// key (uiState.js), so it is per device and never in the roster.
import { buildEnemy } from '../features/swap.js';
import { EFFORTS } from '../uiState.js';

export const DEFAULT_ENEMY = Object.freeze({ kind: 'campaign', chapter: 1, level: 1 });

export const defaultDropSetup = (defaultEffort = 'standard') => ({
  scope: 'all',
  simOn: true,
  survivalOn: false,
  enemySpec: { ...DEFAULT_ENEMY },
  pvpOn: false,
  pvpIds: null,
  precision: EFFORTS.includes(defaultEffort) ? defaultEffort : 'standard',
});

/** Any value -> a valid setup; a field that is missing or invalid keeps its default. The page re-checks scope and opponent ids against the live character. */
export function normaliseDropSetup(raw, defaultEffort = 'standard') {
  const out = defaultDropSetup(defaultEffort);
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.scope === 'string') out.scope = raw.scope;
  if (typeof raw.simOn === 'boolean') out.simOn = raw.simOn;
  if (typeof raw.survivalOn === 'boolean') out.survivalOn = raw.survivalOn;
  if (raw.enemySpec && typeof raw.enemySpec === 'object') {
    let ok = false;
    try { ok = !!buildEnemy(raw.enemySpec); } catch { ok = false; }
    if (ok) out.enemySpec = JSON.parse(JSON.stringify(raw.enemySpec));
  }
  if (typeof raw.pvpOn === 'boolean') out.pvpOn = raw.pvpOn;
  if (Array.isArray(raw.pvpIds)) out.pvpIds = raw.pvpIds.filter((x) => typeof x === 'string');
  if (EFFORTS.includes(raw.precision)) out.precision = raw.precision;
  return out;
}
