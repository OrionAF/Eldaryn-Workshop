import { it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import ActivityDrawer from './ActivityDrawer.svelte';
import { notify, notifications, resetNotifications } from '../../lib/notify.svelte.js';
import { setup, click } from '../ui/testkit.js';

const btn = (t, label) => t.qa('button').find((b) => b.textContent.trim() === label);

beforeEach(() => resetNotifications());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetNotifications();
});

it('disables Copy and Clear with a reason while the log is empty', () => {
  const t = setup(ActivityDrawer, { open: true });
  expect(t.q('.log')).toBeNull();
  for (const label of ['Copy log', 'Clear']) {
    expect(btn(t, label).getAttribute('aria-disabled')).toBe('true');
    expect(btn(t, label).title).toMatch(/Nothing to/);
  }
  t.done();
});

it('copies the log oldest first as [time] kind: message lines', async () => {
  const writeText = vi.fn(() => Promise.resolve());
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  notify('first');
  notify('Import failed', { kind: 'error' });
  const t = setup(ActivityDrawer, { open: true });
  click(btn(t, 'Copy log'));
  const lines = writeText.mock.calls[0][0].split('\n');
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(/^\[.+\] info: first$/);
  expect(lines[1]).toMatch(/^\[.+\] error: Import failed$/);
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
  expect(btn(t, 'Copied')).toBeTruthy();
  expect(notifications.log).toHaveLength(2);
  t.done();
});

it('says so when the browser blocks copying', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('no')) } });
  notify('x');
  const t = setup(ActivityDrawer, { open: true });
  click(btn(t, 'Copy log'));
  await new Promise((r) => setTimeout(r, 0));
  flushSync();
  expect(btn(t, 'Copy blocked')).toBeTruthy();
  t.done();
});

it('says so when there is no clipboard', () => {
  vi.stubGlobal('navigator', {});
  notify('x');
  const t = setup(ActivityDrawer, { open: true });
  click(btn(t, 'Copy log'));
  expect(btn(t, 'Copy blocked')).toBeTruthy();
  t.done();
});

it('Clear empties the list and shows the empty state', () => {
  notify('x');
  const t = setup(ActivityDrawer, { open: true });
  expect(t.qa('.log li')).toHaveLength(1);
  click(btn(t, 'Clear'));
  expect(t.q('.log')).toBeNull();
  expect(t.target.textContent).toContain('Nothing yet');
  expect(btn(t, 'Clear').getAttribute('aria-disabled')).toBe('true');
  t.done();
});
