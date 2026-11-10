// Worker task 'dropCheck' (F1): the simulated half of Drop Check. The synchronous half (stats before and
// after, closed-form DPS) is features/swap.js prepareSwap(), which the screen runs on the main thread.
//
// request: {
//   items: [{presetId, before: Fighter, after: Fighter, baseKey?, goalIds?}],  Fighters from prepareSwap, plain
//                                     JSON; items sharing a baseKey share one "before"; goalIds limits an item's goals
//   goals: [{id, target, objective, partner?}],  Optimiser targets and objectives (search/objectives.js), Drop
//                                      Check's kinds; `partner` a Celestial roster partner, resolved on the main thread
//   character?,                        what resolveTarget reads (PVP opponents, the Fortress server)
//   seed?: 1, precision?: 'quick'|'standard'|'thorough', maxN?,
// }
// result: { results: [{presetId, goals: [{goalId, label, unit, before, after, delta}], errors?}], aborted }
//   each delta is the common-random-number paired contrast (after - before) at the look where it resolved
//   ('better' | 'worse' | 'equivalent') or at maxN ('unresolved'). Contract: simulation.md §Drop Check.
// Cancelling resolves with the finished presets and aborted: true.
// The fights run on the job's pool (ctx.pool, tasks/pool.js; inline without one): one KERNELS.objective pool
// per goal, prepared once per worker with that goal's target and objective, as the Optimiser's are.
import { runSwapMetrics } from '../features/swap.js';
import { poolScope } from './pool.js';

export async function dropCheck(request, { signal, onProgress, pool } = {}) {
  const { items, goals } = request ?? {};
  if (!Array.isArray(items)) throw new Error('dropCheck: items is required');
  if (!Array.isArray(goals)) throw new Error('dropCheck: goals is required');
  for (const it of items) {
    if (!it?.before || !it?.after) throw new Error('dropCheck: every item needs before and after Fighters');
  }
  const { character = null, partner = null } = request;
  const scope = poolScope(pool);
  const pools = new Map();
  const sampleFor = (goal) => (fighter, { seed, from, to, signal: s }) => {
    if (!pools.has(goal.id)) pools.set(goal.id, scope.open('objective', { target: goal.target, objective: goal.objective, character, partner: goal.partner ?? partner }));
    return pools.get(goal.id).run({ fighter, seed }, from, to, { signal: s });
  };
  try {
    // a finished goal's workers go before the next goal's start, so at most one pool runs at a time
    const onGoalDone = (goal) => {
      pools.get(goal.id)?.close();
      pools.delete(goal.id);
    };
    return await runSwapMetrics(items, request, { signal, onProgress, sampleFor, onGoalDone });
  } finally {
    scope.close();
  }
}
