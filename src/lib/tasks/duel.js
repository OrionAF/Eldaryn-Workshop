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

import { pvpWinRateAsync } from '../engine/metrics.js';
import { runDuel } from '../engine/pvp/resolver.js';
import { mulberry32, hashSeed } from '../engine/rng.js';
import { duelFighter } from '../features/duel.js';

const SEATS = ['attacker', 'defender'];

export async function duel(request, { signal, onProgress, onCheckpoint } = {}) {
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
  const run = (a, d, i) =>
    n > 0
      ? pvpWinRateAsync(a, d, {
          n, seed, signal,
          onProgress: (p) => {
            progress[seats[i]] = p.done;
            onProgress?.({ ...p, phases: phases(i) });
          },
        })
      : { p: null, lo: null, hi: null, n: 0 };

  const summary = await run(attacker, defender, 0);
  let swapped = null;
  if (both && !summary.aborted) swapped = await run(defender, attacker, 1);
  const aborted = summary.aborted || swapped?.aborted === true;
  if (aborted) {
    const at = summary.aborted ? 0 : 1;
    onCheckpoint?.({ phase: seats[at], done: progress[seats[at]] });
  } else {
    // A memoised seat reports no per-fight progress; this closing report leaves every phase done.
    for (const id of seats) progress[id] = n;
    onProgress?.({ done: n, n, phases: phases(seats.length) });
  }
  const out = both ? { ...summary, swapped, aborted } : summary;
  if (!trace) return out;
  const t = runDuel({ attacker, defender, rng: mulberry32(hashSeed(traceSeed ?? seed, 'trace')), log: true });
  return { ...out, trace: t.log, traceResult: t.result };
}
