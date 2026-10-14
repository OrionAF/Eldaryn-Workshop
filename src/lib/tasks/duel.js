// Worker task 'duel' (working since E8; F3 owns the screen and may extend the request).
// request: { attacker: Fighter, defender: Fighter, n?: 400, seed?: 1, trace?: boolean }
// result:  pvpWinRate's summary, plus `trace` (the DuelEvent rows of one duel seeded hashSeed(seed, 'trace'))
//          when requested. Cancelling returns the partial summary with aborted: true.

import { pvpWinRateAsync } from '../engine/metrics.js';
import { runDuel } from '../engine/pvp/resolver.js';
import { mulberry32, hashSeed } from '../engine/rng.js';

export async function duel(request, { signal, onProgress } = {}) {
  const { attacker, defender, n = 400, seed = 1, trace = false } = request;
  if (!attacker || !defender) throw new Error('duel: attacker and defender are required');
  const summary = await pvpWinRateAsync(attacker, defender, { n, seed, signal, onProgress });
  if (!trace) return summary;
  const t = runDuel({ attacker, defender, rng: mulberry32(hashSeed(seed, 'trace')), log: true });
  return { ...summary, trace: t.log, traceResult: t.result };
}
