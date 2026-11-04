import { describe, it, expect, beforeEach } from 'vitest';
import { vi, afterEach } from 'vitest';
import { rosterStore } from './rosterStore.svelte.js';
import { loadUi, saveUi, UI_KEY } from './uiState.js';
import { backup, markBackup, resetBackup, isBackupStale, backupAge, STALE_BACKUP_MS } from './backupState.svelte.js';

beforeEach(() => localStorage.clear());

describe('lastBackupAt in the UI key', () => {
  it('defaults to null', () => {
    expect(loadUi().lastBackupAt).toBeNull();
  });
  it('round-trips and survives other saves', () => {
    saveUi({ lastBackupAt: 1_700_000_000_000 });
    saveUi({ lastHash: '#/x' });
    expect(loadUi().lastBackupAt).toBe(1_700_000_000_000);
  });
  it.each([['text'], [Number.NaN], [-5], [0], [null], [{}]])('falls back to null for %s', (bad) => {
    localStorage.setItem(UI_KEY, JSON.stringify({ lastBackupAt: bad }));
    expect(loadUi().lastBackupAt).toBeNull();
  });
});

describe('markBackup', () => {
  it('updates the reactive value and stores it', () => {
    markBackup(1234567);
    expect(backup.lastAt).toBe(1234567);
    expect(loadUi().lastBackupAt).toBe(1234567);
  });
});

describe('isBackupStale', () => {
  const now = 10 * STALE_BACKUP_MS;
  it('is never stale with no characters', () => {
    expect(isBackupStale(0, null, now)).toBe(false);
    expect(isBackupStale(0, 1, now)).toBe(false);
  });
  it('is stale with characters and no backup', () => expect(isBackupStale(2, null, now)).toBe(true));
  it('is stale only past 14 days', () => {
    expect(isBackupStale(1, now - STALE_BACKUP_MS, now)).toBe(false);
    expect(isBackupStale(1, now - STALE_BACKUP_MS - 1, now)).toBe(true);
  });
});

describe('backupAge', () => {
  const now = 100 * 86400000;
  it('words the age in days', () => {
    expect(backupAge(now - 1000, now)).toBe('today');
    expect(backupAge(now - 86400000, now)).toBe('1 day ago');
    expect(backupAge(now - 3 * 86400000, now)).toBe('3 days ago');
  });
});

describe('downloads mark a backup', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    resetBackup();
  });
  it('exportDownload', () => {
    rosterStore.addCharacter('B1', 'WARRIOR');
    rosterStore.exportDownload();
    expect(backup.lastAt).not.toBeNull();
  });
  it('exportCharacterDownload', () => {
    const id = rosterStore.addCharacter('B2', 'WARRIOR');
    resetBackup();
    rosterStore.exportCharacterDownload(id);
    expect(backup.lastAt).not.toBeNull();
  });
});
