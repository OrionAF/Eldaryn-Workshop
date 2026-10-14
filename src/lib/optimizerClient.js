/**
 * optimizerClient.js - main-thread facade for the task registry (tasks/index.js).
 *
 * runOptimizerTask() prefers a Web Worker (optimizerWorker.js): the task runs off the main
 * thread, progress streams back live, and cancel() aborts it and resolves with best-so-far
 * (`result.aborted === true`). Where Workers don't exist (jsdom tests, ancient browsers) the
 * same task runs inline, cancellable via AbortController.
 *
 * The request must be plain JSON (it crosses the worker boundary): it is JSON-cloned here,
 * which also detaches Svelte $state proxies. A legacy `v2: true` flag on a request is ignored.
 *
 * @param {{ mode: 'optimize' | 'duel' | 'dropCheck' | 'oblivionFloors', [k: string]: any }} request
 * @param {{ onProgress?: (p) => void }} hooks
 * @returns {{ promise: Promise<result>, cancel: () => void }}
 */

import { runTask } from './tasks/index.js';

export function runOptimizerTask(request, { onProgress } = {}) {
  const plain = JSON.parse(JSON.stringify(request));
  if (typeof Worker === 'undefined') {
    const controller = new AbortController();
    const promise = runTask(plain.mode, plain, { signal: controller.signal, onProgress });
    return { promise, cancel: () => controller.abort() };
  }
  return runInWorker(plain, { onProgress });
}

function runInWorker(plain, { onProgress }) {
  const worker = new Worker(new URL('./optimizerWorker.js', import.meta.url), { type: 'module' });
  let settled = false;
  const promise = new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      settled = true;
      worker.terminate();
      fn(value);
    };
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') onProgress?.(msg.progress);
      else if (msg.type === 'done') finish(resolve, msg.result);
      else if (msg.type === 'error') finish(reject, new Error(msg.message));
    };
    worker.onerror = (event) => finish(reject, new Error(event.message || 'Optimizer worker failed'));
    worker.postMessage(plain);
  });
  // Soft cancel: the worker aborts at its next yield and posts best-so-far.
  const cancel = () => {
    if (!settled) worker.postMessage({ type: 'abort' });
  };
  return { promise, cancel };
}
