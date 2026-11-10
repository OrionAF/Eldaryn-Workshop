import { describe, it, expect } from 'vitest';
import { deepGoals, deepGuards, deepRequest, deepCard, figureText } from './deepCheckView.js';

const r = (id, o = {}) => ({ goal: { id, target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' }, guard: o.role === 'guard' ? { target: 0.9 } : undefined }, ok: true, realm: 'base', role: 'judge', presetIds: null, label: id, ...o });
const resolved = [r('a'), r('b', { presetIds: ['p2'] }), r('c', { realm: 'oblivion' }), r('g', { role: 'guard' }), r('bad', { ok: false })];

describe('deepCheckView', () => {
  it('judge goals and guards of the realm that judge the preset', () => {
    expect(deepGoals(resolved, 'base', 'p1').map((x) => x.goal.id)).toEqual(['a']);
    expect(deepGoals(resolved, 'base', 'p2').map((x) => x.goal.id)).toEqual(['a', 'b']);
    expect(deepGuards(resolved, 'base', 'p1').map((x) => x.goal.id)).toEqual(['g']);
  });

  it('deepRequest: the judge goal, the guards, the space and the budget; null without a judge goal', () => {
    const o = { character: { id: 'c' }, presetId: 'p1', drop: { slot: 'WEAPON', item: { x: 1 } }, realm: 'base', resolved, goalId: 'a', space: 'light', minutes: 5, precision: 'quick', seed: 7 };
    expect(deepRequest(o)).toMatchObject({ mode: 'dropDeepCheck', goal: { id: 'a' }, guards: [{ id: 'g', role: 'guard', guard: { target: 0.9 } }], space: 'light', budgetMs: 300000, effort: { level: 'quick' }, seed: 7, drop: { slot: 'WEAPON', realm: 'base' } });
    expect(deepRequest({ ...o, goalId: 'b' })).toBeNull();
    expect(deepRequest({ ...o, goalId: 'g' })).toBeNull();
  });

  it('figureText on each axis', () => {
    expect(figureText({ axis: 'pct', est: 5, lo: 4, hi: 6 })).toBe('+5.0% (+4.0% to +6.0%)');
    expect(figureText({ axis: 'pts', est: -1.25, lo: -2, hi: -0.5 })).toBe('-1.3 pts (-2.0 to -0.5)');
    expect(figureText(null)).toBe('');
  });

  it('deepCard: verdict chip, changes, reuse and the unworn case', () => {
    const m = (d) => ({ unit: 'dps', deltaKind: 'relative', before: { mean: 1000 }, delta: { delta: d, lo: d - 10, hi: d + 10, n: 64 } });
    const c = deepCard({ status: 'done', verdict: 'upgrade', drop: m(50), retune: m(-10), without: { run: { reused: true }, changes: [] }, with: { changes: [{ label: 'Talent', from: 'A', to: 'B' }] }, guards: [] });
    expect(c).toMatchObject({ chip: { verdict: 'better', label: 'Upgrade' }, drop: '+5.0% (+4.0% to +6.0%)', retune: '-1.0% (-2.0% to 0.0%)', withChanges: ['Talent: A → B'], reused: true, unworn: false });
    expect(deepCard({ status: 'done', verdict: 'sidegrade', reason: 'unworn', drop: m(0) }).unworn).toBe(true);
    expect(deepCard({ status: 'cancelled', partial: true }).chip.verdict).toBe('unresolved');
  });
});
