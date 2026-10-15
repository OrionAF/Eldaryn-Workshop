// Worker task 'dropCheck' (F1): the simulated half of Drop Check. The synchronous half (stats before and
// after, closed-form DPS) is features/swap.js prepareSwap(), which the screen runs on the main thread.
//
// request: {
//   items: [{presetId, before: Fighter, after: Fighter, baseKey?}],  Fighters from prepareSwap, plain JSON;
//                                                                 items sharing a baseKey share one "before" run
//   sim?: true, seconds?: 60, nSim?: 32,                          sim DPS vs a training dummy
//   enemy?: {mobs: MobSpec[], oblivion?: boolean},                survival target (buildEnemy)
//   survivalSeconds?: 60, nSurvival?: 200,
//   opponents?: [{id, name, fighter: Fighter}], nPvp?: 64,        PVP win rate as the attacker (dropOpponents)
//   seed?: 1, precision?: 'quick'|'standard'|'thorough', maxN?,   nSim / nSurvival / nPvp are the first look
// }                                                               of each sequential comparison, maxN its end
// result: { results: [{presetId, sim?, survival?, pvp?: [...]}], aborted }
//   each metric is {before: {mean, lo, hi, n}, after: {...}, delta: {delta, lo, hi, n, significant, verdict, ...}},
//   the delta being the common-random-number paired difference (after - before) at the look where it
//   resolved ('better' | 'worse' | 'equivalent') or at maxN ('unresolved'). Contract: simulation.md §Drop Check.
// Cancelling resolves with the finished presets and aborted: true.
// The fights run on the job's pool (ctx.pool, tasks/pool.js; inline without one): KERNELS.swap, prepared
// once per worker with the dummy length, the survival enemy and the opponents.
import { runSwapMetrics } from '../features/swap.js';
import { poolScope } from './pool.js';

export async function dropCheck(request, { signal, onProgress, pool } = {}) {
  const { items } = request ?? {};
  if (!Array.isArray(items)) throw new Error('dropCheck: items is required');
  for (const it of items) {
    if (!it?.before || !it?.after) throw new Error('dropCheck: every item needs before and after Fighters');
  }
  const { seconds = 60, enemy = null, survivalSeconds = 60, opponents = [], seed = 1 } = request;
  const scope = poolScope(pool);
  let fights = null;
  const sampleRange = (metric, fighter, from, to, o) => {
    fights ??= scope.open('swap', { seconds, enemy, survivalSeconds, opponents });
    return fights.run({ metric, fighter, seed }, from, to, o);
  };
  try {
    return await runSwapMetrics(items, request, { signal, onProgress, sampleRange });
  } finally {
    scope.close();
  }
}
