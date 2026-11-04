// When the user last exported their characters, as reactive state. Per device in the UI key
// (uiState.js), never in the roster: it says nothing about the characters themselves.
import { loadUi, saveUi } from './uiState.js';

let lastAt = $state(loadUi().lastBackupAt);

export const backup = {
  get lastAt() {
    return lastAt;
  },
};

/** Record that a backup file was just downloaded. */
export function markBackup(now = Date.now()) {
  lastAt = now;
  saveUi({ lastBackupAt: now });
}

export const STALE_BACKUP_MS = 14 * 24 * 60 * 60 * 1000;

/** True when there is something to lose and no backup was made in the last 14 days. No characters: never stale. */
export function isBackupStale(characterCount, lastAt, now = Date.now()) {
  return characterCount > 0 && (lastAt === null || now - lastAt > STALE_BACKUP_MS);
}

/** "today", "1 day ago", "3 days ago". */
export function backupAge(lastAt, now = Date.now()) {
  const days = Math.floor((now - lastAt) / (24 * 60 * 60 * 1000));
  return days <= 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
}

/** Test-only: forget the stored time. */
export function resetBackup() {
  lastAt = null;
  saveUi({ lastBackupAt: null });
}
