/**
 * Tests optimizerClient.js - the main-thread facade. jsdom has no Worker, so these exercise the
 * inline path, which runs the identical task registry the worker does.
 */
import { it, expect, vi, afterEach } from 'vitest';
import { TASKS } from './tasks/index.js';
import { runOptimizerTask } from './optimizerClient.js';
import { fixtureCharacter } from './build/fixtures.js';
import { normaliseCharacter } from './model/index.js';

const EFFORT = { level: 'quick', n0: 8, maxN: 16, randomStarts: 0 };
const RELICS_ONLY = { spec: false, equipmentSet: false, talents: false, pet: false, mount: false, minorGlyphs: false, majorGlyphs: false, relics: true, sigils: false, utility: false, ancient: false, conditions: false, transcendence: false };

function request(extra = {}) {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  return { mode: 'optimize', character: normaliseCharacter(raw), presetId: 'p1', target: { kind: 'dummy', seconds: 10 }, space: RELICS_ONLY, effort: EFFORT, seed: 2, ...extra };
}

it('runs an optimize request inline and resolves with the task result, streaming progress', async () => {
  const progress = [];
  const { promise } = runOptimizerTask(request(), { onProgress: (p) => progress.push(p) });
  const result = await promise;
  expect(result.rows[0].value.est).toBeGreaterThan(result.baseline.value.est);
  expect(progress.length).toBeGreaterThan(0);
});

it('a stale v2: true flag on the request is harmless', async () => {
  const { promise } = runOptimizerTask(request({ v2: true }));
  expect((await promise).status).toBe('done');
});

it('cancel() resolves with best-so-far flagged aborted', async () => {
  const { promise, cancel } = runOptimizerTask(request());
  cancel();
  expect((await promise).aborted).toBe(true);
});

afterEach(() => {
  delete TASKS.stubCheckpoint;
  vi.unstubAllGlobals();
});

it('inline: a task may call ctx.onCheckpoint when the caller passed no hooks', async () => {
  TASKS.stubCheckpoint = async (_req, ctx) => {
    ctx.onCheckpoint({ n: 1 });
    return { ok: true };
  };
  const { promise } = runOptimizerTask({ mode: 'stubCheckpoint' });
  expect(await promise).toEqual({ ok: true });
});

it('falls back inline, honouring cancel(), when worker.postMessage throws', async () => {
  vi.stubGlobal('Worker', class {
    postMessage() { throw new Error('DataCloneError'); }
    terminate() {}
  });
  const { promise, cancel } = runOptimizerTask(request());
  cancel();
  expect((await promise).aborted).toBe(true);
});
