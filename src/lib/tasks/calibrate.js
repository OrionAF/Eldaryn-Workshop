// Worker task 'calibrate': a short benchmark of this device's fight speed (S2). Contract:
// docs/Reference/simulation.md §Worker pool (the pool it measures); the stored shape is lib/calibration.js.
//
// request: { fighter: Fighter (PVE, buildFighter),
//            duel?: {attacker: Fighter, defender: Fighter}   a duel pair; omit to skip the duel kind,
//            budgetMs?: 6000   the whole benchmark, split over the kinds, workers?: pool size (set by the client) }
// result:  { fightsPerSec: {dummy, dungeon, duel?}, workers, elapsedMs, aborted }
//   dummy: a 60 s fight against the training dummy; dungeon: dungeon_1 step 1 survival fight (the PVE mob
//   fights of Drop Check and Oblivion Floors); duel: one PVP duel. Seeds are fixed, so only the clock varies.
// Each kind first runs one warm-up batch (workers start and prepare), which is not timed, then batches
// until its slice of the budget is spent. Cancel returns the kinds finished so far with aborted: true.
// progress: { done, n, phases } (A.10 shape, one phase per kind) in milliseconds of the budget.
import { dungeonMobs } from '../engine/pve/enemies.js';
import { MIN_SHARD, poolScope } from './pool.js';

export const DEFAULT_BUDGET_MS = 6000;
/** Length of the dummy and dungeon benchmark fights (s); search/estimate.js scales other windows by it. */
export const CALIBRATION_FIGHT_SECONDS = 60;
const SECONDS = CALIBRATION_FIGHT_SECONDS;
const now = () => globalThis.performance?.now?.() ?? Date.now();

export async function calibrate(request, { signal, onProgress, pool } = {}) {
  const { fighter, duel = null, budgetMs = DEFAULT_BUDGET_MS } = request ?? {};
  if (!fighter) throw new Error('calibrate: fighter is required');
  const mobs = dungeonMobs('dungeon_1', 1);
  const kinds = [
    { id: 'dummy', label: 'Training dummy', kernel: 'swap', setup: { seconds: SECONDS }, args: { metric: 'sim', fighter, seed: 1 } },
    { id: 'dungeon', label: 'Dungeon step', kernel: 'swap', setup: { enemy: { mobs }, survivalSeconds: SECONDS }, args: { metric: 'survival', fighter, seed: 1 } },
    ...(duel ? [{ id: 'duel', label: 'Duel', kernel: 'duel', setup: duel, args: { swap: false, seed: 1 } }] : []),
  ];
  const slice = budgetMs / kinds.length;
  const fightsPerSec = {};
  const phases = (current, spent = 0) => kinds.map((k, i) => ({
    id: k.id, label: k.label, state: i < current ? 'done' : i === current ? 'current' : 'queued',
    done: i < current ? slice : i === current ? Math.min(slice, spent) : 0, total: slice,
  }));
  const scope = poolScope(pool);
  let workers = 1;
  let aborted = signal?.aborted === true;
  const started = now();
  try {
    for (let i = 0; i < kinds.length && !aborted; i++) {
      const k = kinds[i];
      const fights = scope.open(k.kernel, k.setup);
      workers = fights.workers ?? fights.size ?? 1;
      const batch = Math.max(1, workers) * MIN_SHARD;
      let at = 0;
      const warm = await fights.run(k.args, at, at + batch, { signal });
      if (warm.aborted) { aborted = true; break; }
      at += batch;
      const t0 = now();
      let done = 0;
      while (now() - t0 < slice) {
        const c = await fights.run(k.args, at, at + batch, { signal });
        if (c.aborted) { aborted = true; break; }
        at += batch;
        done += batch;
        onProgress?.({ done: Math.round(now() - started), n: budgetMs, phases: phases(i, now() - t0) });
      }
      if (aborted) break;
      const secs = (now() - t0) / 1000;
      if (done > 0 && secs > 0) fightsPerSec[k.id] = done / secs;
    }
  } finally {
    scope.close();
  }
  if (!aborted) onProgress?.({ done: budgetMs, n: budgetMs, phases: phases(kinds.length) });
  return { fightsPerSec, workers, elapsedMs: Math.round(now() - started), aborted };
}
