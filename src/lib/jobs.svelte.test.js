import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushSync } from 'svelte';

// A resumable task on the real inline runner (optimizerClient -> runTask): sums 1..STEPS one step per
// tick, posts a checkpoint on abort, and resumes from `request.resumeFrom`.
const STEPS = 40;
vi.mock('./tasks/index.js', () => ({
  runTask: async (mode, request, ctx) => {
    if (mode === 'boom') throw new Error('The opponent has no stat sheet.');
    let i = request.resumeFrom?.next ?? 0;
    let acc = request.resumeFrom?.acc ?? 0;
    while (i < STEPS) {
      if (ctx.signal.aborted) {
        ctx.onCheckpoint({ next: i, acc });
        return { aborted: true, acc, i };
      }
      acc += (i + 1) * (request.seed ?? 1);
      i++;
      ctx.onProgress?.({ phases: [{ id: 'p', label: 'Measure', state: 'current', done: i, total: STEPS }] });
      await new Promise((r) => setTimeout(r, 8));
    }
    return { acc, i };
  },
}));

const {
  startJob, cancelJob, resumeJob, retryJob, dismissJob, clearFinished, isStale, jobsStore, jobSignature,
  progressOf, openResult, setPersistCheckpoints, restoreInterrupted, __resetJobs, MAX_RUNNING,
} = await import('./jobs.svelte.js');
const { router, syncRouter } = await import('./router.svelte.js');
const { notifications, resetNotifications } = await import('./notify.svelte.js');

const settled = (id, status) =>
  vi.waitFor(() => expect(jobsStore.list.find((j) => j.id === id)?.status).toBe(status), { timeout: 15000 });
const job = (id) => jobsStore.list.find((j) => j.id === id);

beforeEach(() => {
  localStorage.clear();
  __resetJobs({ run: undefined });
});

describe('job store', () => {
  it('runs a job to finished and keeps progress and result', async () => {
    const id = startJob({ tool: 'duel', title: 'Duel', request: { mode: 'optimize', seed: 1 } });
    expect(job(id).status).toBe('running');
    await settled(id, 'finished');
    expect(job(id).result.acc).toBe((STEPS * (STEPS + 1)) / 2);
    expect(progressOf(job(id)).phases[0].done).toBe(STEPS);
  });

  it('survives navigation: module state, not a page', async () => {
    const id = startJob({ tool: 'duel', title: 'Duel', request: { mode: 'optimize' } });
    history.replaceState(null, '', '#/tools/duel');
    syncRouter();
    history.replaceState(null, '', '#/character/overview');
    syncRouter();
    expect(job(id)).toBeTruthy();
    await settled(id, 'finished');
  });

  it('cancel -> cancelled with a checkpoint, and resume equals the uninterrupted run', async () => {
    const whole = startJob({ tool: 'optimize', title: 'whole', request: { mode: 'optimize', seed: 3 } });
    await settled(whole, 'finished');
    const expected = job(whole).result;

    const id = startJob({ tool: 'optimize', title: 'cut', request: { mode: 'optimize', seed: 3 } });
    await vi.waitFor(() => expect(job(id).progress?.phases[0].done).toBeGreaterThan(5), { interval: 2 });
    cancelJob(id);
    await settled(id, 'cancelled');
    expect(job(id).checkpoint.next).toBeGreaterThan(0);
    expect(job(id).checkpoint.next).toBeLessThan(STEPS);

    resumeJob(id);
    await settled(id, 'finished');
    expect(job(id).result).toEqual(expected);
    expect(job(id).checkpoint).toBeNull();
  });

  it('the running and active counts drop as soon as Cancel is pressed', async () => {
    const id = startJob({ tool: 'duel', title: 'Duel', request: { mode: 'optimize' } });
    await vi.waitFor(() => expect(job(id).progress?.phases[0].done).toBeGreaterThan(1), { interval: 2 });
    expect(jobsStore.running).toBe(1);
    cancelJob(id);
    expect(job(id).status).toBe('running'); // still winding down
    expect(jobsStore.running).toBe(0);
    expect(jobsStore.active).toBe(0);
    await settled(id, 'cancelled');
  });

  it('a task that throws is failed with its message and Retry re-runs it', async () => {
    const id = startJob({ tool: 'duel', title: 'Duel', request: { mode: 'boom' } });
    await settled(id, 'failed');
    expect(job(id).error).toBe('The opponent has no stat sheet.');
    retryJob(id);
    expect(job(id).status).toBe('running');
    await settled(id, 'failed');
  });

  it('queues beyond MAX_RUNNING and starts the next when a slot frees', async () => {
    const ids = Array.from({ length: MAX_RUNNING + 1 }, (_, i) =>
      startJob({ tool: 'duel', title: `J${i}`, request: { mode: 'optimize' } }),
    );
    expect(job(ids.at(-1)).status).toBe('queued');
    expect(jobsStore.running).toBe(MAX_RUNNING);
    await settled(ids.at(-1), 'finished');
  });

  it('a queued job cancels at once, with nothing to resume from', async () => {
    const ids = Array.from({ length: MAX_RUNNING + 1 }, () => startJob({ tool: 'duel', title: 'J', request: { mode: 'optimize' } }));
    cancelJob(ids.at(-1));
    expect(job(ids.at(-1)).status).toBe('cancelled');
    expect(job(ids.at(-1)).checkpoint).toBeNull();
    await settled(ids[0], 'finished');
  });

  it('dismiss and clear finished never remove running jobs', async () => {
    const a = startJob({ tool: 'duel', title: 'A', request: { mode: 'optimize' } });
    dismissJob(a);
    expect(job(a)).toBeTruthy();
    await settled(a, 'finished');
    const b = startJob({ tool: 'duel', title: 'B', request: { mode: 'optimize' } });
    clearFinished();
    expect(job(a)).toBeUndefined();
    expect(job(b)).toBeTruthy();
    await settled(b, 'finished');
    dismissJob(b);
    expect(jobsStore.list).toHaveLength(0);
  });

  it('marks a finished job stale once the signature changes', async () => {
    let preset = 'p1';
    const sig = () => jobSignature({ characterKey: 'c', presetId: preset, inputs: 'x' });
    const id = startJob({ tool: 'optimize', title: 'O', request: { mode: 'optimize' }, signature: sig(), currentSignature: sig });
    await settled(id, 'finished');
    expect(isStale(job(id))).toBe(false);
    preset = 'p1-edited';
    expect(isStale(job(id))).toBe(true);
  });

  it('openResult navigates to the job route', async () => {
    const id = startJob({ tool: 'duel', title: 'D', request: { mode: 'optimize' }, openRoute: '#/tools/duel' });
    await settled(id, 'finished');
    openResult(id);
    await vi.waitFor(() => expect(router.route.id).toBe('tools/duel'));
  });

  it('copies checkpoints to IndexedDB only when opted in, and restores them as resumable', async () => {
    const rows = new Map();
    const checkpointDb = {
      put: async (r) => void rows.set(r.id, r),
      remove: async (id) => void rows.delete(id),
      all: async () => [...rows.values()],
    };
    __resetJobs({ run: undefined, checkpointDb });
    const off = startJob({ tool: 'optimize', title: 'off', request: { mode: 'optimize' } });
    await vi.waitFor(() => expect(job(off).progress).toBeTruthy());
    cancelJob(off);
    await settled(off, 'cancelled');
    expect(rows.size).toBe(0);

    setPersistCheckpoints(true);
    expect(rows.size).toBe(1);

    __resetJobs({ run: undefined, checkpointDb, persist: true });
    expect(await restoreInterrupted()).toBe(1);
    const restored = jobsStore.list[0];
    expect(restored.interrupted).toBe(true);
    resumeJob(restored.id);
    await settled(restored.id, 'finished');
    expect(restored.result.i).toBe(STEPS);
  });
});

describe('the started notice belongs to the job', () => {
  it('shows while the job runs and is gone once it settles, whatever the outcome', async () => {
    resetNotifications();
    const a = startJob({ tool: 'optimize', title: 'a', notice: 'Floor scan started', request: { mode: 'optimize' } });
    expect(notifications.toasts.map((t) => t.message)).toEqual(['Floor scan started']);
    await settled(a, 'finished');
    expect(notifications.toasts).toHaveLength(0);
    expect(notifications.log.map((e) => e.message)).toContain('Floor scan started');
    const b = startJob({ tool: 'boom', title: 'b', notice: 'Drop check started', request: { mode: 'boom' } });
    await settled(b, 'failed');
    expect(notifications.toasts).toHaveLength(0);
    resetNotifications();
  });
});
