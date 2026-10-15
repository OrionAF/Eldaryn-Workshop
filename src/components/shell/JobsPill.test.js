import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { setup, click, key } from '../ui/testkit.js';

vi.mock('../../lib/optimizerClient.js', () => ({
  jobWorkers: () => 2,
  runOptimizerTask: (request, { onProgress, onCheckpoint }) => {
    if (request.mode === 'boom') return { promise: Promise.reject(new Error('The opponent has no stat sheet.')), cancel() {} };
    onProgress({ phases: [{ id: 's', label: 'Screen', state: 'done' }, { id: 'm', label: 'Measure', state: 'current', done: 4, total: 6 }] });
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    return { promise, cancel: () => { onCheckpoint({ next: 4 }); resolve({ aborted: true }); } };
  },
}));

const { default: JobsPill } = await import('./JobsPill.svelte');
const { startJob, cancelJob, __resetJobs, jobsStore } = await import('../../lib/jobs.svelte.js');

let ui;
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => ui?.done());

async function fresh() {
  const { runOptimizerTask } = await import('../../lib/optimizerClient.js');
  __resetJobs({ run: runOptimizerTask });
  ui = setup(JobsPill);
}

describe('JobsPill and tray', () => {
  it('is a labelled pill that shows the count and a spinner only while a job runs', async () => {
    await fresh();
    const pill = ui.q('.jobs-pill');
    expect(pill.textContent).toContain('Jobs');
    expect(ui.q('.arc')).toBeNull();
    startJob({ tool: 'optimize', title: 'Optimiser · Boss build', context: 'vs Warden', request: { mode: 'optimize' } });
    flushSync();
    expect(ui.q('.arc')).not.toBeNull();
    expect(pill.getAttribute('aria-label')).toBe('Jobs: 1 running, 0 finished');
    expect(ui.q('.count').textContent).toBe('1');
  });

  it('opens the tray with status word + glyph, segments, Cancel; cancelled shows Resume', async () => {
    await fresh();
    startJob({ tool: 'optimize', title: 'Optimiser · Boss build', request: { mode: 'optimize' } });
    click(ui.q('.jobs-pill'));
    const tray = ui.q('[role="dialog"]');
    expect(tray.getAttribute('aria-modal')).toBe('false');
    expect(tray.textContent).toContain('●Running');
    expect(ui.qa('[role="progressbar"]')).toHaveLength(2);
    const cancel = ui.qa('button').find((b) => b.textContent.trim() === 'Cancel');
    click(cancel);
    await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('cancelled'));
    flushSync();
    expect(tray.textContent).toContain('⊘Cancelled');
    expect(ui.qa('button').some((b) => b.textContent.trim() === 'Resume')).toBe(true);
    expect(ui.qa('button').some((b) => b.textContent.trim() === 'Dismiss')).toBe(true);
  });

  it('the tray says jobs keep running while you use the app, and what a reload does follows the checkpoint setting', async () => {
    await fresh();
    startJob({ tool: 'optimize', title: 'Optimiser · Boss build', request: { mode: 'optimize' } });
    click(ui.q('.jobs-pill'));
    const foot = () => ui.q('[data-testid="tray-foot"]').textContent.replace(/\s+/g, ' ');
    expect(foot()).toContain('keep using the app');
    expect(foot()).toContain('A reload cancels running jobs.');
    click(ui.q('.keep input'));
    flushSync();
    expect(foot()).toContain('A reload pauses running jobs; Resume picks up from the last checkpoint.');
  });

  it('failed job shows the error and Retry; Escape closes the tray and refocuses the pill', async () => {
    await fresh();
    startJob({ tool: 'duel', title: 'Duel · Farm', request: { mode: 'boom' } });
    click(ui.q('.jobs-pill'));
    await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('failed'));
    flushSync();
    expect(ui.q('[role="alert"]').textContent).toContain('The opponent has no stat sheet.');
    expect(ui.qa('button').some((b) => b.textContent.trim() === 'Retry')).toBe(true);
    key(ui.q('[role="dialog"]'), 'Escape');
    expect(ui.q('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(ui.q('.jobs-pill'));
  });
});

describe('JobsPill count', () => {
  it('counts running jobs only: a finished job leaves no badge, and the label still says what finished', async () => {
    await fresh();
    const id = startJob({ tool: 'optimize', title: 'Optimiser · Boss build', request: { mode: 'optimize' } });
    flushSync();
    expect(ui.q('.count').textContent).toBe('1');
    cancelJob(id);
    await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('cancelled'));
    flushSync();
    expect(ui.q('.count')).toBeNull();
    expect(ui.q('.jobs-pill').getAttribute('aria-label')).toBe('Jobs: 0 running, 1 finished');
  });
});
