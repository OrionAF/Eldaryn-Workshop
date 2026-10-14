// Worker task registry: optimizerWorker.js and optimizerClient.js dispatch through here.
// A task is async (request, {signal, onProgress}) -> result. On abort it resolves with its
// best-so-far result carrying `aborted: true` (the metrics do this).
//
// Every mode ('optimize', 'duel', 'dropCheck', 'oblivionFloors') is dispatched here. A request
// that still carries the retired `v2: true` flag is harmless: the flag is ignored.

import { optimize } from './optimize.js';
import { duel } from './duel.js';
import { dropCheck } from './dropCheck.js';
import { oblivionFloors } from './oblivionFloors.js';

export const TASKS = { optimize, duel, dropCheck, oblivionFloors };

export const hasTask = (mode) => Object.prototype.hasOwnProperty.call(TASKS, mode);

export function runTask(mode, request, ctx = {}) {
  if (!hasTask(mode)) return Promise.reject(new Error(`unknown task mode '${mode}'`));
  return TASKS[mode](request, ctx);
}
