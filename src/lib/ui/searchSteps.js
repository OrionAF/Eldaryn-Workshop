// ui/searchSteps.js - the optimiser's search steps as text (simulation.md §Progress, searchSteps):
// one row per build-space block, from a live progress report, a finished result's `search.steps` or a
// saved run's `steps`. Pure; the labels are the change dimensions' (optimiserView.js).
import { dimensionLabel } from './optimiserView.js';
import { fmtCount } from './statsFormat.js';

const REASON_TEXT = {
  off: 'turned off under Allowed to change',
  'nothing-to-try': 'nothing to try',
};
// StepList states: the search's 'running' is the list's 'active'
const STATE = { queued: 'queued', running: 'active', done: 'done', skipped: 'skipped' };
const plural = (n, one, many) => `${fmtCount(n)} ${n === 1 ? one : many}`;

/**
 * StepList rows for a run's search steps: `[{id, label, state, detail}]` in block order, numbered
 * by the caller. `detail` is plain text (the numbers read in the data face through StepList).
 * @param {Array|null|undefined} rows  search steps; absent on an older run or a Push run
 * @param {{showOff?: boolean}} [opts]  `showOff: false` leaves out the blocks the run turned off
 */
export function searchStepRows(rows, { showOff = true } = {}) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && (showOff || r.reason !== 'off'))
    .map((r) => {
      const state = STATE[r.state] ?? 'queued';
      let detail = '';
      if (state === 'skipped') detail = REASON_TEXT[r.reason] ?? 'skipped';
      else if (state !== 'queued') {
        const parts = [];
        if (r.pass > 1) parts.push(`pass ${fmtCount(r.pass)}`);
        parts.push(plural(r.tried ?? 0, 'build tried', 'builds tried'), plural(r.fights ?? 0, 'fight', 'fights'));
        parts.push(r.improved ? 'found an improvement' : 'no improvement yet');
        detail = parts.join(' · ');
      }
      return { id: r.id, label: dimensionLabel(r.id), state, detail };
    });
}

/** Blocks the search has finished with, and how many it works on at all (skipped ones excluded). */
export function searchStepCounts(rows) {
  const live = (Array.isArray(rows) ? rows : []).filter((r) => r && r.state !== 'skipped');
  return { done: live.filter((r) => r.state === 'done').length, total: live.length };
}
