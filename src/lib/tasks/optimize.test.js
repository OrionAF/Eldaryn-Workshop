import { describe, it, expect } from 'vitest';
import { runTask } from './index.js';
import { runOptimizerTask } from '../optimizerClient.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';

const BUDGET = { n1: 4, n2: 8, maxEvals: 20, finalists: 4, maxPasses: 1, topN: 5, width: 2 };
const RELICS_ONLY = { equipmentSet: false, talentSet: false, talents: false, pet: false, mount: false, glyphs: false, relics: true, sigils: false, utility: false, ancient: false, conditions: false, transcendence: false };

function request(extra = {}) {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  return { mode: 'optimize', character: normaliseCharacter(raw), presetId: 'p1', space: RELICS_ONLY, budget: BUDGET, seed: 2, ...extra };
}

describe("task 'optimize'", () => {
  it('ignores a stale v2 flag on the request', async () => {
    const r = await runTask('optimize', request({ v2: true }));
    expect(r.tier).toBe(2);
  });

  it('runs the optimiser and returns plain JSON that a worker could post', async () => {
    const r = await runTask('optimize', request());
    expect(r.tier).toBe(2);
    expect(r.results[0].value).toBeGreaterThan(r.baseline.value);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('streams progress through ctx.onProgress', async () => {
    const seen = [];
    await runTask('optimize', request(), { onProgress: (p) => seen.push(p.phase) });
    expect(seen[0]).toBe('search');
    expect(seen).toContain('final');
  });

  it('validates its request', async () => {
    await expect(runTask('optimize', {})).rejects.toThrow(/character is required/);
    await expect(runTask('optimize', request({ objective: { kind: 'ttk-median' } }))).rejects.toThrow(/cannot score/);
    await expect(runTask('optimize', request({ target: { kind: 'chapter', chapter: 1, level: 1 }, objective: { kind: 'ttk-median' } }))).resolves.toBeTruthy();
  });

  it('the client facade runs it inline (no Worker in tests) and JSON-clones the request', async () => {
    const progress = [];
    const { promise } = runOptimizerTask(request(), { onProgress: (p) => progress.push(p) });
    const r = await promise;
    expect(r.aborted).toBe(false);
    expect(r.results.length).toBeGreaterThan(1);
    expect(progress.length).toBeGreaterThan(0);
  });

  it('cancel() resolves with best-so-far and aborted: true, never worse than the current build', async () => {
    const { promise, cancel } = runOptimizerTask(request({ budget: { ...BUDGET, maxEvals: 500, maxMs: 60000 } }), {
      onProgress: (p) => { if (p.phase === 'search' && p.evals >= 2) cancel(); },
    });
    const r = await promise;
    expect(r.aborted).toBe(true);
    expect(r.tier).toBe(1);
    expect(r.results[0].score).toBeGreaterThanOrEqual(r.baseline.score);
  });
});
