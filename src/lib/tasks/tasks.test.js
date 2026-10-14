import { describe, it, expect } from 'vitest';
import { TASKS, hasTask, isTaskRequest, runTask } from './index.js';
import { runOptimizerTask } from '../optimizerClient.js';

const stats = (o = {}) => ({
  totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, ...o,
});
const fighter = (o = {}) => ({ stats: stats(o), class: 'WARRIOR', spec: null, sigils: [] });

describe('task registry', () => {
  it('names the four tasks and routes legacy optimize requests away', () => {
    expect(Object.keys(TASKS).sort()).toEqual(['dropCheck', 'duel', 'oblivionFloors', 'optimize']);
    expect(hasTask('toString')).toBe(false);
    expect(isTaskRequest({ mode: 'duel' })).toBe(true);
    expect(isTaskRequest({ mode: 'optimize' })).toBe(false);
    expect(isTaskRequest({ mode: 'optimize', v2: true })).toBe(true);
    expect(isTaskRequest({ mode: 'suggest-relics' })).toBe(false);
  });

  it('stubs reject with their owner slice; unknown modes reject', async () => {
    await expect(runTask('dropCheck', {})).rejects.toThrow(/F1/);
    await expect(runTask('oblivionFloors', {})).rejects.toThrow(/F4/);
    await expect(runTask('optimize', {})).rejects.toThrow(/F2a/);
    await expect(runTask('nope', {})).rejects.toThrow(/unknown task/);
  });

  it('duel runs through the client facade inline and returns a win rate with an interval', async () => {
    const { promise } = runOptimizerTask({ mode: 'duel', attacker: fighter({ totalAttack: 5000 }), defender: fighter({ totalAttack: 10 }), n: 20, seed: 4 });
    const r = await promise;
    expect(r.p).toBe(1);
    expect(r.n).toBe(20);
    expect(r.trace).toBeUndefined();
  });

  it('duel with trace returns one traced duel', async () => {
    const r = await runTask('duel', { attacker: fighter(), defender: fighter(), n: 2, trace: true });
    expect(r.trace.length).toBeGreaterThan(0);
    expect(r.trace[0]).toHaveProperty('timestamp');
  });

  it('cancel() returns best-so-far with aborted: true', async () => {
    const { promise, cancel } = runOptimizerTask({ mode: 'duel', attacker: fighter(), defender: fighter(), n: 100000 });
    setTimeout(cancel, 60);
    const r = await promise;
    expect(r.aborted).toBe(true);
    expect(r.n).toBeGreaterThan(0);
    expect(r.n).toBeLessThan(100000);
    expect(r.lo).toBeLessThanOrEqual(r.p);
  });
});
