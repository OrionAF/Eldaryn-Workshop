/**
 * optimizerWorker.js - Web Worker entry for the task registry (tasks/index.js).
 *
 * One worker per job. Receives { type: 'start', request } (a bare request object is accepted
 * too), runs the matching task off the main thread, streams progress and checkpoints back, and
 * posts the result. { type: 'cancel' } (legacy 'abort') stops the task softly; it then resolves
 * with its best-so-far result carrying `aborted: true`. A cancel that arrives before the start
 * message still cancels the job.
 *
 * Messages out: { type: 'progress', progress }
 *               { type: 'checkpoint', checkpoint }
 *               { type: 'done', result }
 *               { type: 'error', message }
 *
 * `request.workers` (> 1) gives the task a pool of that many nested engine workers (poolWorker.js,
 * tasks/pool.js; simulation.md §Worker pool). With one, or where a worker cannot create Workers,
 * the fights run in this worker as before.
 */

import { runTask } from './tasks/index.js';
import { createPool, inlinePool } from './tasks/pool.js';

const spawnPoolWorker = () => new Worker(new URL('./poolWorker.js', import.meta.url), { type: 'module' });

/** The pool factory for a job of `workers` engine workers. */
export function poolFactory(workers, spawn = spawnPoolWorker) {
  const size = Number.isInteger(workers) && workers > 1 ? workers : 1;
  if (size === 1 || (spawn === spawnPoolWorker && typeof Worker === 'undefined')) return inlinePool;
  return (kind, setup) => createPool({ kind, setup, size, spawn });
}

/** Builds the onmessage handler; `post` is injected so tests can drive it without a Worker. */
export function createWorkerHandler(post) {
  const controller = new AbortController();
  let started = false;
  return async (e) => {
    const msg = e.data;
    if (msg?.type === 'cancel' || msg?.type === 'abort') {
      controller.abort();
      return;
    }
    if (started) return; // one job per worker
    started = true;
    const request = msg?.type === 'start' ? msg.request : msg;
    try {
      const result = await runTask(request?.mode, request, {
        signal: controller.signal,
        pool: poolFactory(request?.workers),
        onProgress: (progress) => post({ type: 'progress', progress }),
        onCheckpoint: (checkpoint) => post({ type: 'checkpoint', checkpoint }),
      });
      post({ type: 'done', result });
    } catch (err) {
      post({ type: 'error', message: err?.message || String(err) });
    }
  };
}

if (typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined') {
  self.onmessage = createWorkerHandler((m) => self.postMessage(m));
}
