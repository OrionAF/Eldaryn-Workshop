/**
 * optimizerWorker.js - Web Worker entry for the build optimizer.
 *
 * Receives ONE search request ({ character, preset, ichorBudget,
 * searchDimensions, objectiveSpec, mode?, relicLevelBoost? }), runs
 * optimize() - or suggestRelics() when mode is 'suggest-relics', or
 * simulateCandidate() when mode is 'verify-candidate' - off the
 * main thread, streams progress back, and posts the result. A { type: 'abort' } message
 * stops the search early with best-so-far (optimize() yields to the event
 * loop every few hundred evals, which is when the abort message gets
 * processed) - the client then still receives a normal 'done' whose result
 * carries `aborted: true`.
 *
 * Messages out: { type: 'progress', progress }  onProgress passthrough
 *               { type: 'done', result }        optimize() result
 *               { type: 'error', message }      search threw
 */

import { optimize, simulateCandidate } from './optimizer.js';
import { suggestRelics } from './relicSuggester.js';
import { objectivesFromSpec, specIsSampled } from './optimizerObjectives.js';

const controller = new AbortController();

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg?.type === 'abort') {
    controller.abort();
    return;
  }
  try {
    const shared = {
      character: msg.character,
      preset: msg.preset,
      ...objectivesFromSpec(msg.objectiveSpec),
      signal: controller.signal,
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    };
    let result;
    if (msg.mode === 'suggest-relics') {
      result = await suggestRelics({
        ...shared,
        relicLevelBoost: msg.relicLevelBoost,
        sampled: specIsSampled(msg.objectiveSpec),
      });
    } else if (msg.mode === 'verify-candidate') {
      // No objective and no search - just one fixed-fidelity re-simulation.
      result = simulateCandidate({
        character: msg.character,
        candidate: msg.candidate,
        iterations: msg.iterations,
        durationSeconds: msg.durationSeconds,
        seed: msg.seed,
      });
    } else {
      result = await optimize({ ...shared, ichorBudget: msg.ichorBudget, searchDimensions: msg.searchDimensions, maxPasses: msg.maxPasses });
    }
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
