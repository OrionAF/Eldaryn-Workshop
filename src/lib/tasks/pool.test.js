// J2: the deterministic worker pool. Shards finish out of order (fake workers with random reply
// delays); the merged chunk must equal the inline one for every pool size.
import { describe, it, expect } from 'vitest';
import { createPool, inlinePool, poolScope, shardSize, MIN_SHARD, MAX_SHARD } from './pool.js';
import { fakeSpawn, fakePoolFactory } from './fakePoolWorker.js';
import { createPoolHandler } from '../poolWorker.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { buildFighter } from '../build/fighter.js';
import { resolveTarget, makeObjective } from '../search/objectives.js';
import { runTask } from './index.js';
import { pvpWinRateAsync, clearMetricCache } from '../engine/metrics.js';

const stats = (o = {}) => ({
  totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, totalOblivionPower: 0, ...o,
});
// level 50: the x8 PVP HP these duels were sized for (updates-2.8.2.md §1)
const fighter = (o) => ({ stats: stats(o), class: 'WARRIOR', spec: null, sigils: [], level: 50 });

const warrior = () => {
  const c = fixtureCharacter('WARRIOR');
  return { character: c, fighter: buildFighter(c, c.activePresetId) };
};
const DUMMY = { target: { kind: 'dummy', seconds: 6 }, objective: { kind: 'dps' }, character: { opponents: [] } };

describe('shardSize', () => {
  it('splits evenly over the workers within bounds', () => {
    expect(shardSize(8, 4)).toBe(MIN_SHARD);
    expect(shardSize(100, 4)).toBe(25);
    expect(shardSize(10000, 2)).toBe(MAX_SHARD);
  });
});

describe('pool', () => {
  it('a worker pool of 2 and 4 gives the inline chunk bit for bit, whatever order the shards finish in', async () => {
    const { fighter: f } = warrior();
    const want = await inlinePool('objective', DUMMY).run({ fighter: f, seed: 7 }, 3, 61);
    expect(want.main[0]).toHaveLength(58);
    for (const size of [2, 4]) {
      const spawn = fakeSpawn({ seed: size, maxDelayMs: 6 });
      const pool = createPool({ kind: 'objective', setup: DUMMY, size, spawn });
      const progress = [];
      const got = await pool.run({ fighter: f, seed: 7 }, 3, 61, { onProgress: (d) => progress.push(d) });
      expect(got).toEqual(want);
      expect(progress.at(-1)).toBe(58);
      expect([...progress].sort((a, b) => a - b)).toEqual(progress); // a contiguous prefix only grows
      expect(spawn.made).toBe(size);
      pool.close();
    }
  });

  it('the objective kernel equals the objective itself (target and objective rebuilt from their specs)', async () => {
    const { fighter: f } = warrior();
    const o = makeObjective(DUMMY.objective, resolveTarget(DUMMY.target));
    const direct = o.sample(f, { seed: 3, from: 0, to: 12 });
    const pool = createPool({ kind: 'objective', setup: DUMMY, size: 3, spawn: fakeSpawn() });
    const got = await pool.run({ fighter: f, seed: 3 }, 0, 12);
    expect(got.main).toEqual(direct.main);
    pool.close();
  });

  it('concurrent ranges on one pool each merge in index order', async () => {
    const f = fighter();
    const pool = createPool({ kind: 'duel', setup: { attacker: f, defender: fighter({ totalAttack: 900 }) }, size: 3, spawn: fakeSpawn({ seed: 9 }) });
    const inline = inlinePool('duel', { attacker: f, defender: fighter({ totalAttack: 900 }) });
    const args = [{ swap: false, seed: 1 }, { swap: true, seed: 1 }, { swap: false, seed: 2 }];
    const got = await Promise.all(args.map((a) => pool.run(a, 0, 40)));
    for (const [i, a] of args.entries()) expect(got[i]).toEqual(await inline.run(a, 0, 40));
    pool.close();
  });

  it('abort resolves with the contiguous prefix of finished shards', async () => {
    const pool = createPool({ kind: 'duel', setup: { attacker: fighter(), defender: fighter() }, size: 2, spawn: fakeSpawn({ maxDelayMs: 20 }) });
    const ctl = new AbortController();
    const p = pool.run({ swap: false, seed: 1 }, 0, 4000, { signal: ctl.signal });
    setTimeout(() => ctl.abort(), 30);
    const got = await p;
    expect(got.aborted).toBe(true);
    const n = got.main[0]?.length ?? 0;
    expect(n).toBeLessThan(4000);
    const want = await inlinePool('duel', { attacker: fighter(), defender: fighter() }).run({ swap: false, seed: 1 }, 0, n);
    expect(got.main).toEqual(want.main);
    pool.close();
  });

  it('workers that fail to start are dropped; with none left the shards run inline, same numbers', async () => {
    const setup = { attacker: fighter(), defender: fighter({ totalAttack: 1100 }) };
    const want = await inlinePool('duel', setup).run({ swap: false, seed: 5 }, 0, 50);
    const some = createPool({ kind: 'duel', setup, size: 3, spawn: fakeSpawn({ failStart: 2 }) });
    expect(await some.run({ swap: false, seed: 5 }, 0, 50)).toEqual(want);
    expect(some.workers).toBe(1);
    const none = createPool({ kind: 'duel', setup, size: 2, spawn: fakeSpawn({ failStart: 2 }) });
    expect(await none.run({ swap: false, seed: 5 }, 0, 50)).toEqual(want);
    expect(none.workers).toBe(0);
    const throwing = createPool({ kind: 'duel', setup, size: 2, spawn: () => { throw new Error('SecurityError'); } });
    expect(await throwing.run({ swap: false, seed: 5 }, 0, 50)).toEqual(want);
  });

  it('a kernel error rejects the run with its message', async () => {
    const pool = createPool({ kind: 'swap', setup: {}, size: 2, spawn: fakeSpawn() });
    await expect(pool.run({ metric: 'pvp:nobody', fighter: fighter(), seed: 1 }, 0, 8)).rejects.toThrow(/unknown metric/);
    pool.close();
  });

  it('the worker handler prepares once and answers shards in order', async () => {
    const out = [];
    const handle = createPoolHandler((m) => out.push(m));
    handle({ data: { type: 'shard', id: 1, args: {}, from: 0, to: 1 } });
    handle({ data: { type: 'prepare', kind: 'duel', setup: { attacker: fighter(), defender: fighter() } } });
    handle({ data: { type: 'shard', id: 2, args: { swap: false, seed: 1 }, from: 0, to: 3 } });
    await new Promise((r) => setTimeout(r, 20));
    expect(out.map((m) => m.type)).toEqual(['fail', 'ready', 'shard']);
    expect(out[2].chunk.main[0]).toHaveLength(3);
  });

  it('poolScope closes every pool it opened', () => {
    const closed = [];
    const scope = poolScope((kind) => ({ kind, close: () => closed.push(kind) }));
    scope.open('duel', {});
    scope.open('swap', {});
    scope.close();
    expect(closed).toEqual(['duel', 'swap']);
  });
});

/** Run a task on a fake pool of `size` and check that it really used the pool's workers. */
async function onPool(mode, req, size) {
  const pool = fakePoolFactory(size, { seed: size });
  const r = await runTask(mode, req, { pool });
  if (size > 1) expect(pool.spawn.made, `${mode} did not use the pool`).toBe(size);
  return r;
}

describe('tasks on a pool give the same result for pool sizes 1, 2 and 4', () => {
  it('duel equals the engine metric (pvpWinRate) and is the same on every pool', async () => {
    clearMetricCache();
    const a = fighter({ totalAttack: 2600, totalCritChance: 0.3 });
    const d = fighter({ totalAttack: 2400, totalHp: 11000, totalBlockChance: 0.1 });
    const metric = await pvpWinRateAsync(a, d, { n: 60, seed: 3, cache: false });
    expect(metric.p).toBeGreaterThan(0);
    expect(metric.p).toBeLessThan(1);
    expect(await runTask('duel', { attacker: a, defender: d, n: 60, seed: 3 })).toEqual(metric);
    const results = [];
    for (const size of [1, 2, 4]) {
      results.push(await onPool('duel', { attacker: a, defender: d, n: 60, seed: 3, both: true }, size));
    }
    expect(results[0].swapped.n).toBe(60);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('oblivion floors', async () => {
    const req = { fighter: fighter({ totalAttack: 4000, totalHp: 40000 }), floors: [1, 2, 3], n: 12, seed: 2, stopAfter: 0 };
    const base = await runTask('oblivionFloors', req);
    expect(base.rows).toHaveLength(3);
    for (const size of [2, 4]) expect(await onPool('oblivionFloors', req, size)).toEqual(base);
  });

  it('drop check (sim, survival and PVP), against the engine-metric path', async () => {
    const { fighter: f } = warrior();
    const better = { ...f, stats: { ...f.stats, totalAttack: f.stats.totalAttack * 1.2 } };
    const { runSwapMetrics } = await import('../features/swap.js');
    const req = {
      items: [{ presetId: 'p1', before: f, after: better }],
      seconds: 5, nSim: 4, enemy: { mobs: [{ name: 'm', hp: 2e6, attack: 3000, attackSpeed: 1, damageReduction: 0, blockChance: 0, missChance: 0 }] },
      survivalSeconds: 5, nSurvival: 8, opponents: [{ id: 'o1', name: 'O', fighter: f }], nPvp: 8, seed: 4, maxN: 64,
    };
    clearMetricCache();
    const engine = await runSwapMetrics(req.items, req);
    const base = await runTask('dropCheck', req);
    expect(base).toEqual(engine);
    for (const size of [2, 4]) expect(await onPool('dropCheck', req, size)).toEqual(base);
  }, 30000);
});
