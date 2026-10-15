// Worker tasks 'optimize' and 'optimizeMore' (A4): the build optimiser (search/search.js).
//
// optimize request (plain JSON; a stale `v2: true` flag and retired `budget` keys are ignored):
//   { character, presetId?, realm?, target?, objective?, space?, effort?, seed?, resumeFrom?, jobId? }
// optimizeMore request: { character, result, rowKeys?, targetN, seed?, round? }
// Results, progress and checkpoint shapes: docs/Reference/simulation.md §Search, §Result.
// ctx = {signal, onProgress, onCheckpoint}; on abort a task posts its checkpoint, then resolves with
// status 'cancelled' (`aborted: true`).
import { optimize as runOptimize, optimizeMore as runOptimizeMore } from '../search/search.js';

export async function optimize(request = {}, { signal, onProgress, onCheckpoint } = {}) {
  const { character, presetId, realm, target, objective, space, effort, seed, resumeFrom, jobId } = request;
  return runOptimize({ character, presetId, realm, target, objective, space, effort, seed, resumeFrom, jobId }, { signal, onProgress, onCheckpoint });
}

export async function optimizeMore(request = {}, { signal, onProgress } = {}) {
  const { character, result, rowKeys, targetN, seed, round, jobId } = request;
  return runOptimizeMore({ character, result, rowKeys, targetN, seed, round, jobId }, { signal, onProgress });
}
