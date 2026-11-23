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
      if (ctx.finishSignal?.aborted) return { acc, i, finishedEarly: true };
      acc += (i + 1) * (request.seed ?? 1);
      i++;
      ctx.onProgress?.({ phases: [{ id: 'p', label: 'Measure', state: 'current', done: i, total: STEPS }] });
      await new Promise((r) => setTimeout(r, 8));
    }
    return { acc, i };
  },
}));

const {
  startJob, cancelJob, finishJob, resumeJob, retryJob, dismissJob, clearFinished, isStale, jobsStore, jobSignature,
  progressOf, openResult, setPersistCheckpoints, restoreInterrupted, setRestoredSignatureResolver, __resetJobs, MAX_RUNNING,
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

    expect(job(id).result).toBeDefined();
    resumeJob(id);
    expect(job(id).result).toBeNull();
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

  it('finishJob (Stop early) ends a running job as finished, not cancelled', async () => {
    const id = startJob({ tool: 'optimiser', title: 'Run', request: { mode: 'optimize', seed: 1 } });
    await vi.waitFor(() => expect(job(id).progress).toBeTruthy());
    finishJob(id);
    expect(job(id).finishRequested).toBe(true);
    await settled(id, 'finished');
    expect(job(id).result.finishedEarly).toBe(true);
    expect(job(id).result.i).toBeLessThan(STEPS);
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

describe('a Cancel that lands after the work is done (C6)', () => {
  const manual = () => {
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    const cancel = vi.fn();
    return { run: () => ({ promise, cancel }), resolve, cancel };
  };

  it('keeps the full result: finished, onFinish once, checkpoint cleared and removed', async () => {
    const m = manual();
    const removed = [];
    const checkpointDb = { put: async () => {}, remove: async (id) => void removed.push(id), all: async () => [] };
    __resetJobs({ run: m.run, checkpointDb, persist: true });
    const onFinish = vi.fn();
    const id = startJob({ tool: 'optimize', title: 't', request: { mode: 'optimize' }, onFinish });
    job(id).checkpoint = { next: 3 };
    cancelJob(id);
    expect(m.cancel).toHaveBeenCalledOnce();
    expect(jobsStore.running).toBe(0);
    m.resolve({ done: true, acc: 5 }); // complete: no `aborted`
    await settled(id, 'finished');
    expect(job(id).result).toEqual({ done: true, acc: 5 });
    expect(job(id).checkpoint).toBeNull();
    expect(onFinish).toHaveBeenCalledOnce();
    expect(removed).toContain(id);
  });

  it('still ends cancelled, with its checkpoint, when the task reports aborted', async () => {
    const m = manual();
    const rows = new Map();
    const checkpointDb = { put: async (r) => void rows.set(r.id, r), remove: async () => {}, all: async () => [] };
    __resetJobs({ run: m.run, checkpointDb, persist: true });
    const onFinish = vi.fn();
    const id = startJob({ tool: 'optimize', title: 't', request: { mode: 'optimize' }, onFinish });
    job(id).checkpoint = { next: 3 };
    cancelJob(id);
    m.resolve({ aborted: true, acc: 1 });
    await settled(id, 'cancelled');
    expect(job(id).checkpoint).toEqual({ next: 3 });
    expect(onFinish).not.toHaveBeenCalled();
    expect(rows.has(id)).toBe(true);
  });
});

describe('restored jobs are checked for staleness', () => {
  const restore = async (record, resolver) => {
    const rows = new Map([[record.id, record]]);
    __resetJobs({ run: undefined, checkpointDb: { put: async () => {}, remove: async () => {}, all: async () => [...rows.values()] }, persist: true });
    if (resolver) setRestoredSignatureResolver(resolver);
    await restoreInterrupted();
    return jobsStore.list[0];
  };
  const record = { id: 'job-9', tool: 'drop', title: 'Drop', request: { mode: 'optimize' }, signature: jobSignature({ characterKey: 'c1', inputs: 'a' }), checkpoint: { next: 1 }, at: 1 };

  it('is not stale when nothing changed, stale when the inputs change or the character is gone', async () => {
    let current = record.signature;
    const j = await restore(record, () => current);
    expect(isStale(j)).toBe(false);
    current = jobSignature({ characterKey: 'c1', inputs: 'b' });
    expect(isStale(j)).toBe(true);
    current = null; // character or preset no longer exists
    expect(isStale(j)).toBe(true);
  });

  it('hands the resolver the restored job, with its saved meta', async () => {
    const seen = vi.fn(() => record.signature);
    const j = await restore({ ...record, meta: { extra: 'k' } }, seen);
    isStale(j);
    expect(seen.mock.calls[0][0]).toMatchObject({ tool: 'drop', meta: { extra: 'k' }, signature: record.signature });
  });

  it('counts as current while no resolver is registered', async () => {
    const j = await restore(record);
    expect(isStale(j)).toBe(false);
  });
});
