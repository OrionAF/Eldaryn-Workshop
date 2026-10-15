import { describe, it, expect } from 'vitest';
import { runTask } from './index.js';
import { runOptimizerTask } from '../optimizerClient.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { BLOCKS } from '../search/space.js';
import { presetPower } from '../build/power.js';

const EFFORT = { level: 'quick', n0: 8, maxN: 16, randomStarts: 0 };
const RELICS_ONLY = Object.fromEntries(BLOCKS.map((b) => [b, b === 'relics']));

function request(extra = {}) {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  return { mode: 'optimize', character: normaliseCharacter(raw), presetId: 'p1', target: { kind: 'dummy', seconds: 10 }, space: RELICS_ONLY, effort: EFFORT, seed: 2, ...extra };
}

describe("task 'optimize'", { timeout: 120000 }, () => {
  it('ignores a stale v2 flag on the request', async () => {
    const r = await runTask('optimize', request({ v2: true }));
    expect(r.status).toBe('done');
  });

  it('runs the optimiser and returns plain JSON that a worker could post', async () => {
    const r = await runTask('optimize', request());
    expect(r.rows[0].value.est).toBeGreaterThan(r.baseline.value.est);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('streams progress through ctx.onProgress and checkpoints through ctx.onCheckpoint', async () => {
    const seen = [];
    const cps = [];
    await runTask('optimize', request(), { onProgress: (p) => seen.push(p.phase), onCheckpoint: (c) => cps.push(c.phase) });
    expect(seen[0]).toBe('screen');
    expect(seen).toContain('confirm');
    expect(cps).toEqual(['search', 'minimise']);
  });

  it('forwards the Combat Power guard: a floor above the baseline fails, one at it is echoed', async () => {
    const req = request();
    const p0 = presetPower(req.character, 'p1').power;
    const above = await runTask('optimize', { ...req, powerFloor: p0 + 1000 });
    expect(above.status).toBe('failed');
    expect(above.baselineViolations.map((v) => v.gate)).toEqual(['powerFloor']);
    const at = await runTask('optimize', { ...req, powerFloor: p0 });
    expect(at.status).toBe('done');
    expect(at.request.powerFloor).toBe(p0);
  });

  it('validates its request', async () => {
    await expect(runTask('optimize', {})).rejects.toThrow(/character is required/);
    await expect(runTask('optimize', request({ objective: { kind: 'ttk-median' } }))).rejects.toThrow(/unknown objective/);
  });

  it('the client facade runs it inline (no Worker in tests); cancel() resolves cancelled with a checkpoint', async () => {
    const progress = [];
    const cps = [];
    const { promise, cancel } = runOptimizerTask(request(), {
      onProgress: (p) => { progress.push(p); if (p.phase === 'minimise') cancel(); },
      onCheckpoint: (c) => cps.push(c),
    });
    const r = await promise;
    expect(r).toMatchObject({ status: 'cancelled', aborted: true, checkpoint: { resumable: true } });
    expect(cps.at(-1).phase).toBe('minimise');
    const resumed = await runTask('optimize', request({ resumeFrom: cps.at(-1) }));
    expect(resumed.status).toBe('done');
  });
});

describe("task 'optimizeMore'", { timeout: 120000 }, () => {
  it('re-measures a finished result through the registry', async () => {
    const req = request();
    const r = await runTask('optimize', req);
    const m = await runTask('optimizeMore', { character: req.character, result: r, targetN: 16 });
    expect(m.more.round).toBe(1);
    expect(m.rows.every((row) => row.value.n === 16)).toBe(true);
  });
});
