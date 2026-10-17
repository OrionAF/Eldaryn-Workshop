import { describe, it, expect } from 'vitest';
import { arenaVirtualOffset, arenaInfluenceReward } from '../engine/pvp/arenaRewards.js';
import { arenaRewardConfig, rewardEstimate, rewardContrast } from './arenaRewardObjective.js';
import { resolveTarget, makeObjective } from './objectives.js';
import { prepare, resolveEffort, optimize, runMore } from './search.js';
import { BLOCKS } from './space.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { cloneAsOpponent } from '../features/duel.js';
import { normaliseCharacter } from '../model/index.js';
import { normaliseSetup, requestOf, setupFromRun } from '../ui/optimiserSetup.js';
import { normaliseRun, runFromResult } from '../model/runs.js';
import { laneRng } from '../engine/rng.js';
import { runTask } from '../tasks/index.js';

const targetSpec = { kind: 'pvp', opponentIds: ['a', 'b'], seats: 'attacker' };
const objectiveSpec = { kind: 'arena-reward', rank: 'INITIATE', position: 10, opponentPositions: { a: 7, b: 13 } };
const character = () => {
  const c = fixtureCharacter('WARRIOR');
  c.opponents = ['a', 'b'].map((id) => ({ ...cloneAsOpponent(c, 'p1', 'WARRIOR_TANK', id), id }));
  return normaliseCharacter(c);
};
const set = (main) => ({ main, n: main[0].length, side: {} });
const value = (wins, reward) => wins.map((x) => x * reward);

describe('Arena source reward mapping', () => {
  it('maps regular positions and the top ladder boundary to exact virtual reward slots', () => {
    expect([7, 8, 9, 11, 12, 13].map((p) => arenaVirtualOffset(10, p))).toEqual([3, 2, 1, -1, -2, -3]);
    expect([2, 3, 4, 5, 6, 7].map((p) => arenaVirtualOffset(1, p))).toEqual([3, 2, 1, -1, -2, -3]);
    expect([1, 3, 4, 5, 6, 7].map((p) => arenaVirtualOffset(2, p))).toEqual([3, 2, 1, -1, -2, -3]);
    for (const [me, them] of [[10, 10], [10, 6], [10, 14], [0, 1], [1, 8], [1.5, 2], [2, Infinity]]) expect(arenaVirtualOffset(me, them)).toBeNull();
  });
  it('uses rank tier multipliers and Math.round, without fabricating an absent rank', () => {
    expect(arenaInfluenceReward('INITIATE', 10, 7)).toBe(30);
    expect(arenaInfluenceReward('INITIATE', 10, 13)).toBe(5);
    expect(arenaInfluenceReward('TRANSCENDENT', 10, 7)).toBe(360);
    expect(arenaInfluenceReward('ELITE', 10, 13)).toBe(8);
    expect(arenaInfluenceReward(undefined, 10, 7)).toBeNull();
  });
  it('requires explicit rank/positions and attacking only; ignores stale unselected position keys', () => {
    expect(arenaRewardConfig(objectiveSpec, targetSpec).rewards).toEqual([30, 5]);
    for (const invalid of [{ rank: '' }, { position: null }, { opponentPositions: {} }, { opponentPositions: { a: 10, b: 13 } }, { opponentPositions: { a: 7, b: 7 } }]) {
      expect(() => arenaRewardConfig({ ...objectiveSpec, ...invalid }, targetSpec)).toThrow();
    }
    for (const seats of ['both', 'defender']) expect(() => arenaRewardConfig(objectiveSpec, { ...targetSpec, seats })).toThrow(/attacking/);
    expect(arenaRewardConfig({ ...objectiveSpec, opponentPositions: { ...objectiveSpec.opponentPositions, ghost: 99 } }, targetSpec).spec).toEqual(objectiveSpec);
  });
});

describe('reward mean and paired bounds', () => {
  it('weights actual rewards at equal attempt frequencies and counts real observations', () => {
    const main = [[30, 30, 0, 0], [5, 0, 0, 0]];
    const result = rewardEstimate(main, [30, 5]);
    expect(result.est).toBe(65 / 8);
    expect(result.n).toBe(8);
    expect(result.lo).toBeLessThan(result.est);
    expect(result.hi).toBeGreaterThan(result.est);
    const delta = rewardContrast(set(main), set([[0, 0, 0, 0], [5, 5, 5, 5]]), [30, 5]);
    expect(delta.delta).toBe(45 / 8);
    expect(delta.n).toBe(4);
    expect(delta.lo).toBeLessThanOrEqual(delta.delta);
    expect(delta.hi).toBeGreaterThanOrEqual(delta.delta);
    const same = rewardContrast(set(main), set(main), [30, 5]);
    expect(same.delta).toBe(0);
    expect(same.lo).toBeLessThan(0);
    expect(same.hi).toBeGreaterThan(0);
  });
  it('mean intervals cover at least 95% under exact small-sample enumeration with unequal rewards', () => {
    const n = 6, p = [.2, .7], rewards = [30, 5], truth = (p[0] * 30 + p[1] * 5) / 2;
    const choose = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r *= (n - i + 1) / i; return r; };
    let covered = 0;
    for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) {
      const main = [a, b].map((wins, j) => Array.from({ length: n }, (_, i) => i < wins ? rewards[j] : 0));
      const r = rewardEstimate(main, rewards);
      const mass = [a, b].reduce((m, wins, j) => m * choose(n, wins) * p[j] ** wins * (1 - p[j]) ** (n - wins), 1);
      if (r.lo <= truth && r.hi >= truth) covered += mass;
    }
    expect(covered).toBeGreaterThanOrEqual(.95);
  });
  it('paired bounds cover discordant multinomial differences, including a high-reward rare win', () => {
    const rng = laneRng(1817), n = 32, rewards = [360, 5], truth = (360 * .05 + 5 * -.15) / 2;
    let missed = 0;
    for (let rep = 0; rep < 200; rep++) {
      const x = [[], []], y = [[], []];
      for (let j = 0; j < 2; j++) for (let i = 0; i < n; i++) {
        const u = rng(), gain = j === 0 ? .1 : .05, loss = j === 0 ? .05 : .2;
        x[j].push(u < gain ? rewards[j] : 0);
        y[j].push(u >= gain && u < gain + loss ? rewards[j] : 0);
      }
      const r = rewardContrast(set(x), set(y), rewards);
      if (r.lo > truth || r.hi < truth) missed++;
    }
    expect(missed).toBeLessThanOrEqual(10);
  });
});

describe('Arena objective integration', () => {
  it('reuses identical win-rate duels/CRN and scales tolerance into Influence units', async () => {
    const c = character(), t = resolveTarget(targetSpec, { character: c });
    const old = makeObjective({ kind: 'pvp-winrate' }, t), obj = makeObjective(objectiveSpec, t);
    const f = (await import('../build/fighter.js')).buildFighter(c, 'p1');
    const opts = { seed: 9, from: 0, to: 8 };
    const bits = await old.sample(f, opts), rewards = await obj.sample(f, opts);
    expect(rewards.main).toEqual(bits.main.map((lane, j) => value(lane, j === 0 ? 30 : 5)));
    expect(rewards.side).toEqual(bits.side);
    expect(resolveEffort('quick', obj).delta).toBe(resolveEffort('quick', old).delta * 17.5);
    expect(obj.unit).toBe('influence');
    expect(obj.estimate({ ...set(rewards.main), side: rewards.side }).aux.matchups[1].value.n).toBe(8);
  });
  it('setup/request/history retain explicit positions and old defaults; changed positions invalidate a checkpoint', async () => {
    const c = character(), raw = { target: targetSpec, objective: objectiveSpec, presetId: 'p1', effort: 'quick' };
    const setup = normaliseSetup(raw, c);
    expect(setup.objective).toEqual(objectiveSpec);
    const req = requestOf(setup, c), prep = prepare(req);
    expect(prep.requestEcho.objective).toEqual(objectiveSpec);
    const changed = prepare({ ...req, objective: { ...objectiveSpec, opponentPositions: { a: 8, b: 13 } } });
    expect(changed.requestKey).not.toBe(prep.requestKey);
    const old = normaliseSetup({ ...raw, objective: { kind: 'pvp-winrate' } }, c);
    expect(old.objective).toEqual({ kind: 'pvp-winrate' });
    expect(normaliseSetup({ ...raw, objective: { kind: 'arena-reward' } }, c).objective.position).toBeNull();
    const tiny = { ...req, space: Object.fromEntries(BLOCKS.map((b) => [b, false])), effort: { level: 'quick', n0: 4, maxN: 4, randomStarts: 0 } };
    const result = await runTask('optimize', tiny);
    expect(result.status).toBe('done');
    expect(result.objective).toMatchObject({ ...objectiveSpec, unit: 'influence' });
    expect(result.baseline.value.n).toBe(8);
    const run = normaliseRun(runFromResult(result, { id: 'arena-test' }));
    expect(run.objective).toMatchObject(objectiveSpec);
    expect(setupFromRun(run, c).objective).toEqual(objectiveSpec);
    const ctl = new AbortController(); let checkpoint;
    await optimize(tiny, { signal: ctl.signal, onCheckpoint: (cp) => { checkpoint = cp; },
      onProgress: (p) => { if (p.phase === 'minimise') ctl.abort(); } });
    expect(checkpoint.schema).toBe('optimiser-checkpoint/1');
    const resumed = await optimize({ ...tiny, resumeFrom: JSON.parse(JSON.stringify(checkpoint)) });
    expect(resumed.baseline.value).toEqual(result.baseline.value);
    const stale = await optimize({ ...tiny, objective: changed.requestEcho.objective, resumeFrom: checkpoint });
    expect(stale.warnings.map((w) => w.code)).toContain('checkpoint-ignored');
  });
});
