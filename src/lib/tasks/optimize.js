// Worker task 'optimize' (F2a): the PVE build optimiser (search/search.js optimizeBuild).
//
// Request (plain JSON; a stale `v2: true` flag is ignored):
//   { character, presetId?, realm?, target?, objective?, space?, budget?, seed? }
// Field meanings: search/search.js optimizeBuild. `target: {kind: 'pvp', opponentIds, seats}` with
// `objective: {kind: 'pvp-winrate'}` scores win rate vs the character's saved opponents (search/pvpObjective.js). Result: its OptimiserResult (plain JSON).
// ctx = {signal, onProgress}; abort resolves with best-so-far and `aborted: true`.
// Progress messages: {phase: 'search', evals, best, dimension} then {phase: 'final', done, total}.
import { optimizeBuild } from '../search/search.js';

export async function optimize(request = {}, { signal, onProgress } = {}) {
  const { character, presetId, realm, target, objective, space, budget, seed } = request;
  return optimizeBuild({ character, presetId, realm, target, objective, space, budget, seed, signal, onProgress });
}
