// Worker task registry: optimizerWorker.js and optimizerClient.js dispatch through here.
// A task is async (request, {signal, onProgress, onCheckpoint}) -> result; a resumable task
// reads `request.resumeFrom` and reports its checkpoint through `onCheckpoint`.
// On abort it resolves with its best-so-far result carrying `aborted: true` (the metrics do this).
//
// Every mode ('optimize', 'optimizeMore', 'duel', 'dropCheck', 'oblivionFloors', 'calibrate') is dispatched here. A request
// that still carries the retired `v2: true` flag is harmless: the flag is ignored.

import { optimize, optimizeMore } from './optimize.js';
import { duel } from './duel.js';
import { dropCheck } from './dropCheck.js';
import { oblivionFloors } from './oblivionFloors.js';
import { calibrate } from './calibrate.js';

export const TASKS = { optimize, optimizeMore, duel, dropCheck, oblivionFloors, calibrate };

export const hasTask = (mode) => Object.prototype.hasOwnProperty.call(TASKS, mode);

export function runTask(mode, request, ctx = {}) {
  if (!hasTask(mode)) return Promise.reject(new Error(`unknown task mode '${mode}'`));
  // Default after the spread: callers may pass an explicit `onCheckpoint: undefined`.
  const c = { ...ctx };
  c.onCheckpoint ??= () => {};
  return TASKS[mode](request, c);
}
