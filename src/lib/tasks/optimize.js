// Worker task 'optimize' (F2a): the PVE build optimiser (search/search.js optimizeBuild).
//
// Request (plain JSON; the client sends it with `mode: 'optimize', v2: true` until X1 drops the legacy path):
//   { character, presetId?, realm?, target?, objective?, space?, budget?, seed? }
// Field meanings: search/search.js optimizeBuild. Result: its OptimiserResult (plain JSON).
// ctx = {signal, onProgress}; abort resolves with best-so-far and `aborted: true`.
// Progress messages: {phase: 'search', evals, best, dimension} then {phase: 'final', done, total}.
import { optimizeBuild } from '../search/search.js';

export async function optimize(request = {}, { signal, onProgress } = {}) {
  const { character, presetId, realm, target, objective, space, budget, seed } = request;
  return optimizeBuild({ character, presetId, realm, target, objective, space, budget, seed, signal, onProgress });
}
