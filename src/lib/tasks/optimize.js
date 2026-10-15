// Worker tasks 'optimize' and 'optimizeMore' (A4): the build optimiser (search/search.js).
//
// optimize request (plain JSON; a stale `v2: true` flag and retired `budget` keys are ignored):
//   { character, presetId?, realm?, target?, objective?, space?, effort?, seed?, powerFloor?, resumeFrom?, jobId? }
// optimizeMore request: { character, result, rowKeys?, targetN, seed?, round? }
// Results, progress and checkpoint shapes: docs/Reference/simulation.md §Search, §Result.
// ctx = {signal, onProgress, onCheckpoint}; on abort a task posts its checkpoint, then resolves with
// status 'cancelled' (`aborted: true`).
// ctx.pool (optional, tasks/pool.js) shards the fights over a worker pool; without it they run here.
import { optimize as runOptimize, optimizeMore as runOptimizeMore } from '../search/search.js';
import { poolScope } from './pool.js';

export async function optimize(request = {}, { signal, onProgress, onCheckpoint, pool } = {}) {
  const { character, presetId, realm, target, objective, space, effort, seed, powerFloor, resumeFrom, jobId } = request;
  const scope = poolScope(pool);
  try {
    return await runOptimize({ character, presetId, realm, target, objective, space, effort, seed, powerFloor, resumeFrom, jobId }, { signal, onProgress, onCheckpoint, pool: pool && scope.open });
  } finally {
    scope.close();
  }
}

export async function optimizeMore(request = {}, { signal, onProgress, pool } = {}) {
  const { character, result, rowKeys, targetN, seed, round, jobId } = request;
  const scope = poolScope(pool);
  try {
    return await runOptimizeMore({ character, result, rowKeys, targetN, seed, round, jobId }, { signal, onProgress, pool: pool && scope.open });
  } finally {
    scope.close();
  }
}
