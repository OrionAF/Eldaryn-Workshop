// Worker task 'dropDeepCheck': Drop Check's deep check (features/deepCheck.js): two Optimiser runs, with and without
// the drop, and a confirmation on a fresh seed. Request and result: features/deepCheck.js and simulation.md §Drop
// Check, Deep check. Each phase gets its own pool scope on the job's pool (ctx.pool, tasks/pool.js; inline without
// one), closed when the phase ends, so the phases never hold idle workers at once. Cancelling resolves with what
// finished (`partial: true`).
import { deepCheck } from '../features/deepCheck.js';
import { poolScope } from './pool.js';

export async function dropDeepCheck(request, { signal, onProgress, pool } = {}) {
  const scopes = [];
  /** A scope for one phase: `open` as the optimize task passes it, `sampleFor` for the confirmation, `close`. */
  const phaseScope = () => {
    const scope = poolScope(pool);
    scopes.push(scope);
    const pools = new Map();
    return {
      open: pool ? scope.open : undefined,
      sampleFor: pool
        ? (goal) => (fighter, { seed, from, to, signal: s }) => {
          if (!pools.has(goal.id)) pools.set(goal.id, scope.open('objective', { target: goal.target, objective: goal.objective, character: request.character, partner: goal.partner ?? null }));
          return pools.get(goal.id).run({ fighter, seed }, from, to, { signal: s });
        }
        : undefined,
      close: () => scope.close(),
    };
  };
  try {
    return await deepCheck(request, { signal, onProgress, phaseScope });
  } finally {
    for (const s of scopes) s.close();
  }
}
