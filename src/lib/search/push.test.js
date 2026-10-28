// Push (backlog §10 item 1, simulation.md §Push): the climb, the per-rung optimisation, the stop rule,
// confirm, determinism and resume, on a synthetic ladder whose per-rung clear rates are known (a mocked
// fight kernel: build b wins fight i of a stage iff u_i < p_b(rung), u_i from the stage seed).
import { describe, it, expect } from 'vitest';
import { pushCore, ladderOf, pushBlock } from './push.js';
import { setOf, AbortError } from './sampler.js';
import { hashSeed, mulberry32 } from '../engine/rng.js';

const EFFORT = { n0: 16, maxN: 4096, delta: 0.01, alpha: 0.05 };
const TAU = 0.9;

/**
 * A synthetic environment. `builds`: {key: {changes, p: number[] per rung}}; `near`: {key: [keys one change
 * away]}. The optimiser stub returns what a correct optimiser must: the fewest-changes build whose true
 * rate at the rung is at least the target, 'already' when that is the current build, else 'not-reached'.
 */
function synthEnv(builds, near, { size, start = 0, onSample, optimiseHook } = {}) {
  const calls = { optimise: [], fights: 0 };
  const rungs = Array.from({ length: size }, (_, i) => ({ key: `r${i}`, short: `step ${i + 1}`, spec: { step: i + 1 } }));
  const env = {
    rungs, start, baseline: { key: 'B' },
    keyOf: (b) => b.key,
    async getSet(b, r, stage, n) {
      onSample?.();
      calls.fights += n;
      const p = builds[b.key].p[r];
      return setOf([Array.from({ length: n }, (_, i) => (mulberry32(hashSeed(stage.seed, i))() < p ? 1.5 : 0.5))]);
    },
    neighbours: (b) => (near[b.key] ?? []).map((key) => ({ key })),
    async optimise(r, o) {
      calls.optimise.push({ r, resumeFrom: o.resumeFrom ?? null, warm: o.warmStarts?.length ?? 0 });
      const hooked = await optimiseHook?.(r, o);
      if (hooked) return hooked;
      const ok = Object.entries(builds).filter(([, b]) => b.p[r] >= TAU).sort((a, b) => a[1].changes - b[1].changes);
      if (!ok.length) return { status: 'not-reached', fights: 100, best: { key: 'B', est: 0, lo: 0, hi: 0.01, n: 100 } };
      const [key] = ok[0];
      if (key === 'B') return { status: 'already', fights: 100 };
      return { status: 'reached', fights: 100, build: { key }, row: { key, changes: Array(builds[key].changes).fill({}) }, baseline: { key: 'B' } };
    },
  };
  return { env, calls };
}

const LADDER = {
  B: { changes: 0, p: [1, 1, 1, 0.97, 0.5, 0, 0, 0] },
  X1: { changes: 1, p: [1, 1, 1, 1, 0.99, 0.6, 0, 0] },
  X3: { changes: 2, p: [1, 1, 1, 1, 0.95, 0.3, 0, 0] },
  X2: { changes: 2, p: [1, 1, 1, 1, 1, 0.99, 0.98, 0.2] },
};
const NEAR = { B: ['X1', 'X3'], X1: ['B', 'X2'], X2: ['X1'], X3: ['B'] };
const opts = (o = {}) => ({ tau: TAU, effort: EFFORT, seed: 7, ...o });

describe('Push on a synthetic ladder', () => {
  it('climbs the current build, optimises one rung deeper, climbs the found build, and stops by the stated rule', async () => {
    const { env, calls } = synthEnv(LADDER, NEAR, { size: 8 });
    const r = await pushCore(env, opts());
    expect(r.status).toBe('done');
    expect(r.baseline.searched).toBe(3); // the current build clears steps 1-4
    // optimised at step 5 (fewest changes: X1, not X3) and at step 6 (X2); never at step 8
    expect(calls.optimise.map((c) => c.r)).toEqual([4, 5]);
    // step 6 starts from step 5's optimum too (a warm start); step 5 had only the current build
    expect(calls.optimise.map((c) => c.warm)).toEqual([0, 1]);
    expect(r.milestones.map((m) => [m.key, m.searched])).toEqual([['B', 3], ['X1', 4], ['X2', 6]]);
    expect(r.best).toMatchObject({ key: 'X2', searched: 6, foundAt: 5 });
    expect(r.best.row.key).toBe('X2');
    // step 8: no build one change from B or X2 comes plausibly near 90 %, so it is not optimised
    expect(r.stop).toMatchObject({ rung: 7, reason: 'screen' });
    expect(r.stop.best.hi).toBeLessThan(TAU);
    // confirmed on fresh fights, from the start rung up
    expect(r.baseline.confirmed.deepest).toBe(3);
    expect(r.best.confirmed.deepest).toBe(6);
    expect(r.contradictions).toEqual([]);
    const confirms = r.probes.filter((p) => p.role === 'confirm');
    expect(confirms.filter((p) => p.key === 'B').map((p) => p.rung)).toEqual([0, 1, 2, 3]);
    expect(confirms.filter((p) => p.key === 'X2').map((p) => p.rung)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // two reported builds share alpha
    expect(r.best.confirmed.alpha).toBeCloseTo(0.025, 12);
  });

  it('the result block says how deep each build goes and where the climb stopped', async () => {
    const { env } = synthEnv(LADDER, NEAR, { size: 8 });
    const core = await pushCore(env, opts());
    const ladder = { kind: 'dungeon', label: 'Dungeon X', rungs: env.rungs, start: 0 };
    const b = pushBlock(ladder, TAU, core);
    expect(b).toMatchObject({
      status: 'pushed',
      baseline: { deepest: 3, label: 'step 4' },
      reached: { deepest: 6, label: 'step 7', key: 'X2', foundAt: 5, foundLabel: 'step 6' },
      stop: { index: 7, label: 'step 8', reason: 'screen' },
    });
    expect(b.text).toMatch(/^Reaches step 7 \(now: step 4\) at 90%\. Step 8 is not reached at this effort/);
    expect(b.rungs.map((x) => x.label)).toEqual(['step 1', 'step 2', 'step 3', 'step 4', 'step 5', 'step 6', 'step 7', 'step 8']);
    expect(b.rungs[3]).toMatchObject({ current: 'clears', build: 'clears' });
    expect(b.rungs[4]).toMatchObject({ current: 'fails' });
  });

  it('stall case: every build at 0 % on the next rung ends at the screen in bounded fights, never optimised', async () => {
    const zero = { B: { changes: 0, p: [1, 1, 1, 0, 0] }, Y: { changes: 1, p: [1, 1, 1, 0, 0] }, Z: { changes: 1, p: [1, 1, 1, 0.002, 0] } };
    const { env, calls } = synthEnv(zero, { B: ['Y', 'Z'] }, { size: 5 });
    const r = await pushCore(env, opts());
    expect(calls.optimise).toEqual([]);
    expect(r.stop).toMatchObject({ rung: 3, reason: 'screen' });
    expect(r.stop.best.est).toBeLessThan(0.1);
    const s = r.log.find((e) => e.kind === 'screen').out;
    expect(s).toMatchObject({ go: false, reason: 'below', builds: 3, pairs: 2 });
    // showing each change flat (less than delta) costs about z^2 / delta fights per build, once per
    // build: a few thousand fights, not the millions of a full-space win-rate run
    const screenFights = r.log.filter((e) => e.kind === 'screen').flatMap((e) => e.gets).reduce((a, [, n]) => a + n, 0);
    expect(screenFights).toBeLessThanOrEqual(3 * 2048);
    const b = pushBlock({ kind: 'dungeon', label: 'D', rungs: env.rungs, start: 0 }, TAU, r);
    expect(b.status).toBe('no-gain');
    expect(b.text).toMatch(/already reaches step 3 at 90%; no change was found that goes deeper\. Step 4 is not reached at this effort/);
  });

  it('optimises when only a two-change build reaches the target and each single change helps partly', async () => {
    // B 60 %, two one-change neighbours 70 %, their combination 97 % at a 90 % target (the review's case)
    const combo = {
      B: { changes: 0, p: [1, 0.6] },
      X: { changes: 1, p: [1, 0.7] },
      Y: { changes: 1, p: [1, 0.7] },
      XY: { changes: 2, p: [1, 0.97] },
    };
    const { env, calls } = synthEnv(combo, { B: ['X', 'Y'], X: ['B', 'XY'], Y: ['B', 'XY'] }, { size: 2 });
    const r = await pushCore(env, opts());
    const s = r.log.find((e) => e.kind === 'screen').out;
    expect(s).toMatchObject({ go: true, reason: 'gradient' });
    expect(calls.optimise.map((c) => c.r)).toEqual([1]);
    expect(r.best).toMatchObject({ key: 'XY', searched: 1, foundAt: 1 });
    expect(r.best.confirmed.deepest).toBe(1);
  });

  it('a change that raises the rate a little, far below the target, still sends the rung to the optimiser', async () => {
    const weak = { B: { changes: 0, p: [1, 0] }, Z: { changes: 1, p: [1, 0.08] } };
    const { env, calls } = synthEnv(weak, { B: ['Z'] }, { size: 2, optimiseHook: async () => ({ status: 'not-reached', fights: 0, best: null }) });
    const r = await pushCore(env, opts());
    expect(r.log.find((e) => e.kind === 'screen').out).toMatchObject({ go: true, reason: 'gradient' });
    expect(calls.optimise.length).toBe(1);
    expect(r.stop).toMatchObject({ rung: 1, reason: 'not-reached' });
  });

  it('the stop rule fires only once every screened build is confidently below the target (at most alpha when one is at it)', async () => {
    // one neighbour sits exactly at the target (also a change that raises the rate), the others at 0 %
    const edge = { B: { changes: 0, p: [1, 0] }, Y: { changes: 1, p: [1, TAU] }, Z: { changes: 1, p: [1, 0] } };
    let stops = 0;
    const SEEDS = 200;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const { env, calls } = synthEnv(edge, { B: ['Z', 'Y'] }, { size: 2, optimiseHook: async () => ({ status: 'not-reached', fights: 0, best: null }) });
      const r = await pushCore(env, opts({ seed }));
      const screen = r.log.find((e) => e.kind === 'screen').out;
      if (!screen.go) {
        stops++;
        // a stop is only ever declared on intervals that exclude the target
        expect(screen.reason).toBe('below');
        expect(calls.optimise).toEqual([]);
      } else expect(calls.optimise.length).toBe(1);
    }
    // the screen's family level is alpha = 5 %; Y's share of it is a third
    expect(stops / SEEDS).toBeLessThanOrEqual(0.05);
  });

  it('the top of the ladder ends the climb with no optimisation', async () => {
    const { env, calls } = synthEnv({ B: { changes: 0, p: [1, 1, 1] } }, {}, { size: 3 });
    const r = await pushCore(env, opts());
    expect(calls.optimise).toEqual([]);
    expect(r.stop).toEqual({ rung: null, reason: 'top', best: null });
    expect(r.baseline.confirmed.deepest).toBe(2);
  });

  it('starts at the chosen rung and reports nothing below it', async () => {
    const { env } = synthEnv({ B: { changes: 0, p: [0, 0, 1, 1, 0] } }, {}, { size: 5, start: 2 });
    const r = await pushCore(env, opts());
    expect(r.probes.every((p) => p.rung >= 2)).toBe(true);
    expect(r.baseline.searched).toBe(3);
  });

  it('reports data that contradict rising difficulty instead of hiding them', async () => {
    // the gallop probes steps 1, 2, 4 (all pass) and 8, 6, 5 (fail): step 3, which fails, is first seen
    // by the fixed-sequence confirm, which therefore stops at step 2
    const bumpy = { B: { changes: 0, p: [1, 1, 0.1, 1, 0, 0, 0, 0] } };
    const { env } = synthEnv(bumpy, {}, { size: 8 });
    const r = await pushCore(env, opts());
    expect(r.baseline.searched).toBe(3);
    expect(r.baseline.confirmed.deepest).toBe(1);
    expect(r.contradictions).toEqual([expect.objectContaining({ key: 'B', failed: 2, passed: 3 })]);
  });

  it('is deterministic: the same request gives the same decisions, fights and log', async () => {
    const a = await pushCore(synthEnv(LADDER, NEAR, { size: 8 }).env, opts());
    const b = await pushCore(synthEnv(LADDER, NEAR, { size: 8 }).env, opts());
    expect(b.log).toEqual(a.log);
    expect(b.probes).toEqual(a.probes);
    expect(b.fights).toBe(a.fights);
    const c = await pushCore(synthEnv(LADDER, NEAR, { size: 8 }).env, opts({ seed: 8 }));
    expect(c.log).not.toEqual(a.log); // seeds per probe follow the run seed
  });

  it('cancel + resume equals the uninterrupted run, and a cancelled optimisation resumes from its own checkpoint', async () => {
    let fullDraws = 0;
    const full = await pushCore(synthEnv(LADDER, NEAR, { size: 8, onSample: () => { fullDraws++; } }).env, opts());
    for (const cutAt of [3, 9, 20]) {
      const ctl = new AbortController();
      let samples = 0;
      let cp = null;
      const { env } = synthEnv(LADDER, NEAR, {
        size: 8,
        onSample: () => {
          if (++samples === cutAt) ctl.abort();
          if (ctl.signal.aborted) throw new AbortError();
        },
      });
      const cut = await pushCore(env, opts({ signal: ctl.signal, onCheckpoint: (c) => { cp = c; } }));
      expect(cut.status).toBe('cancelled');
      let draws = 0;
      const { env: env2 } = synthEnv(LADDER, NEAR, { size: 8, onSample: () => { draws++; } });
      const resumed = await pushCore(env2, opts({ replay: cp.log, inner: cp.inner }));
      expect(resumed.log).toEqual(full.log);
      expect(resumed.probes).toEqual(full.probes);
      expect(resumed.fights).toBe(full.fights);
      // the replayed steps draw no fights: the resume samples only what the cut run had not decided
      if (cp.log.length) expect(draws).toBeLessThan(fullDraws);
      else expect(draws).toBe(fullDraws);
    }

    // cancel inside the step-5 optimisation: its checkpoint travels in the Push checkpoint
    const ctl = new AbortController();
    let cp = null;
    const { env } = synthEnv(LADDER, NEAR, {
      size: 8,
      optimiseHook: async (r, o) => {
        if (r !== 4) return null;
        o.onCheckpoint({ schema: 'optimiser-checkpoint/1', marker: 'inner' });
        ctl.abort();
        return { status: 'cancelled', fights: 0 };
      },
    });
    const cut = await pushCore(env, opts({ signal: ctl.signal, onCheckpoint: (c) => { cp = c; } }));
    expect(cut.status).toBe('cancelled');
    expect(cp.inner).toEqual({ rung: 'r4', checkpoint: { schema: 'optimiser-checkpoint/1', marker: 'inner' } });
    const { env: env2, calls } = synthEnv(LADDER, NEAR, { size: 8 });
    const resumed = await pushCore(env2, opts({ replay: cp.log, inner: cp.inner }));
    expect(calls.optimise[0]).toMatchObject({ r: 4, resumeFrom: { schema: 'optimiser-checkpoint/1', marker: 'inner' } });
    expect(resumed.best.key).toBe('X2');
  });
});

describe('ladders', () => {
  it('a dungeon is its 8 steps, a raid its steps, Oblivion floors 1-60, a campaign its track of levels', () => {
    const d = ladderOf({ kind: 'dungeon', id: 'dungeon_4_hard', step: 6 });
    expect(d.rungs).toHaveLength(8);
    expect(d.start).toBe(5);
    expect(d.rungs[5].short).toBe('step 6');
    expect(d.label).toMatch(/^Hard dungeon \S/);
    expect(ladderOf({ kind: 'raid', id: 'raid_1', step: 1 }).rungs).toHaveLength(8);
    const o = ladderOf({ kind: 'oblivion', floor: 12, applyOutputCut: true });
    expect(o.rungs).toHaveLength(60);
    expect(o.start).toBe(11);
    expect(o.rungs[0].spec).toEqual({ kind: 'oblivion', floor: 1, applyOutputCut: true });
    const c = ladderOf({ kind: 'chapter', chapter: 3, level: 7 });
    expect(c.rungs).toHaveLength(110);
    expect(c.rungs[c.start]).toMatchObject({ short: 'level 3-7', spec: { kind: 'chapter', chapter: 3, level: 7 } });
    const h = ladderOf({ kind: 'chapter', chapter: 12, level: 1 });
    expect(h.start).toBe(0);
    expect(h.rungs[0].short).toBe('hard level 1-1');
    expect(h.rungs.at(-1).spec).toEqual({ kind: 'chapter', chapter: 22, level: 10 });
    expect(() => ladderOf({ kind: 'dummy' })).toThrow(/ladder/);
  });
});
