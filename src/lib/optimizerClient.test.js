/**
 * Tests optimizerClient.js - the main-thread facade. jsdom has no Worker, so these exercise the
 * inline path, which runs the identical task registry the worker does.
 */
import { it, expect } from 'vitest';
import { runOptimizerTask } from './optimizerClient.js';
import { fixtureCharacter } from './build/fixtures.js';
import { normaliseCharacter } from './model/index.js';

const BUDGET = { n1: 4, n2: 8, maxEvals: 20, finalists: 4, maxPasses: 1, topN: 5, width: 2 };
const RELICS_ONLY = { equipmentSet: false, talentSet: false, talents: false, pet: false, mount: false, glyphs: false, relics: true, sigils: false, utility: false, ancient: false, conditions: false, transcendence: false };

function request(extra = {}) {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  return { mode: 'optimize', character: normaliseCharacter(raw), presetId: 'p1', space: RELICS_ONLY, budget: BUDGET, seed: 2, ...extra };
}

it('runs an optimize request inline and resolves with the task result, streaming progress', async () => {
  const progress = [];
  const { promise } = runOptimizerTask(request(), { onProgress: (p) => progress.push(p) });
  const result = await promise;
  expect(result.results[0].value).toBeGreaterThan(result.baseline.value);
  expect(progress.length).toBeGreaterThan(0);
});

it('a stale v2: true flag on the request is harmless', async () => {
  const { promise } = runOptimizerTask(request({ v2: true }));
  expect((await promise).tier).toBe(2);
});

it('cancel() resolves with best-so-far flagged aborted', async () => {
  const { promise, cancel } = runOptimizerTask(request());
  cancel();
  expect((await promise).aborted).toBe(true);
});
