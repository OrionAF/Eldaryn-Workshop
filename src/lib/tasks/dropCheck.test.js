import { describe, it, expect, beforeEach } from 'vitest';
import { runTask } from './index.js';
import { runOptimizerTask } from '../optimizerClient.js';
import { prepareSwap } from '../features/swap.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { computePresetStats } from '../build/stats.js';
import { clearMetricCache } from '../engine/metrics.js';
import { inlinePool } from './pool.js';

beforeEach(() => clearMetricCache());

const weapon = (attack, extra = {}) => ({
  rarity: 'ETERNAL', itemLevel: 200, quality: 80, primaryStats: { attack, hp: 0 },
  secondaryStats: [{ type: 'ATTACK_PERCENT', value: 8 }], conduit: null, ...extra,
});
const dummy = (seconds = 15) => ({ id: 'dps', target: { kind: 'dummy', seconds }, objective: { kind: 'dps' } });
const itemsOf = (rows) => rows.map((r) => ({ presetId: r.presetId, before: r.before, after: r.after }));

describe("worker task 'dropCheck'", () => {
  it('rejects a malformed request', async () => {
    await expect(runTask('dropCheck', {})).rejects.toThrow(/items/);
    await expect(runTask('dropCheck', { items: [] })).rejects.toThrow(/goals/);
    await expect(runTask('dropCheck', { items: [{ presetId: 'p1' }], goals: [] })).rejects.toThrow(/before and after/);
  });

  it.each(['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER'])('%s fixture: a big upgrade is a significant paired DPS gain, through the client facade', async (cls) => {
    const c = fixtureCharacter(cls);
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(60000), presetIds: ['p1'] });
    const { promise } = runOptimizerTask({ mode: 'dropCheck', items: itemsOf(rows), goals: [dummy()], n0: 6, maxN: 6, seed: 11 });
    const r = await promise;
    expect(r.aborted).toBe(false);
    expect(r.results).toHaveLength(1);
    const g = r.results[0].goals[0];
    expect(g.goalId).toBe('dps');
    expect(g.unit).toBe('dps');
    expect(g.damageOnly).toBe(true);
    expect(g.delta.delta).toBeGreaterThan(0);
    expect(g.after.mean).toBeGreaterThan(g.before.mean);
    expect(g.delta.n).toBe(6);
  }, 30000);

  it('runs goals one at a time: the pool of each goal closes before the next opens', async () => {
    const c = fixtureCharacter('WARRIOR');
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(9000), presetIds: ['p1'] });
    const log = [];
    const pool = (kind, setup) => {
      const p = inlinePool(kind, setup);
      log.push(`open ${setup.target.kind}`);
      return { ...p, run: p.run, close: () => log.push(`close ${setup.target.kind}`) };
    };
    const goals = [dummy(10), { id: 'ch', target: { kind: 'chapter', chapter: 1, level: 1 }, objective: { kind: 'win-chance' } }];
    const r = await runTask('dropCheck', { items: itemsOf(rows), goals, character: c, n0: 4, maxN: 8, seed: 2 }, { pool });
    expect(r.results[0].goals.map((g) => g.goalId)).toEqual(['dps', 'ch']);
    expect(log.slice(0, 4)).toEqual(['open dummy', 'close dummy', 'open chapter', 'close chapter']);
  });

  it('is deterministic in the seed', async () => {
    const c = fixtureCharacter('WARRIOR');
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(9000), presetIds: ['p1'] });
    const req = { items: itemsOf(rows), goals: [dummy(10)], n0: 5, maxN: 10, seed: 4 };
    const a = await runTask('dropCheck', req);
    const b = await runTask('dropCheck', req);
    expect(a).toEqual(b);
  });

  it('clear chance and PVP run for the real fixtures; the sheet-anchored path works end to end', async () => {
    const c = fixtureCharacter('WARRIOR');
    c.presets[0].sheet = { values: computePresetStats(c, 'p1').computed, enteredAt: 'now' };
    c.opponents = [{ id: 'o1', name: 'Rival', class: 'SENTINEL', spec: 'SENTINEL_MARKSMANSHIP', sheet: { values: computePresetStats(fixtureCharacter('SENTINEL'), 'p1').computed } }];
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(30000), presetIds: ['p1'] });
    expect(rows[0].method).toBe('anchored');
    const r = await runTask('dropCheck', {
      items: itemsOf(rows),
      goals: [
        { id: 'ch', target: { kind: 'chapter', chapter: 1, level: 3 }, objective: { kind: 'win-chance' } },
        { id: 'pvp', target: { kind: 'pvp', opponentIds: ['o1'], seats: 'attacker' }, objective: { kind: 'pvp-winrate' } },
      ],
      character: c, n0: 6, maxN: 6,
    });
    expect(r.aborted).toBe(false);
    const [ch, pvp] = r.results[0].goals;
    expect(ch.goalId).toBe('ch');
    expect(ch.unit).toBe('p');
    expect(ch.damageOnly).toBe(false);
    expect(ch.delta.n).toBeLessThanOrEqual(6);
    expect(pvp.goalId).toBe('pvp');
    expect(pvp.delta.n).toBe(6);
    expect(typeof pvp.delta.holmReject).toBe('boolean');
  }, 60000);

  it('Oblivion floors run with the realm power', async () => {
    const c = fixtureCharacter('WARRIOR');
    const rows = prepareSwap(c, { slot: 'BELT', item: weapon(40000), realm: 'oblivion', presetIds: ['p1'] });
    const r = await runTask('dropCheck', {
      items: itemsOf(rows), goals: [{ id: 'ob', target: { kind: 'oblivion', floor: 3 }, objective: { kind: 'win-chance' } }], n0: 4, maxN: 4,
    });
    expect(r.results[0].goals[0].before.n).toBe(4);
  }, 30000);

  it('goalIds limits an item to its goals, and a goal that cannot run is reported, not thrown', async () => {
    const c = fixtureCharacter('WARRIOR');
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(9000), presetIds: ['p1'] });
    const r = await runTask('dropCheck', {
      items: rows.map((x) => ({ ...itemsOf([x])[0], goalIds: ['dps', 'bad'] })),
      goals: [dummy(5), { id: 'wb', target: { kind: 'worldBoss' }, objective: { kind: 'dps' } }, { id: 'bad', target: { kind: 'chapter', chapter: 999, level: 1 }, objective: { kind: 'win-chance' } }],
      n0: 4, maxN: 4,
    });
    expect(r.results[0].goals.map((g) => g.goalId)).toEqual(['dps']);
    expect(r.results[0].errors).toEqual([{ goalId: 'bad', error: expect.stringMatching(/does not exist/) }]);
  }, 30000);

  it('cancel through the client facade resolves with aborted: true', async () => {
    const c = fixtureCharacter('WARRIOR');
    const rows = prepareSwap(c, { slot: 'WEAPON', item: weapon(9000) });
    const { promise, cancel } = runOptimizerTask({ mode: 'dropCheck', items: itemsOf(rows), goals: [dummy(60)], n0: 200 });
    cancel();
    const r = await promise;
    expect(r.aborted).toBe(true);
  }, 30000);
});
