import { describe, it, expect } from 'vitest';
import { oblivionFloors } from './oblivionFloors.js';

const stats = (o = {}) => ({
  totalHp: 1e9, totalAttack: 1e9, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, totalOblivionPower: 0, ...o,
});
const fighter = (o) => ({ stats: stats(o), class: 'WARRIOR', spec: null, sigils: [] });
// Cannot kill anything but cannot die: stalls until the cap.
const stall = () => fighter({ totalAttack: 1, totalHp: 1e12, totalDamageReduction: 0.99 });

describe('oblivionFloors', () => {
  it('splits wins, deaths and timeouts and reports assumptions', async () => {
    const r = await oblivionFloors({ fighter: fighter(), floors: [1], n: 4 });
    expect(r.rows[0]).toMatchObject({ wins: 4, deaths: 0, timeouts: 0, n: 4 });
    expect(r.assumptions.map((a) => a.key)).toEqual(expect.arrayContaining(['fight-cap', 'oblivion-output-cut']));
  });
  it('is not stopped by timeouts and uses the 20-minute cap', async () => {
    const r = await oblivionFloors({ fighter: stall(), floors: [1, 2, 3], n: 1, stopAfter: 2 });
    expect(r.rows).toHaveLength(3);
    expect(r.rows.every((x) => x.timeouts === 1 && x.deaths === 0)).toBe(true);
  });
  it('notes the output cut only when it is applied', async () => {
    const keys = async (o) => (await oblivionFloors({ fighter: fighter(), floors: [1], n: 1, ...o })).assumptions.map((a) => a.key);
    expect(await keys({})).not.toContain('output-cut-applied');
    expect(await keys({ applyOutputCut: true })).toContain('output-cut-applied');
  });
  it('a 6-15 minute kill wins under the default 20-minute cap and times out under maxMs 300000', async () => {
    const slow = fighter({ totalAttack: 4e4, totalHp: 1e12, totalDamageReduction: 0.99 });
    const r = await oblivionFloors({ fighter: slow, floors: [1], n: 1 });
    expect(r.rows[0]).toMatchObject({ wins: 1, timeouts: 0 });
    expect(r.rows[0].medianMs).toBeGreaterThan(300000);
    const c = await oblivionFloors({ fighter: slow, floors: [1], n: 1, maxMs: 300000 });
    expect(c.rows[0]).toMatchObject({ wins: 0, timeouts: 1 });
    expect(c.assumptions.find((a) => a.key === 'fight-cap').text).toContain('5 minutes');
  });
  it('stops after floors with neither wins nor timeouts', async () => {
    const weak = fighter({ totalAttack: 1, totalHp: 1 });
    const r = await oblivionFloors({ fighter: weak, floors: [1, 2, 3, 4, 5], n: 2, stopAfter: 2 });
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].deaths).toBe(2);
  });
  it('n = 0 and a pre-aborted signal return empty rows', async () => {
    expect((await oblivionFloors({ fighter: fighter(), n: 0 })).rows).toEqual([]);
    const ac = new AbortController();
    ac.abort();
    const r = await oblivionFloors({ fighter: fighter(), n: 4 }, { signal: ac.signal });
    expect(r).toMatchObject({ rows: [], aborted: true, maxFloor: null });
  });
  it('handles non-contiguous floors and flags scanCapped on the last data floor', async () => {
    const r = await oblivionFloors({ fighter: fighter({ totalOblivionPower: 5000 }), floors: [2, 60], n: 2, threshold: 0.5 });
    expect(r.rows.map((x) => x.floor)).toEqual([2, 60]);
    expect(r.maxFloor).toBe(60);
    expect(r.scanCapped).toBe(true);
    expect((await oblivionFloors({ fighter: fighter(), floors: [2], n: 2 })).scanCapped).toBe(false);
  });
});
