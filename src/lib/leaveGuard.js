/**
 * leaveGuard.js - ask the browser to confirm before the tab closes or reloads while it would cost
 * work: a job is running or queued (a reload ends it), or the last save failed (edits would be lost).
 * Browsers show their own text; a custom message is ignored.
 */
import { jobsStore } from './jobs.svelte.js';
import { rosterStore } from './rosterStore.svelte.js';

export function shouldWarnOnLeave() {
  return jobsStore.active > 0 || !rosterStore.saveState.ok;
}

/** Add the beforeunload listener once; returns a function that removes it. */
export function installLeaveGuard(win = window, check = shouldWarnOnLeave) {
  const onBeforeUnload = (e) => {
    if (!check()) return;
    e.preventDefault();
    e.returnValue = '';
  };
  win.addEventListener('beforeunload', onBeforeUnload);
  return () => win.removeEventListener('beforeunload', onBeforeUnload);
}
