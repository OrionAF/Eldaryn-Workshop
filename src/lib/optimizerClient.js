/**
 * optimizerClient.js - main-thread facade for running the build optimizer.
 *
 * runOptimizerTask() prefers a Web Worker (optimizerWorker.js): the search
 * runs off the main thread, so the UI stays smooth with zero yield overhead
 * in the hot loop, progress streams back live, and cancel() aborts the
 * search and resolves with best-so-far (`result.aborted === true`). Where
 * Workers don't exist (jsdom tests, ancient browsers) the same request runs
 * inline through the identical objectivesFromSpec path, cancellable via
 * AbortController.
 *
 * The request must be plain JSON (it crosses the worker boundary): the
 * character/preset are JSON-cloned here, which also detaches Svelte $state
 * proxies.
 */

import { optimize, simulateCandidate } from './optimizer.js';
import { suggestRelics } from './relicSuggester.js';
import { objectivesFromSpec, specIsSampled } from './optimizerObjectives.js';

/**
 * @param {{ character, preset, ichorBudget?, searchDimensions?, objectiveSpec?,
 *           mode?: 'optimize' | 'suggest-relics' | 'verify-candidate',
 *           relicLevelBoost?, candidate?, iterations?, durationSeconds?, seed? }} request
 * @param {{ onProgress?: (p) => void }} hooks
 * @returns {{ promise: Promise<result>, cancel: () => void }}
 */
export function runOptimizerTask(request, { onProgress } = {}) {
  const plain = JSON.parse(JSON.stringify({
    mode: request.mode ?? 'optimize',
    character: request.character,
    preset: request.preset,
    ichorBudget: request.ichorBudget ?? 0,
    searchDimensions: request.searchDimensions ?? {},
    relicLevelBoost: request.relicLevelBoost ?? 0,
    objectiveSpec: request.objectiveSpec ?? { kind: 'pve-fast' },
    maxPasses: request.maxPasses ?? 5, // optimize()'s own default; the linking sim goes deeper
    // 'verify-candidate' only.
    candidate: request.candidate ?? null,
    iterations: request.iterations ?? 5000,
    durationSeconds: request.durationSeconds ?? 60,
    seed: request.seed ?? 1,
  }));

  if (typeof Worker === 'undefined') {
    const controller = new AbortController();
    // 'verify-candidate' is a single bounded simulation: no objective to build,
    // and nothing to abort part-way that would leave a usable partial result.
    if (plain.mode === 'verify-candidate') {
      return { promise: Promise.resolve(simulateCandidate(plain)), cancel: () => {} };
    }
    const shared = {
      character: plain.character,
      preset: plain.preset,
      ...objectivesFromSpec(plain.objectiveSpec),
      signal: controller.signal,
      onProgress,
    };
    const promise =
      plain.mode === 'suggest-relics'
        ? suggestRelics({ ...shared, relicLevelBoost: plain.relicLevelBoost, sampled: specIsSampled(plain.objectiveSpec) })
        : optimize({ ...shared, ichorBudget: plain.ichorBudget, searchDimensions: plain.searchDimensions, maxPasses: plain.maxPasses });
    return { promise, cancel: () => controller.abort() };
  }

  const worker = new Worker(new URL('./optimizerWorker.js', import.meta.url), { type: 'module' });
  let settled = false;
  const promise = new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      settled = true;
      worker.terminate();
      fn(value);
    };
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') onProgress?.(msg.progress);
      else if (msg.type === 'done') finish(resolve, msg.result);
      else if (msg.type === 'error') finish(reject, new Error(msg.message));
    };
    worker.onerror = (event) => finish(reject, new Error(event.message || 'Optimizer worker failed'));
    worker.postMessage(plain);
  });
  // Soft cancel: the worker aborts at its next yield and posts best-so-far.
  const cancel = () => {
    if (!settled) worker.postMessage({ type: 'abort' });
  };
  return { promise, cancel };
}
