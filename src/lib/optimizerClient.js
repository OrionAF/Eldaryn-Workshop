/**
 * optimizerClient.js - main-thread facade for the task registry (tasks/index.js).
 *
 * runOptimizerTask() prefers one Web Worker per job (optimizerWorker.js): the task runs off the
 * main thread, progress and checkpoints stream back live, and cancel() stops it softly and
 * resolves with best-so-far (`result.aborted === true`). Where Workers don't exist (jsdom
 * tests, ancient browsers), the constructor throws (CSP) or the worker dies before saying
 * anything, the same task runs inline, cancellable via AbortController (redesign plan A.10, #108).
 *
 * The request must be plain JSON (it crosses the worker boundary): it is JSON-cloned here,
 * which also detaches Svelte $state proxies. A legacy `v2: true` flag on a request is ignored.
 * `request.resumeFrom` (a checkpoint a task emitted earlier) travels with it.
 *
 * Wire protocol, see optimizerWorker.js. In: { type: 'start', request }, { type: 'cancel' }.
 * Out: progress, checkpoint, done, error.
 *
 * @param {{ mode: 'optimize' | 'duel' | 'dropCheck' | 'oblivionFloors', [k: string]: any }} request
 * @param {{ onProgress?: (p) => void, onCheckpoint?: (c) => void }} hooks
 * @returns {{ promise: Promise<result>, cancel: () => void }}
 */

import { runTask } from './tasks/index.js';

export function runOptimizerTask(request, hooks = {}) {
  const plain = JSON.parse(JSON.stringify(request));
  if (typeof Worker === 'undefined') return runInline(plain, hooks);
  return runInWorker(plain, hooks);
}

function runInline(plain, { onProgress, onCheckpoint }) {
  const controller = new AbortController();
  const promise = runTask(plain.mode, plain, { signal: controller.signal, onProgress, onCheckpoint });
  return { promise, cancel: () => controller.abort() };
}

function runInWorker(plain, hooks) {
  let worker;
  try {
    worker = new Worker(new URL('./optimizerWorker.js', import.meta.url), { type: 'module' });
  } catch {
    return runInline(plain, hooks);
  }
  const { onProgress, onCheckpoint } = hooks;
  let settled = false;
  let heard = false; // any message from the worker: it started, so a later failure is real
  let cancelled = false;
  let fallback = null;
  const promise = new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      settled = true;
      worker.terminate();
      fn(value);
    };
    worker.onmessage = (e) => {
      heard = true;
      const msg = e.data;
      if (msg.type === 'progress') onProgress?.(msg.progress);
      else if (msg.type === 'checkpoint') onCheckpoint?.(msg.checkpoint);
      else if (msg.type === 'done') finish(resolve, msg.result);
      else if (msg.type === 'error') finish(reject, new Error(msg.message));
    };
    worker.onerror = (event) => {
      if (settled) return;
      if (!heard) {
        // The worker never started (module worker blocked, script failed to load): run inline.
        settled = true;
        worker.terminate();
        fallback = runInline(plain, hooks);
        if (cancelled) fallback.cancel();
        fallback.promise.then(resolve, reject);
        return;
      }
      finish(reject, new Error(event.message || 'Optimizer worker failed'));
    };
    try {
      worker.postMessage({ type: 'start', request: plain });
    } catch (err) {
      settled = true;
      worker.terminate();
      fallback = runInline(plain, hooks);
      if (cancelled) fallback.cancel();
      fallback.promise.then(resolve, reject);
    }
  });
  // Soft cancel: the worker stops at its next yield and posts a checkpoint, then best-so-far.
  // A no-op once the job has settled.
  const cancel = () => {
    cancelled = true;
    if (fallback) fallback.cancel();
    else if (!settled) worker.postMessage({ type: 'cancel' });
  };
  return { promise, cancel };
}
