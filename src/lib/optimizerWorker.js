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
 */

import { runTask } from './tasks/index.js';

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
