// H3: determinism (redesign plan A.1 I8). Result = f(character snapshot, request, seed): the same request
// gives the same result, and a run cancelled at a random progress point then resumed from its checkpoint
// equals the uninterrupted run, bit for bit. J2: the same holds on a worker pool of 1, 2 or 4 fake workers
// whose shards finish out of order (tasks/fakePoolWorker.js), and across pool sizes.
import { describe, it, expect } from 'vitest';
import { forAll, arbCharacter, pick, sample, int } from '../harness/arbitrary.js';
import { HARNESS_SPECS } from '../harness/specs.js';
import { withLegalBaseline } from '../harness/baseline.js';
import { optimize } from './search.js';
import { BLOCKS } from './space.js';
import { stableStringify } from '../engine/metrics.js';
import { fakePoolFactory } from '../tasks/fakePoolWorker.js';
import { poolScope } from '../tasks/pool.js';

const EFFORT = { level: 'quick', n0: 8, maxN: 24, randomStarts: 0 };
const TARGETS = [
  { target: { kind: 'dummy', seconds: 8 } },
  { target: { kind: 'chapter', chapter: 2, level: 3 }, objective: { kind: 'ttk-median' } },
  { target: { kind: 'worldBoss', affinity: 'NONE' } },
];
/** A result without its run metadata (wall clock, pool size); everything else is a function of the request. */
const timeless = (r) => stableStringify({ ...r, stats: { ...r.stats, ms: 0, workers: 0 }, phases: r.phases.map((p) => ({ ...p, ms: 0 })), checkpoint: null });

/** optimize on a fake pool of `size` workers (no pool at all for size 0), its pools closed after. */
async function onPool(size, req, hooks = {}) {
  if (!size) return optimize(req, hooks);
  const scope = poolScope(fakePoolFactory(size, { seed: size + 7, maxDelayMs: 3 }));
  try {
    return await optimize(req, { ...hooks, pool: scope.open });
  } finally {
    scope.close();
  }
}

function request(rng) {
  const character = withLegalBaseline(arbCharacter(rng, { spec: pick(rng, HARNESS_SPECS) }));
  const blocks = sample(rng, BLOCKS.filter((b) => b !== 'sigils'), 2);
  return {
    character,
    presetId: character.activePresetId,
    ...pick(rng, TARGETS),
    space: Object.fromEntries(BLOCKS.map((b) => [b, blocks.includes(b)])),
    effort: EFFORT,
    seed: int(rng, 1, 1e6),
  };
}

describe('optimiser determinism', { timeout: 600000 }, () => {
  it('the same request and seed give the same result; cancel at a random progress point and resume gives it too', async () => {
    const cases = [];
    forAll('determinism', request, (req, rng) => { cases.push({ req, at: rng() }); }, { runs: 4 });
    let cancelled = 0;
    let compared = 0;
    for (const { req, at } of cases) {
      let events = 0;
      const whole = await optimize(req, { onProgress: () => { events += 1; } });
      if (whole.status !== 'done') continue; // a setup blocker has nothing to resume
      expect(timeless(await optimize(req)), 'same request, different result').toBe(timeless(whole));

      // a random progress point inside the run (the number of progress events is a function of the request)
      const cutAt = 1 + Math.floor(at * Math.max(1, events - 1));
      const ctl = new AbortController();
      let seen = 0;
      let checkpoint = null;
      const cut = await optimize(req, {
        signal: ctl.signal,
        onCheckpoint: (c) => { checkpoint = c; },
        onProgress: () => { seen += 1; if (seen === cutAt) ctl.abort(); },
      });
      if (cut.status !== 'cancelled') {
        // the run finished before the cut point: it must still equal the whole run
        expect(timeless(cut)).toBe(timeless(whole));
        compared += 1;
        continue;
      }
      cancelled += 1;
      expect(checkpoint, 'a cancelled run posts a checkpoint').not.toBeNull();
      const resumed = await optimize({ ...req, resumeFrom: checkpoint });
      expect(resumed.warnings.map((w) => w.code)).not.toContain('checkpoint-ignored');
      expect(timeless(resumed), `cut after ${cutAt} progress events: resume differs from the uninterrupted run`).toBe(timeless(whole));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
    expect(cancelled, 'no run was cancelled before it finished').toBeGreaterThan(0);
  });
});

describe('optimiser determinism on a worker pool (J2)', { timeout: 600000 }, () => {
  it('pool sizes 1, 2 and 4 give the no-pool result; cancel on a pool and resume on another size gives it too', async () => {
    const cases = [];
    forAll('determinism', request, (req, rng) => { cases.push({ req, at: rng() }); }, { runs: 4 });
    let compared = 0;
    let cancelled = 0;
    for (const [k, { req, at }] of cases.entries()) {
      let events = 0;
      const whole = await optimize(req, { onProgress: () => { events += 1; } });
      if (whole.status !== 'done') continue;
      for (const size of [1, 2, 4]) {
        const r = await onPool(size, req);
        expect(r.stats.workers).toBe(size);
        expect(timeless(r), `pool of ${size} differs from the run without a pool`).toBe(timeless(whole));
      }
      // cancel on a pool of 2 at a random progress point, resume on a pool of 4 (and the next case the other way)
      const [cutSize, resumeSize] = k % 2 ? [4, 2] : [2, 4];
      const cutAt = 1 + Math.floor(at * Math.max(1, events - 1));
      const ctl = new AbortController();
      let seen = 0;
      let checkpoint = null;
      const cut = await onPool(cutSize, req, {
        signal: ctl.signal,
        onCheckpoint: (c) => { checkpoint = c; },
        onProgress: () => { seen += 1; if (seen === cutAt) ctl.abort(); },
      });
      if (cut.status === 'cancelled') {
        cancelled += 1;
        expect(checkpoint).not.toBeNull();
        const resumed = await onPool(resumeSize, { ...req, resumeFrom: checkpoint });
        expect(timeless(resumed), `cut on ${cutSize} workers, resumed on ${resumeSize}`).toBe(timeless(whole));
      } else expect(timeless(cut)).toBe(timeless(whole));
      compared += 1;
    }
    expect(compared).toBeGreaterThan(0);
    expect(cancelled, 'no pooled run was cancelled before it finished').toBeGreaterThan(0);
  });
});
