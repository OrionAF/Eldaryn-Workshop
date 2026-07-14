/**
 * optimizerWorker.js - Web Worker entry for the build optimizer.
 *
 * Receives ONE search request ({ character, preset, ichorBudget,
 * searchDimensions, objectiveSpec }), runs optimize() off the main thread,
 * streams progress back, and posts the result. A { type: 'abort' } message
 * stops the search early with best-so-far (optimize() yields to the event
 * loop every few hundred evals, which is when the abort message gets
 * processed) - the client then still receives a normal 'done' whose result
 * carries `aborted: true`.
 *
 * Messages out: { type: 'progress', progress }  onProgress passthrough
 *               { type: 'done', result }        optimize() result
 *               { type: 'error', message }      search threw
 */

import { optimize } from './optimizer.js';
import { objectivesFromSpec } from './optimizerObjectives.js';

const controller = new AbortController();

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg?.type === 'abort') {
    controller.abort();
    return;
  }
  try {
    const result = await optimize({
      character: msg.character,
      preset: msg.preset,
      ichorBudget: msg.ichorBudget,
      searchDimensions: msg.searchDimensions,
      ...objectivesFromSpec(msg.objectiveSpec),
      signal: controller.signal,
      onProgress: (progress) => self.postMessage({ type: 'progress', progress }),
    });
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
