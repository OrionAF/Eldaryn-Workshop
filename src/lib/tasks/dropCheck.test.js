import { describe, it, expect, beforeEach } from 'vitest';
import { runTask } from './index.js';
import { runOptimizerTask } from '../optimizerClient.js';
import { prepareSwap, buildEnemy, opponentFighter } from '../features/swap.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { computePresetStats } from '../build/stats.js';
import { clearMetricCache } from '../engine/metrics.js';

beforeEach(() => clearMetricCache());

const weapon = (attack, extra = {}) => ({
  rarity: 'ETERNAL', itemLevel: 200, quality: 80, primaryStats: { attack, hp: 0 },
  secondaryStats: [{ type: 'ATTACK_PERCENT', value: 8 }], conduit: null, ...extra,
});

describe("worker task 'dropCheck'", () => {
  it('rejects a malformed request', async () => {
    await expect(runTask('dropCheck', {})).rejects.toThrow(/items/);
    await expect(runTask('dropCheck', { items: [{ presetId: 'p1' }] })).rejects.toThrow(/before and after/);
  });

  it.each(['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER'])('%s fixture: a big upgrade is a significant paired DPS gain, through the client facade', async (cls) => {
    const c = fixtureCharacter(cls);
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(60000), presetIds: ['p1'] });
    const { promise } = runOptimizerTask({
      mode: 'dropCheck',
      items: rows.map((r) => ({ presetId: r.presetId, before: r.before, after: r.after })),
      nSim: 6, seconds: 15, seed: 11,
    });
    const r = await promise;
    expect(r.aborted).toBe(false);
    expect(r.results).toHaveLength(1);
    const sim = r.results[0].sim;
    expect(sim.delta.delta).toBeGreaterThan(0);
    expect(sim.after.mean).toBeGreaterThan(sim.before.mean);
    expect(sim.delta.n).toBe(6);
    expect(sim.samples).toBeUndefined();
  }, 30000);

  it('is deterministic in the seed', async () => {
    const c = fixtureCharacter('WARRIOR');
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(9000), presetIds: ['p1'] });
    const req = { items: rows.map((r) => ({ presetId: r.presetId, before: r.before, after: r.after })), nSim: 5, seconds: 10, seed: 4 };
    const a = await runTask('dropCheck', req);
    clearMetricCache();
    const b = await runTask('dropCheck', req);
    expect(a).toEqual(b);
  });

  it('survival and PVP run for the real fixtures; the sheet-anchored path works end to end', async () => {
    const c = fixtureCharacter('WARRIOR');
    c.presets[0].sheet = { values: computePresetStats(c, 'p1').computed, enteredAt: 'now' };
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(30000), presetIds: ['p1'] });
    expect(rows[0].method).toBe('anchored');
    const rival = opponentFighter({ class: 'SENTINEL', spec: 'SENTINEL_MARKSMANSHIP', sheet: { values: computePresetStats(fixtureCharacter('SENTINEL'), 'p1').computed } });
    const r = await runTask('dropCheck', {
      items: rows.map((x) => ({ presetId: x.presetId, before: x.before, after: x.after })),
      sim: false,
      enemy: buildEnemy({ kind: 'campaign', chapter: 1, level: 3 }),
      nSurvival: 6, survivalSeconds: 20,
      opponents: [{ id: 'o1', name: 'Rival', fighter: rival }], nPvp: 4,
    });
    expect(r.aborted).toBe(false);
    expect(r.results[0].sim).toBeUndefined();
    expect(r.results[0].survival.delta.n).toBe(6);
    expect(r.results[0].pvp[0].delta.n).toBe(4);
  }, 30000);

  it('Oblivion floors run with the realm power', async () => {
    const c = fixtureCharacter('WARRIOR');
    const rows = prepareSwap(c, { slot: 'BELT', item: weapon(40000), realm: 'oblivion', presetIds: ['p1'] });
    const r = await runTask('dropCheck', {
      items: rows.map((x) => ({ presetId: x.presetId, before: x.before, after: x.after })),
      sim: false, enemy: buildEnemy({ kind: 'oblivion', floor: 3 }), nSurvival: 4, survivalSeconds: 20,
    });
    expect(r.results[0].survival.before.n).toBe(4);
  }, 30000);

  it('cancel through the client facade resolves with aborted: true', async () => {
    const c = fixtureCharacter('WARRIOR');
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(9000) });
    const { promise, cancel } = runOptimizerTask({
      mode: 'dropCheck',
      items: rows.map((r) => ({ presetId: r.presetId, before: r.before, after: r.after })),
      nSim: 200, seconds: 60,
    });
    cancel();
    const r = await promise;
    expect(r.aborted).toBe(true);
  }, 30000);
});
