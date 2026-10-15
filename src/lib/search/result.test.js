import { describe, it, expect } from 'vitest';
import { rowViolations, assertRow, contrastOut, estimateOut, headlineOf, rankRows, targetOut, failedResult, RESULT_SCHEMA } from './result.js';
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

  it('targets carry tagged assumptions; a failed result explains itself', () => {
    const t = targetOut(resolveTarget({ kind: 'dungeon', id: 'dungeon_1', step: 2 }));
    expect(t.fidelity).toBe('server-model');
    expect(t.assumptions.find((a) => a.id === 'server-fight')).toMatchObject({ tag: 'UNRESOLVED', value: '' });
    const f = failedResult({ request: {}, target: t, objective: {}, baselineViolations: [{ gate: 'relicSlots', field: 'relicIds', detail: 'x' }] });
    expect(f).toMatchObject({ schema: RESULT_SCHEMA, status: 'failed', rows: [], baseline: null });
    expect(f.phases.every((p) => p.state === 'not-run')).toBe(true);
  });
});
