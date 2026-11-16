// Worker task 'dropCombo': the loot bag's best combination (features/dropCombo.js): the batch's own alone pass,
// then one pass per accepted upgrade, then a confirmation on a fresh seed. Request and result:
// features/dropCombo.js and simulation.md §Drop Check, Best combination. The fights run on the job's pool as the
// 'dropCheck' task's do (tasks/dropCheck.js): one objective pool per goal, opened when a pass first needs it and
// closed when that pass is done with the goal, so at most one pool runs at a time.
// Cancelling resolves with the finished alone pass and the picks so far (`aborted: true`).
import { dropCombo as runCombo } from '../features/dropCombo.js';
import { poolScope } from './pool.js';

export async function dropCombo(request, { signal, onProgress, pool } = {}) {
  const scope = poolScope(pool);
  const pools = new Map();
  const { character = null, partner = null } = request ?? {};
  const sampleFor = (goal) => (fighter, { seed, from, to, signal: s }) => {
    if (!pools.has(goal.id)) pools.set(goal.id, scope.open('objective', { target: goal.target, objective: goal.objective, character, partner: goal.partner ?? partner }));
    return pools.get(goal.id).run({ fighter, seed }, from, to, { signal: s });
  };
  const onGoalDone = (goal) => {
    pools.get(goal.id)?.close();
    pools.delete(goal.id);
  };
  try {
    return await runCombo(request, { signal, onProgress, sampleFor, onGoalDone });
  } finally {
    scope.close();
  }
}
