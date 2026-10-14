// Worker task registry: optimizerWorker.js and optimizerClient.js dispatch through here.
// A task is async (request, {signal, onProgress}) -> result. On abort it resolves with its
// best-so-far result carrying `aborted: true` (the metrics do this).
//
// Dispatch rule (E8): modes 'duel', 'dropCheck' and 'oblivionFloors' always come here; 'optimize'
// comes here only when the request sets `v2: true`, because the legacy optimizer still owns the
// bare 'optimize' mode until F2a replaces it (then F2a drops the flag and the legacy path).

import { optimize } from './optimize.js';
import { duel } from './duel.js';
import { dropCheck } from './dropCheck.js';
import { oblivionFloors } from './oblivionFloors.js';

export const TASKS = { optimize, duel, dropCheck, oblivionFloors };

export const hasTask = (mode) => Object.prototype.hasOwnProperty.call(TASKS, mode);

/** True when a request should go through the task registry rather than the legacy optimizer. */
export const isTaskRequest = (req) => hasTask(req?.mode) && (req.mode !== 'optimize' || req.v2 === true);

export function runTask(mode, request, ctx = {}) {
  if (!hasTask(mode)) return Promise.reject(new Error(`unknown task mode '${mode}'`));
  return TASKS[mode](request, ctx);
}
