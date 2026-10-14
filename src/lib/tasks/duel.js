// Worker task 'duel' (working since E8; extended by F3).
// request: { attacker: Fighter, defender: Fighter, n?: 400, seed?: 1, trace?: boolean, traceSeed?: any }
// result:  pvpWinRate's summary (the ATTACKER's win rate; ties go to the defender), plus `trace` (the
//          DuelEvent rows of one duel seeded hashSeed(traceSeed ?? seed, 'trace')) and `traceResult` when
//          requested. Cancelling returns the partial summary with aborted: true.
// Fighters may carry `formKind` (build/fighter.js) instead of the engine's `form`; features/duel.js
// duelFighter maps it, so any caller can pass a Fighter straight from buildFighter.

import { pvpWinRateAsync } from '../engine/metrics.js';
import { runDuel } from '../engine/pvp/resolver.js';
import { mulberry32, hashSeed } from '../engine/rng.js';
import { duelFighter } from '../features/duel.js';

export async function duel(request, { signal, onProgress } = {}) {
  const { seed = 1, n = 400, trace = false, traceSeed } = request;
  if (!request.attacker || !request.defender) throw new Error('duel: attacker and defender are required');
  const attacker = duelFighter(request.attacker);
  const defender = duelFighter(request.defender);
  const summary = n > 0 ? await pvpWinRateAsync(attacker, defender, { n, seed, signal, onProgress }) : { p: null, lo: null, hi: null, n: 0 };
  if (!trace) return summary;
  const t = runDuel({ attacker, defender, rng: mulberry32(hashSeed(traceSeed ?? seed, 'trace')), log: true });
  return { ...summary, trace: t.log, traceResult: t.result };
}
