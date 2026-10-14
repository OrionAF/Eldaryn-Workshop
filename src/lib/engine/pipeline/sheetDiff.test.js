import { describe, it, expect } from 'vitest';
import { diffSheet, summariseDiff } from './sheetDiff.js';

describe('diffSheet', () => {
  const computed = { totalAttack: 1200, totalHp: 5500, totalCritChance: 72.2, rawCritChance: 90, totalBlockChance: 30 };

  it('reports delta = sheet - computed and tolerance per kind', () => {
    const rows = diffSheet(computed, { values: { totalAttack: 1201, totalHp: 5503, totalCritChance: 72.25 } });
    expect(rows.map((r) => r.key)).toEqual(['totalAttack', 'totalHp', 'totalCritChance']);
    expect(rows[0]).toMatchObject({ computed: 1200, sheet: 1201, delta: 1, withinTolerance: true });
    expect(rows[1].withinTolerance).toBe(false); // +3 > ±1
    expect(rows[2].withinTolerance).toBe(true); // 0.05 <= 0.1
  });

  it('accepts bare values and ignores unknown or non-finite entries', () => {
    const rows = diffSheet(computed, { totalAttack: 1200, totalBogus: 3, totalHp: NaN });
    expect(rows).toHaveLength(1);
    expect(rows[0].withinTolerance).toBe(true);
    expect(diffSheet(computed, null)).toEqual([]);
  });

  it('raw key falls back to the total when computed raw is at or below the soft cap', () => {
    const rows = diffSheet(computed, { rawBlockChance: 30.05, rawCritChance: 91 });
    expect(rows[0]).toMatchObject({ key: 'rawCritChance', computed: 90, delta: 1, withinTolerance: false });
    expect(rows[1]).toMatchObject({ key: 'rawBlockChance', computed: 30, withinTolerance: true });
  });

  it('a key the computed stats lack is unexplained with null delta', () => {
    const rows = diffSheet({}, { totalAttack: 5 });
    expect(rows[0]).toEqual({ key: 'totalAttack', computed: null, sheet: 5, delta: null, withinTolerance: false });
  });

  it('tolerance edge is inclusive; multipliers use 0.01', () => {
    const rows = diffSheet({ totalAttackSpeed: 1.5, totalCritChance: 50 }, { totalAttackSpeed: 1.51, totalCritChance: 50.1 });
    expect(rows.every((r) => r.withinTolerance)).toBe(true);
    const off = diffSheet({ totalAttackSpeed: 1.5 }, { totalAttackSpeed: 1.52 });
    expect(off[0].withinTolerance).toBe(false);
  });

  it('summariseDiff counts explained rows', () => {
    const rows = diffSheet(computed, { totalAttack: 1200, totalHp: 6000 });
    expect(summariseDiff(rows)).toEqual({ total: 2, explained: 1, unexplained: 1 });
  });
});
