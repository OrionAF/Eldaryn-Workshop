import { describe, it, expect, beforeEach, vi } from 'vitest';

const save = vi.hoisted(() => ({ state: { ok: true } }));
vi.mock('./rosterStore.svelte.js', () => ({
  rosterStore: {
    get saveState() {
      return save.state;
    },
  },
}));
vi.mock('./tasks/index.js', () => ({
  runTask: (mode, request, ctx) =>
    new Promise((resolve) => ctx.signal.addEventListener('abort', () => resolve({ aborted: true }))),
}));

const { shouldWarnOnLeave, installLeaveGuard } = await import('./leaveGuard.js');
const { startJob, cancelJob, __resetJobs } = await import('./jobs.svelte.js');

const leave = (win) => {
  const e = new Event('beforeunload', { cancelable: true });
  win.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  save.state = { ok: true };
  __resetJobs({ run: undefined });
});

describe('leave guard', () => {
  it('does not warn when idle and saved', () => {
    expect(shouldWarnOnLeave()).toBe(false);
    const off = installLeaveGuard(window);
    expect(leave(window).defaultPrevented).toBe(false);
    off();
  });

  it('warns while a job runs, and stops once it is cancelled', () => {
    const off = installLeaveGuard(window);
    const id = startJob({ tool: 'duel', title: 'Duel', request: {} });
    expect(leave(window).defaultPrevented).toBe(true);
    cancelJob(id);
    expect(leave(window).defaultPrevented).toBe(false);
    off();
  });

  it('warns while a job is queued behind the running limit', () => {
    for (let i = 0; i < 3; i++) startJob({ tool: 'duel', title: 'Duel', request: {} });
    expect(shouldWarnOnLeave()).toBe(true);
  });

  it('warns when the last save failed', () => {
    save.state = { ok: false, error: 'quota' };
    const off = installLeaveGuard(window);
    expect(leave(window).defaultPrevented).toBe(true);
    off();
  });

  it('uninstall removes the listener', () => {
    save.state = { ok: false };
    const off = installLeaveGuard(window);
    off();
    expect(leave(window).defaultPrevented).toBe(false);
  });
});
