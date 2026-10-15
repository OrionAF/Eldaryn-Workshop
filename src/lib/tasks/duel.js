// Worker task 'duel' (working since E8; extended by F3 and U10).
// request: { attacker: Fighter, defender: Fighter, n?: 400, seed?: 1, trace?: boolean, traceSeed?: any,
//            both?: boolean, phaseLabels?: [string, string] }
// result:  pvpWinRate's summary (the ATTACKER's win rate; ties go to the defender), plus `trace` (the
//          DuelEvent rows of one duel seeded hashSeed(traceSeed ?? seed, 'trace')) and `traceResult` when
//          requested. `both: true` also runs the seats swapped (defender attacks) and returns that
//          summary as `swapped` (its p is again the ATTACKER's, i.e. the request's defender).
//          Cancelling returns the partial summary with aborted: true.
// progress: { done, n, phases } with phases in the A.10 shape (one per seat) for the job tray.
// checkpoint: posted once on cancel as { phase, done }. Fights are indexed by (seed, i), so a resume
//          re-runs from fight 0 and equals an uninterrupted run (A.10); nothing else is kept.
// Fighters may carry `formKind` (build/fighter.js) instead of the engine's `form`; features/duel.js
// duelFighter maps it, so any caller can pass a Fighter straight from buildFighter.
// The duels run on the job's pool (ctx.pool, tasks/pool.js; inline without one), KERNELS.duel drawing
// fight i exactly as engine/metrics.js pvpWinRate does; `summary` is that metric's summary.

import { wilson, meanCI, quantile } from '../engine/metrics.js';
import { runDuel } from '../engine/pvp/resolver.js';
import { mulberry32, hashSeed } from '../engine/rng.js';
import { duelFighter } from '../features/duel.js';
import { poolScope } from './pool.js';

const SEATS = ['attacker', 'defender'];

export async function duel(request, { signal, onProgress, onCheckpoint, pool } = {}) {
  const { seed = 1, n = 400, trace = false, traceSeed, both = false, phaseLabels = [] } = request;
  if (!request.attacker || !request.defender) throw new Error('duel: attacker and defender are required');
  const attacker = duelFighter(request.attacker);
  const defender = duelFighter(request.defender);
  const seats = both ? SEATS : SEATS.slice(0, 1);

  const progress = { attacker: 0, defender: 0 };
  const phases = (current) =>
    seats.map((id, i) => ({
      id,
      label: phaseLabels[i] ?? (both ? (i === 0 ? 'Seat 1' : 'Seat 2') : 'Duels'),
      state: i < current ? 'done' : i === current ? 'current' : 'queued',
      done: progress[id],
      total: n,
    }));
  const scope = poolScope(pool);
  let duels = null;
  const run = async (i) => {
    if (!(n > 0)) return { p: null, lo: null, hi: null, n: 0 };
    duels ??= scope.open('duel', { attacker: request.attacker, defender: request.defender });
    const c = await duels.run({ swap: i === 1, seed }, 0, n, {
      signal,
      onProgress: (done) => {
        progress[seats[i]] = done;
        onProgress?.({ done, n, phases: phases(i) });
      },
    });
    return summary(c, c.aborted || signal?.aborted === true);
  };

  let summaryA;
  let swapped = null;
  try {
    summaryA = await run(0);
    if (both && !summaryA.aborted) swapped = await run(1);
  } finally {
    scope.close();
  }
  const aborted = summaryA.aborted === true || swapped?.aborted === true;
  if (aborted) {
    const at = summaryA.aborted ? 0 : 1;
    onCheckpoint?.({ phase: seats[at], done: progress[seats[at]] });
  } else {
    // An empty run reports no per-fight progress; this closing report leaves every phase done.
    for (const id of seats) progress[id] = n;
    onProgress?.({ done: n, n, phases: phases(seats.length) });
  }
  const out = both ? { ...summaryA, swapped, aborted } : summaryA;
  if (!trace) return out;
  const t = runDuel({ attacker, defender, rng: mulberry32(hashSeed(traceSeed ?? seed, 'trace')), log: true });
  return { ...out, trace: t.log, traceResult: t.result };
}

/** engine/metrics.js pvpWinRate's summary over a chunk of KERNELS.duel (the attacker's wins). */
export function summary(c, aborted) {
  const won = c.main[0] ?? [];
  const times = c.side.ms?.[0] ?? [];
  const timedOut = c.side.timedOut?.[0] ?? [];
  const w = wilson(won.reduce((s, x) => s + x, 0), won.length);
  return {
    p: w.p, lo: w.lo, hi: w.hi, n: w.n,
    meanMs: times.length ? meanCI(times).mean : null, p90Ms: quantile(times, 0.9),
    timeoutShare: won.length ? timedOut.reduce((s, x) => s + x, 0) / won.length : null,
    aborted,
  };
}
