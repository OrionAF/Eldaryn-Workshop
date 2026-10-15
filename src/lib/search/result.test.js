import { describe, it, expect } from 'vitest';
import { rowViolations, assertRow, contrastOut, estimateOut, headlineOf, rankRows, groupTies, nearestOfEqual, targetOut, failedResult, RESULT_SCHEMA } from './result.js';
import { createBuildSpace } from './space.js';
import { changesOf } from './effect.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { resolveTarget } from './objectives.js';

const character = fixtureCharacter('WARRIOR');
const space = createBuildSpace(character, 'p1', { mode: 'pve' });
const B = space.start;
const rowOf = (X) => ({ rank: 1, isBaseline: false, candidate: X, changes: changesOf(space, B, X) });

describe('invariants I1-I3 (plan A.1)', () => {
  it('I2: a row carrying an inert change throws (a DAMAGE sigil condition is not a PVE input)', () => {
    // CATACLYSM casts on cooldown in PVE whatever its condition (combat-pve.md §10.1)
    const X = space.canonical({ ...B, sigilConditions: { CATACLYSM: 'ENEMY_HP_BELOW_40' } });
    const row = rowOf(X);
    expect(row.changes.map((c) => c.id)).toEqual(['condition:CATACLYSM']);
    expect(rowViolations(space, B, row).join()).toMatch(/I2 inert change condition:CATACLYSM/);
    expect(() => assertRow(space, B, row)).toThrow(/invariant violated/);
  });

  it('a row whose every change alters the engine inputs passes I1 and I2', () => {
    const X = space.canonical({ ...B, petId: null });
    expect(rowViolations(space, B, rowOf(X))).toEqual([]);
  });

  it('I1: an illegal candidate and a change-less row are violations', () => {
    const X = space.canonical({ ...B, relicIds: Object.keys(character.relics).slice(0, 5) });
    expect(rowViolations(space, B, rowOf(X)).join()).toMatch(/I1 illegal/);
    expect(rowViolations(space, B, { rank: 2, isBaseline: false, candidate: B, changes: [] })).toEqual(['I1 a non-baseline row has no changes']);
  });

  it('I3: a confirmed row may only carry changes the minimise stage found needed', () => {
    const X = space.canonical({ ...B, petId: null });
    expect(rowViolations(space, B, rowOf(X), { decided: { pet: { verdict: 'equivalent' } } })).toEqual(['I3 change pet was not decided needed']);
    expect(rowViolations(space, B, rowOf(X), { decided: { pet: { verdict: 'better' } } })).toEqual([]);
  });
});

describe('result shapes', () => {
  it('contrasts and estimates are plain JSON: infinite bounds become null', () => {
    const c = contrastOut({ delta: 1, lo: -Infinity, hi: Infinity, pct: NaN, n: 8, seed: 1, alphaAdj: 0.01, method: 'paired-bootstrap', verdict: 'unresolved', nNeeded: 40, p: 0.3, sd: 2 });
    expect(c).toEqual({ delta: 1, lo: null, hi: null, pct: null, n: 8, seed: 1, alphaAdj: 0.01, method: 'paired-bootstrap', verdict: 'unresolved', significant: false, nNeeded: 40, basis: null, higherIsBetter: null });
    expect(estimateOut({ est: Infinity, lo: 3, hi: Infinity, n: 4, method: 'order-stat' })).toMatchObject({ est: null, lo: 3, hi: null, level: 0.95 });
  });

  it('the headline counts verdicts', () => {
    const rows = ['better', 'better', 'equivalent', 'unresolved'].map((verdict) => ({ provisional: false, vsBaseline: { verdict } }));
    expect(headlineOf(rows, 1)).toEqual({ better: 2, equivalent: 1, unresolved: 1, worseHidden: 1, text: '2 builds measured better than the current preset. 1 build equivalent. 1 build too close to call.' });
    expect(headlineOf([], 0).text).toBe('No change measured better than the current preset.');
  });

  it('better rows rank by estimate, then the rest by fewest changes', () => {
    const r = (key, verdict, score, n) => ({ key, vsBaseline: { verdict }, changes: Array(n).fill({}), score });
    const ranked = rankRows([r('e', 'equivalent', 9, 2), r('a', 'better', 1, 3), r('b', 'better', 5, 1), r('u', 'unresolved', 0, 1)], (x) => x.score);
    expect(ranked.map((x) => [x.key, x.rank])).toEqual([['b', 1], ['a', 2], ['u', 3], ['e', 4]]);
  });

  it('tie groups: adjacent better rows not resolved apart share the first rank; the rest are null or 0', async () => {
    const r = (key, verdict, score) => ({ key, vsBaseline: { verdict }, changes: [{}], score });
    const ranked = rankRows([r('a', 'better', 9), r('b', 'better', 8), r('c', 'better', 7), r('d', 'better', 3), r('e', 'better', 2), r('u', 'unresolved', 5), r('q', 'equivalent', 4)], (x) => x.score);
    const seen = [];
    // a~b and b~c are not resolved apart; c|d and d|e are
    const tied = new Set(['a|b', 'b|c']);
    await groupTies(ranked, async (x, y, alpha) => {
      seen.push([`${x.key}|${y.key}`, alpha]);
      return !tied.has(`${x.key}|${y.key}`);
    });
    expect(ranked.map((x) => [x.key, x.rank, x.tieGroup])).toEqual([['a', 1, 1], ['b', 2, 1], ['c', 3, 1], ['d', 4, null], ['e', 5, null], ['u', 6, 0], ['q', 7, 0]]);
    // Bonferroni over the four adjacent better pairs
    expect(seen.map(([p]) => p)).toEqual(['a|b', 'b|c', 'c|d', 'd|e']);
    expect(seen.every(([, a]) => a === 0.05 / 4)).toBe(true);
  });

  it('builds equal in effect: of rows with one outcome signature the nearest (then smaller key) stays', () => {
    const r = (key, sig, dist) => ({ key, _sig: sig, _dist: dist });
    const out = nearestOfEqual([r('k3', 's1', 2), r('k2', 's1', 1), r('k1', 's2', 3), r('k0', 's1', 1), r('k4', 's3', 1)]);
    expect(out.rows.map((x) => x.key)).toEqual(['k1', 'k0', 'k4']);
    expect(out.merged).toBe(2);
  });

  it('targets carry tagged assumptions; a failed result explains itself', () => {
    const t = targetOut(resolveTarget({ kind: 'dungeon', id: 'dungeon_1', step: 2 }));
    expect(t.fidelity).toBe('server-model');
    expect(t.assumptions.find((a) => a.id === 'server-fight')).toMatchObject({ tag: 'UNRESOLVED', value: '' });
    const f = failedResult({ request: {}, target: t, objective: {}, baselineViolations: [{ gate: 'relicSlots', field: 'relicIds', detail: 'x' }] });
    expect(f).toMatchObject({ schema: RESULT_SCHEMA, status: 'failed', rows: [], baseline: null });
    expect(f.phases.every((p) => p.state === 'not-run')).toBe(true);
  });
});
