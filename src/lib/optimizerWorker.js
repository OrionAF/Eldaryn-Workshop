/**
 * optimizerWorker.js - Web Worker entry for the task registry (tasks/index.js).
 *
 * Receives ONE request ({ mode, ... }), runs the matching task off the main thread, streams
 * progress back, and posts the result. A { type: 'abort' } message cancels the task; it then
 * resolves with its best-so-far result carrying `aborted: true`.
 *
 * Messages out: { type: 'progress', progress }
 *               { type: 'done', result }
 *               { type: 'error', message }
 */

import { runTask } from './tasks/index.js';

const controller = new AbortController();

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg?.type === 'abort') {
    controller.abort();
    return;
  }
  try {
    const result = await runTask(msg.mode, msg, {
      signal: controller.signal,
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
