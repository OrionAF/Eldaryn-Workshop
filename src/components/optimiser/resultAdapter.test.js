import { describe, it, expect } from 'vitest';
import { legacyView, verdictText } from './resultAdapter.js';
import { runFromResult } from '../../lib/model/runs.js';

const est = (v, n = 32) => ({ est: v, lo: v - 1, hi: v + 1, n, seed: 1, level: 0.95, alphaAdj: 0.05, method: 't' });
const contrast = (o) => ({ delta: null, lo: null, hi: null, pct: null, n: 32, seed: 1, alphaAdj: 0.05, method: 'paired-t', verdict: 'better', significant: true, nNeeded: null, basis: null, higherIsBetter: true, ...o });
const row = (o = {}) => ({
  rank: 1, tieGroup: null, isBaseline: false, provisional: false, key: 'k1', engineKey: 'e1', candidate: { petId: null }, value: est(1100), aux: {},
  vsBaseline: contrast({ delta: 100, lo: 50, hi: 150, pct: 0.1 }),
  changes: [{ id: 'pet', dimension: 'pet', label: 'Pet', from: 'Drake', to: 'None', scope: 'preset', owner: {}, sideEffects: [], bundle: [], own: null, needed: null, keptBecause: 'own-effect' }],
  remainder: null, writes: [], runMore: null, lines: [{ label: 'Pet', value: 'None' }], ...o,
});
const result = (o = {}) => ({
  schema: 'optimiser-result/2', status: 'done', error: null,
  request: { presetId: 'p1', realm: 'base', seed: 3, space: { pet: true }, effort: { level: 'quick' } },
  target: { kind: 'dummy', label: 'Training dummy, 60 s' }, objective: { kind: 'dps', label: 'Damage per second', unit: 'dps', higherIsBetter: true },
  headline: { better: 1, equivalent: 0, unresolved: 0, worseHidden: 0, text: '1 build measured better than the current preset.' },
  baseline: row({ rank: 0, isBaseline: true, key: 'k0', value: est(1000), vsBaseline: null, changes: [] }),
  rows: [row()], search: { evaluated: 7 }, phases: [], warnings: [], baselineViolations: [], checkpoint: null, stats: { ms: 1200, workers: 1 },
  ...o,
});

describe('legacyView', () => {
  it('maps rows onto the legacy entries the current screen and run history read', () => {
    const v = legacyView(result());
    expect(v).toMatchObject({ status: 'done', aborted: false, tier: 2, presetId: 'p1', realm: 'base', seed: 3, stats: { tier1: 7, ms: 1200 } });
    expect(v.baseline).toMatchObject({ isBaseline: true, value: 1000, lo: 999, hi: 1001, n: 32, vsBaseline: null });
    expect(v.results[0]).toMatchObject({ rank: 1, value: 1100, vsBaseline: { delta: 100, lo: 50, hi: 150, pct: 0.1, significant: true, verdict: 'better' } });
    expect(v.results[0].changes).toEqual([{ id: 'pet', label: 'Pet', from: 'Drake', to: 'None', scope: 'preset' }]);
  });

  it('signs a lower-is-better contrast as a gain and hides a win-rate fallback delta', () => {
    const ttk = legacyView(result({ objective: { kind: 'ttk-median', unit: 'ms', higherIsBetter: false }, rows: [row({ vsBaseline: contrast({ delta: -300, lo: -500, hi: -100, higherIsBetter: false }) })] }));
    expect(ttk.results[0].vsBaseline).toMatchObject({ delta: 300, lo: 100, hi: 500, pct: null });
    const wr = legacyView(result({ rows: [row({ vsBaseline: contrast({ delta: 0.2, lo: 0.1, hi: 0.3, basis: 'winRate' }) })] }));
    expect(wr.results[0].vsBaseline).toMatchObject({ delta: null, lo: null, hi: null, significant: true });
  });

  it('carries PVP matchups and a saved run reads the view', () => {
    const m = (seat) => ({ opponentId: 'o', name: 'Tanky', seat, value: est(0.5, 16), vsBaseline: null });
    const v = legacyView(result({ objective: { kind: 'pvp-winrate', unit: 'p' }, rows: [row({ aux: { matchups: [m('attacker'), m('defender')] } })] }));
    expect(v.results[0]).toMatchObject({ perMatchupN: 16, matchups: [{ seat: 'attacker', p: 0.5, n: 16 }, { seat: 'defender', p: 0.5, n: 16 }] });
    const run = runFromResult(legacyView(result()), { id: 'r1', at: '2026-10-15T00:00:00.000Z' });
    expect(run.headline).toMatchObject({ baseline: 1000, best: 1100, gainPct: 0.1, significant: true, evaluated: 7, changes: 1 });
  });

  it('passes a legacy result through and names verdicts', () => {
    const legacy = { results: [], baseline: null };
    expect(legacyView(legacy)).toBe(legacy);
    expect(verdictText({ verdict: 'unresolved' })).toBe('too close to call');
    expect(verdictText({ significant: false })).toBe('within noise');
  });
});
