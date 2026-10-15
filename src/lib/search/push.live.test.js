// Push through the real build space, objectives and optimiser (simulation.md §Push): the result shape,
// the routed worker task, and cancel + resume through the Push checkpoint (an optimisation cancelled
// mid-run resumes from its own checkpoint) equal to the uninterrupted run.
import { describe, it, expect } from 'vitest';
import { push, PUSH_CHECKPOINT_SCHEMA } from './push.js';
import { optimize } from './search.js';
import { BLOCKS } from './space.js';
import { runTask } from '../tasks/index.js';
import { fixtureCharacter } from '../build/fixtures.js';

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const timeless = (r) => ({ ...r, stats: { ...r.stats, ms: 0 }, phases: r.phases.map((p) => ({ ...p, ms: 0 })) });
// the Warrior fixture is at about 90 % on campaign level 9-1: one relic or pet change makes it clear
const REQUEST = {
  character: fixtureCharacter('WARRIOR'), presetId: 'p1', target: { kind: 'chapter', chapter: 9, level: 1 },
  objective: { kind: 'push', target: 0.9 }, space: only('relics', 'pet'), effort: { level: 'quick', n0: 8, maxN: 256, randomStarts: 0 }, seed: 1,
};

describe('Push, live', () => {
  it('finds the fewest-changes build for the deepest step, resumes a cancel exactly, and runs as the optimize task', async () => {
    const full = await push(REQUEST);
    expect(full.status).toBe('done');
    expect(full.objective).toMatchObject({ kind: 'push', target: 0.9 });
    expect(full.push).toMatchObject({ status: 'pushed', target: 0.9, ladder: { kind: 'chapter', label: 'Campaign', size: 110 }, start: { index: 80, label: 'level 9-1' } });
    expect(full.push.reached.deepest).toBeGreaterThanOrEqual(80);
    expect(full.push.baseline.deepest ?? -1).toBeLessThan(full.push.reached.deepest);
    expect(full.headline.text).toMatch(/^Reaches level \d+-\d+ \(now: /);
    // the suggested build is a row Apply can write: its changes, measured where it was found
    expect(full.rows).toHaveLength(1);
    const row = full.rows[0];
    expect(row.key).toBe(full.push.reached.key);
    expect(row.changes.length).toBeGreaterThan(0);
    expect(row.writes.length).toBeGreaterThan(0);
    expect(row.aux.meetsTarget).toBe(true);
    expect(full.baseline.isBaseline).toBe(true);
    expect(full.phases.map((p) => p.id)).toEqual(['climb', 'screen', 'optimise', 'confirm']);
    expect(full.phases.find((p) => p.id === 'optimise').fights).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(full))).toEqual(full);

    // cancel inside the per-step optimisation, then resume from the Push checkpoint
    const ctl = new AbortController();
    let cp = null;
    const steps = [];
    const cut = await push({ ...REQUEST, jobId: 'j' }, {
      signal: ctl.signal,
      onCheckpoint: (c) => { cp = c; },
      onProgress: (p) => {
        steps.push(p.steps);
        if (p.phase === 'optimise' && p.block.includes(':')) ctl.abort();
      },
    });
    expect(cut).toMatchObject({ status: 'cancelled', aborted: true, checkpoint: { jobId: 'j', resumable: true } });
    expect(cp.schema).toBe(PUSH_CHECKPOINT_SCHEMA);
    expect(cp.inner?.checkpoint?.schema).toBe('optimiser-checkpoint/1');
    expect(steps.at(-1)[0]).toMatchObject({ label: 'Level 9-1', state: 'current' });
    const resumed = await push({ ...REQUEST, resumeFrom: cp });
    expect(timeless(resumed)).toEqual(timeless(full));

    // the optimize task routes a push objective here; optimize() itself refuses it
    const viaTask = await runTask('optimize', { mode: 'optimize', ...REQUEST });
    expect(timeless(viaTask)).toEqual(timeless(full));
    await expect(optimize(REQUEST)).rejects.toThrow(/push/);
  }, 120_000);
});
