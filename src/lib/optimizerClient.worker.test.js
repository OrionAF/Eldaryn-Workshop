/**
 * Tests the Worker branch of optimizerClient.js and optimizerWorker.js with a fake Worker
 * (redesign plan A.10, finding #108).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { runOptimizerTask } from './optimizerClient.js';
import { createWorkerHandler, poolFactory } from './optimizerWorker.js';
import { saveUi, UI_KEY } from './uiState.js';
import { inlinePool } from './tasks/pool.js';
import { fakeSpawn } from './tasks/fakePoolWorker.js';

let instances = [];
class FakeWorker {
  constructor() {
    if (FakeWorker.throwOnConstruct) throw new Error('SecurityError');
    this.sent = [];
    this.terminated = false;
    instances.push(this);
  }
  postMessage(m) { this.sent.push(m); }
  terminate() { this.terminated = true; }
  emit(data) { this.onmessage({ data }); }
}

function statsOf(totalAttack) {
  return { totalHp: 10000, totalAttack, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0, totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0, totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0, totalPvpAttack: 0, totalPvpDefense: 0 };
}
const duelReq = {
  mode: 'duel',
  attacker: { stats: statsOf(5000), class: 'WARRIOR', spec: null, sigils: [] },
  defender: { stats: statsOf(10), class: 'WARRIOR', spec: null, sigils: [] },
  n: 10, seed: 1,
};

afterEach(() => {
  localStorage.removeItem(UI_KEY);
  vi.unstubAllGlobals();
  instances = [];
  FakeWorker.throwOnConstruct = false;
});

describe('client with a Worker', () => {
  it('starts the job, relays progress and checkpoint, resolves on done and terminates', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const progress = [];
    const checkpoints = [];
    const { promise } = runOptimizerTask({ ...duelReq, resumeFrom: { phase: 'search' } }, { onProgress: (p) => progress.push(p), onCheckpoint: (c) => checkpoints.push(c) });
    const w = instances[0];
    expect(w.sent[0]).toMatchObject({ type: 'start', request: { mode: 'duel', resumeFrom: { phase: 'search' } } });
    w.emit({ type: 'progress', progress: { n: 3 } });
    w.emit({ type: 'checkpoint', checkpoint: { schema: 'x' } });
    w.emit({ type: 'done', result: { ok: 1 } });
    expect(await promise).toEqual({ ok: 1 });
    expect(progress).toEqual([{ n: 3 }]);
    expect(checkpoints).toEqual([{ schema: 'x' }]);
    expect(w.terminated).toBe(true);
  });

  it('rejects on an error message', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { promise } = runOptimizerTask(duelReq);
    instances[0].emit({ type: 'error', message: 'boom' });
    await expect(promise).rejects.toThrow('boom');
  });

  it('cancel posts a cancel message right behind the start, even before any reply', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { promise, cancel } = runOptimizerTask(duelReq);
    cancel();
    const w = instances[0];
    expect(w.sent.map((m) => m.type)).toEqual(['start', 'cancel']);
    w.emit({ type: 'done', result: { aborted: true } });
    expect((await promise).aborted).toBe(true);
  });

  it('cancel after done is a no-op', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const { promise, cancel } = runOptimizerTask(duelReq);
    const w = instances[0];
    w.emit({ type: 'done', result: { r: 1 } });
    await promise;
    cancel();
    expect(w.sent.map((m) => m.type)).toEqual(['start']);
  });

  it('a constructor that throws falls back to the inline path and resolves', async () => {
    FakeWorker.throwOnConstruct = true;
    vi.stubGlobal('Worker', FakeWorker);
    const { promise } = runOptimizerTask(duelReq);
    const r = await promise;
    expect(r.n).toBe(10);
    expect(r.p).toBe(1);
  });

  it('a worker that fails before saying anything falls back inline; after it spoke, it rejects', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const first = runOptimizerTask(duelReq);
    instances[0].onerror({ message: 'blocked' });
    expect((await first.promise).p).toBe(1);
    expect(instances[0].terminated).toBe(true);

    const second = runOptimizerTask(duelReq);
    const w = instances[1];
    w.emit({ type: 'progress', progress: {} });
    w.onerror({ message: 'crashed' });
    await expect(second.promise).rejects.toThrow('crashed');
  });
});

describe('worker pool size (J2)', () => {
  it('the request carries the pool size of the CPU profile read when the job starts', () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    runOptimizerTask(duelReq);
    saveUi({ prefs: { cpuProfile: 'max' } });
    runOptimizerTask(duelReq);
    saveUi({ prefs: { cpuProfile: 'eco' } });
    runOptimizerTask(duelReq);
    runOptimizerTask({ ...duelReq, workers: 3 });
    expect(instances.map((w) => w.sent[0].request.workers)).toEqual([4, 7, 2, 3]);
  });

  it('the worker host builds no pool for one worker, and a worker pool for more', async () => {
    expect(poolFactory(1)).toBe(inlinePool);
    expect(poolFactory(undefined)).toBe(inlinePool);
    expect(poolFactory(4)).toBe(inlinePool); // no Worker in this environment: inline
    const spawn = fakeSpawn();
    const pool = poolFactory(3, spawn)('duel', { attacker: duelReq.attacker, defender: duelReq.defender });
    expect(pool.size).toBe(3);
    expect(spawn.made).toBe(3);
    const c = await pool.run({ swap: false, seed: 1 }, 0, 10);
    expect(c.main[0]).toEqual(Array(10).fill(1));
    pool.close();
  });
});

describe('worker handler', () => {
  const run = async (messages) => {
    const out = [];
    const handler = createWorkerHandler((m) => out.push(m));
    for (const data of messages) await handler({ data });
    return out;
  };

  it('start runs the task and posts done', async () => {
    const out = await run([{ type: 'start', request: duelReq }]);
    expect(out.at(-1).type).toBe('done');
    expect(out.at(-1).result.p).toBe(1);
  });

  it('accepts a bare request and reports task errors', async () => {
    const out = await run([{ mode: 'nope' }]);
    expect(out).toEqual([{ type: 'error', message: expect.stringMatching(/unknown task/) }]);
  });

  it('cancel before start makes the job resolve aborted', async () => {
    const out = await run([{ type: 'cancel' }, { type: 'start', request: { ...duelReq, n: 5000 } }]);
    expect(out.at(-1).type).toBe('done');
    expect(out.at(-1).result.aborted).toBe(true);
  });

  it('relays onCheckpoint from the task as a checkpoint message', async () => {
    const { TASKS } = await import('./tasks/index.js');
    const orig = TASKS.duel;
    TASKS.duel = async (_r, ctx) => { ctx.onCheckpoint({ schema: 'c' }); return { r: 1 }; };
    try {
      const out = await run([{ type: 'start', request: duelReq }]);
      expect(out.map((m) => m.type)).toEqual(['checkpoint', 'done']);
    } finally {
      TASKS.duel = orig;
    }
  });
});
