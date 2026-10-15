// Worker task 'statWeights' (backlog §9): the simulated stat weights of one preset.
// request: features/statWeights.js statWeightsRequest() ({base, probes, nDps, nSurvival, seed, seconds,
//          survivalSeconds}); result: runStatWeights()'s {damage, survival, calibration, aborted}.
// Contract: docs/Reference/simulation.md §Stat weights. Progress is {done, total, phases} in fights.
// Cancelling resolves with the bars finished so far and aborted: true. No checkpoint: every fight is
// indexed by (seed, i), so a resumed job re-runs from the start and equals an uninterrupted one.
// The fights run on the job's pool (ctx.pool, tasks/pool.js; inline without one): KERNELS.statWeights.
import { runStatWeights } from '../features/statWeights.js';
import { poolScope } from './pool.js';

export async function statWeights(request, { signal, onProgress, pool } = {}) {
  if (!request?.base) throw new Error('statWeights: base Fighter is required');
  if (!Array.isArray(request.probes)) throw new Error('statWeights: probes are required');
  const { seconds = 60, survivalSeconds = 60 } = request;
  const scope = poolScope(pool);
  let fights = null;
  const sample = (metric, fighter, enemy, from, to, { signal: s, seed }) => {
    fights ??= scope.open('statWeights', { seconds, survivalSeconds });
    return fights.run({ metric, fighter, enemy, seed }, from, to, { signal: s });
  };
  try {
    return await runStatWeights(request, { signal, onProgress, sample });
  } finally {
    scope.close();
  }
}
