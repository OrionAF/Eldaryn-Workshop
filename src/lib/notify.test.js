import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { notify, statusMessage, dismissKey, dismissStale, dismiss, pauseDismiss, resumeDismiss, markAllRead, clearLog, runAction, notifications, resetNotifications, INFO_MS, MAX_VISIBLE } from './notify.svelte.js';

beforeEach(() => {
  vi.useFakeTimers();
  resetNotifications();
});
afterEach(() => {
  resetNotifications();
  vi.useRealTimers();
});

describe('notify', () => {
  it('info toasts dismiss after 6 s but stay in the activity log', () => {
    notify('Saved level');
    expect(INFO_MS).toBe(6000);
    vi.advanceTimersByTime(5999);
    expect(notifications.toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(notifications.toasts).toHaveLength(0);
    expect(notifications.log.map((e) => e.message)).toEqual(['Saved level']);
  });

  it('errors and warnings are sticky until dismissed', () => {
    const e = notify('Import failed', { kind: 'error' });
    notify('Heads up', { kind: 'warn' });
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(notifications.toasts).toHaveLength(2);
    dismiss(e);
    expect(notifications.toasts.map((t) => t.message)).toEqual(['Heads up']);
  });

  it('shows at most three toasts (newest) and logs all of them', () => {
    for (let i = 1; i <= 5; i++) notify(`m${i}`, { kind: 'error' });
    expect(MAX_VISIBLE).toBe(3);
    expect(notifications.toasts.map((t) => t.message)).toEqual(['m3', 'm4', 'm5']);
    expect(notifications.log).toHaveLength(5);
  });

  it('hover holds the timer, leaving restarts it', () => {
    const id = notify('hold me');
    vi.advanceTimersByTime(5000);
    pauseDismiss(id);
    vi.advanceTimersByTime(60000);
    expect(notifications.toasts).toHaveLength(1);
    resumeDismiss(id);
    vi.advanceTimersByTime(6000);
    expect(notifications.toasts).toHaveLength(0);
  });

  it('counts unread entries until marked read', () => {
    notify('a');
    notify('b');
    expect(notifications.unread).toBe(2);
    markAllRead();
    expect(notifications.unread).toBe(0);
    notify('c');
    expect(notifications.unread).toBe(1);
  });
});

describe('statusMessage (the old setStatus)', () => {
  it('ignores the empty message that used to clear the toast', () => {
    expect(statusMessage('')).toBeNull();
    expect(statusMessage('   ')).toBeNull();
    expect(notifications.log).toHaveLength(0);
  });

  it('treats failure wording as a sticky error', () => {
    statusMessage('Duel failed: boom');
    statusMessage('Level saved');
    expect(notifications.log.map((e) => e.kind)).toEqual(['error', 'info']);
    vi.advanceTimersByTime(7000);
    expect(notifications.toasts.map((t) => t.message)).toEqual(['Duel failed: boom']);
  });
});

describe('toasts that belong to something', () => {
  it('dismissKey removes the toasts raised for that key and keeps the log', () => {
    notify('Floor scan started', { key: 'job-1' });
    notify('Other');
    dismissKey('job-1');
    expect(notifications.toasts.map((t) => t.message)).toEqual(['Other']);
    expect(notifications.log.map((e) => e.message)).toEqual(['Floor scan started', 'Other']);
  });

  it('dismissStale drops old info and success toasts, keeps young ones and every warning and error', () => {
    notify('Old info');
    notify('Old success', { kind: 'success' });
    notify('Old warning', { kind: 'warn' });
    vi.advanceTimersByTime(2000);
    notify('Fresh success', { kind: 'success' });
    dismissStale(1500);
    expect(notifications.toasts.map((t) => t.message)).toEqual(['Old warning', 'Fresh success']);
  });
});

describe('clearLog', () => {
  it('empties the log and unread but leaves toasts; later messages still log', () => {
    notify('one', { kind: 'error' });
    notify('two', { kind: 'error' });
    expect(notifications.unread).toBe(2);
    clearLog();
    expect(notifications.log).toEqual([]);
    expect(notifications.unread).toBe(0);
    expect(notifications.toasts).toHaveLength(2);
    notify('three');
    expect(notifications.log.map((e) => e.message)).toEqual(['three']);
    expect(notifications.unread).toBe(1);
  });

  it('is harmless on an empty log', () => {
    clearLog();
    expect(notifications.log).toEqual([]);
  });
});

describe('toast actions', () => {
  it('an action toast shows the button; the log keeps the message only', () => {
    const run = vi.fn();
    notify('Deleted Aria', { action: { label: 'Undo', run } });
    expect(notifications.toasts[0].action.label).toBe('Undo');
    expect(notifications.log[0].message).toBe('Deleted Aria');
    expect(notifications.log[0]).not.toHaveProperty('action');
  });

  it('runAction runs once and removes the toast; the log stays', () => {
    const run = vi.fn();
    const id = notify('Deleted Aria', { action: { label: 'Undo', run } });
    runAction(id);
    runAction(id);
    expect(run).toHaveBeenCalledTimes(1);
    expect(notifications.toasts).toHaveLength(0);
    expect(notifications.log).toHaveLength(1);
  });

  it('an action toast still dismisses itself after INFO_MS', () => {
    notify('Deleted Aria', { action: { label: 'Undo', run: () => {} } });
    vi.advanceTimersByTime(INFO_MS);
    expect(notifications.toasts).toHaveLength(0);
  });

  it('ignores an action without a run function, and runAction on a plain toast does nothing', () => {
    const id = notify('Saved', { action: { label: 'Undo' } });
    expect(notifications.toasts[0]).not.toHaveProperty('action');
    runAction(id);
    expect(notifications.toasts).toHaveLength(1);
  });
});