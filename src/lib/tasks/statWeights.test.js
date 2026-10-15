// Worker task 'statWeights': runs through the registry, reports phased progress, cancels with partial bars,
// and gives the same numbers on a pool as inline (simulation.md §Stat weights, §Worker pool).
import { describe, it, expect } from 'vitest';
import { runTask } from './index.js';
import { runOptimizerTask } from '../optimizerClient.js';
import { probeStats } from '../features/statWeights.js';
import { fakePoolFactory } from './fakePoolWorker.js';

const stats = (o = {}) => ({
  totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 10,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 30,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, ...o,
});
const base = { stats: stats(), class: 'WARRIOR', spec: null, sigils: [] };
const probe = (key, step, chart) => ({ key, label: key, unit: '', chart, fighter: { ...base, stats: probeStats(base.stats, { key, step }) } });
const request = (o = {}) => ({
  mode: 'statWeights', base, seed: 5, seconds: 5, survivalSeconds: 10, nDps: 16, nSurvival: 64,
  probes: [probe('totalAttack', 100, 'damage'), probe('totalCritChance', 1, 'damage'), probe('totalHp', 1000, 'survival'), probe('totalBlockChance', 1, 'survival')],
  ...o,
});

describe('statWeights task', () => {
  it('runs both charts and reports progress in phases, ending with every phase done', async () => {
    const seen = [];
    const r = await runTask('statWeights', request(), { onProgress: (p) => seen.push(p) });
    expect(r.aborted).toBe(false);
    expect(r.damage.bars.map((b) => b.key).sort()).toEqual(['totalAttack', 'totalCritChance']);
    expect(r.survival.bars.map((b) => b.key).sort()).toEqual(['totalBlockChance', 'totalHp']);
    expect(r.survival.enemy.attack).toBe(r.calibration.attack);
    expect(r.damage.label).toMatch(/training dummy/);
    expect(r.survival.label).toMatch(/reference enemy/);
    expect(seen[0].phases.map((p) => p.id)).toEqual(['damage', 'calibrate', 'survival']);
    expect(seen.some((p) => p.phases.find((x) => x.id === 'survival').state === 'current')).toBe(true);
    expect(seen.at(-1).phases.every((p) => p.state === 'done')).toBe(true);
    expect(seen.at(-1).done).toBe(seen.at(-1).total);
  });

  it('gives the same result on a worker pool as inline', async () => {
    const inline = await runTask('statWeights', request());
    const pooled = await runTask('statWeights', request(), { pool: fakePoolFactory(3) });
    expect(pooled).toEqual(inline);
  });

  it('cancel resolves with the bars finished so far and aborted: true', async () => {
    const { promise, cancel } = runOptimizerTask(request({ nDps: 4000, nSurvival: 4000 }));
    setTimeout(cancel, 80);
    const r = await promise;
    expect(r.aborted).toBe(true);
    expect(r.survival).toBeNull();
  });

  it('refuses a request without a base Fighter', async () => {
    await expect(runTask('statWeights', { probes: [] })).rejects.toThrow(/base Fighter/);
  });
});
