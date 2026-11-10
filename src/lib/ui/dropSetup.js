// ui/dropSetup.js - Drop Check's per-device Measure settings (which presets are compared, effort): defaults and
// validation of a stored setup. Pure. Kept per character in the UI key (uiState.js). The goals a drop is judged
// by are on the character (model/dropCheck.js); the old metric toggles stored here are read once by
// ui/dropGoals.js legacyDropGoals and then marked `goalsImported`.
import { EFFORTS } from '../uiState.js';

export const defaultDropSetup = (defaultEffort = 'standard') => ({
  scope: 'all',
  precision: EFFORTS.includes(defaultEffort) ? defaultEffort : 'standard',
});

/** Any value -> a valid setup; a field that is missing or invalid keeps its default. The page re-checks scope against the live character. */
export function normaliseDropSetup(raw, defaultEffort = 'standard') {
  const out = defaultDropSetup(defaultEffort);
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.scope === 'string') out.scope = raw.scope;
  if (EFFORTS.includes(raw.precision)) out.precision = raw.precision;
  return out;
}
