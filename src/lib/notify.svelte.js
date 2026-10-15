/**
 * notify.svelte.js - the app's status messages (ia.md §2.1 notifications, G5 Activity).
 *
 * `notify(message, {kind})` shows a toast and appends to the session Activity log. info and success
 * dismiss themselves after INFO_MS; warn and error stay until dismissed. At most MAX_VISIBLE toasts
 * show (the newest); the log keeps every message of the session (capped), so nothing is lost when a
 * toast is dismissed, replaced or the user navigates. Not persisted.
 *
 * `statusMessage(msg)` is the old screens' `setStatus(msg)`: an empty message is ignored (the old
 * toast was cleared that way), and a message that reads as a failure is an error.
 */

export const INFO_MS = 6000;
export const MAX_VISIBLE = 3;
export const LOG_CAP = 200;

const STICKY = new Set(['warn', 'error']);
const FAILURE = /\b(failed|cannot|could not|error|not a valid)\b/i;

let nextId = 1;
let toasts = $state([]);
let log = $state([]);
let readUpTo = $state(0);
const timers = new Map();

function startTimer(id) {
  clearTimeout(timers.get(id));
  timers.set(id, setTimeout(() => dismiss(id), INFO_MS));
}

/**
 * @param {string} message
 * @param {{kind?: 'info'|'success'|'warn'|'error', key?: string}} [opts]  `key` names what the toast is about;
 *   `dismissKey(key)` removes it when that thing ends (a job's "started" note once the job settles)
 * @returns {number} the notification id
 */
export function notify(message, { kind = 'info', key = null } = {}) {
  const id = nextId++;
  const entry = { id, message: String(message), kind, key, at: new Date() };
  log = [...log, entry].slice(-LOG_CAP);
  toasts = [...toasts, entry].slice(-MAX_VISIBLE);
  if (!STICKY.has(kind)) startTimer(id);
  return id;
}

export function statusMessage(message) {
  if (typeof message !== 'string' || message.trim() === '') return null;
  return notify(message, { kind: FAILURE.test(message) ? 'error' : 'info' });
}

export function dismiss(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  toasts = toasts.filter((t) => t.id !== id);
}

/** Remove the toasts raised for `key` (the log keeps them). */
export function dismissKey(key) {
  for (const t of toasts.filter((x) => x.key === key)) dismiss(t.id);
}

/**
 * On a route change: remove the info and success toasts that have been up for at least `minAgeMs`, so a
 * message about the page you left does not cover the next one. A toast raised just before the navigation
 * itself (an import that then opens its page) is younger than that and stays. Warnings and errors stay.
 */
export function dismissStale(minAgeMs = 1500) {
  const now = Date.now();
  for (const t of toasts.filter((x) => !STICKY.has(x.kind) && now - x.at.getTime() >= minAgeMs)) dismiss(t.id);
}

/** Hover or focus on a toast holds its timer; leaving restarts it. */
export function pauseDismiss(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}
export function resumeDismiss(id) {
  if (toasts.some((t) => t.id === id && !STICKY.has(t.kind))) startTimer(id);
}

export function markAllRead() {
  readUpTo = nextId - 1;
}

/** Test hook: forget every toast and log entry. */
export function resetNotifications() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  toasts = [];
  log = [];
  readUpTo = 0;
}

export const notifications = {
  get toasts() {
    return toasts;
  },
  get log() {
    return log;
  },
  get unread() {
    return log.filter((e) => e.id > readUpTo).length;
  },
};
