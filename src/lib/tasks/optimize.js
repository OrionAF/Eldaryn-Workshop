// Worker tasks 'optimize' and 'optimizeMore' (A4): the build optimiser (search/search.js).
//
// optimize request (plain JSON; a stale `v2: true` flag and retired `budget` keys are ignored):
//   { character, partner?, presetId?, realm?, target?, objective?, space?, effort?, seed?, powerFloor?, resumeFrom?, jobId? }
//   `partner` is a Celestial roster partner, resolved by the caller (search/celestialObjective.js resolveRosterPartner).
//   An objective {kind: 'push'} runs the Push goal (search/push.js, simulation.md §Push) instead.
// optimizeMore request: { character, partner?, result, rowKeys?, targetN, seed?, round? }
// Results, progress and checkpoint shapes: docs/Reference/simulation.md §Search, §Result.
// ctx = {signal, onProgress, onCheckpoint}; on abort a task posts its checkpoint, then resolves with
// status 'cancelled' (`aborted: true`).
// ctx.pool (optional, tasks/pool.js) shards the fights over a worker pool; without it they run here.
import { optimize as runOptimize, optimizeMore as runOptimizeMore } from '../search/search.js';
import { push as runPush, PUSH_KIND } from '../search/push.js';
import { poolScope } from './pool.js';

export async function optimize(request = {}, { signal, onProgress, onCheckpoint, pool } = {}) {
  const { character, partner, presetId, realm, target, objective, space, effort, seed, powerFloor, resumeFrom, jobId } = request;
  const scope = poolScope(pool);
  try {
    const run = objective?.kind === PUSH_KIND ? runPush : runOptimize;
    return await run({ character, partner, presetId, realm, target, objective, space, effort, seed, powerFloor, resumeFrom, jobId }, { signal, onProgress, onCheckpoint, pool: pool && scope.open });
  } finally {
    scope.close();
  }
}

export async function optimizeMore(request = {}, { signal, onProgress, pool } = {}) {
  const { character, partner, result, rowKeys, targetN, seed, round, jobId } = request;
  const scope = poolScope(pool);
  try {
    return await runOptimizeMore({ character, partner, result, rowKeys, targetN, seed, round, jobId }, { signal, onProgress, pool: pool && scope.open });
  } finally {
    scope.close();
  }
}
