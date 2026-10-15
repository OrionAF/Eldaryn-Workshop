// Contract fixtures for the Optimiser page and run history: real 'optimiser-result/2' results recorded from
// search/search.js (dps.json: a dummy fight, relics + talents; ttk.json: chapter 1-1, median time to kill,
// relics) and variants of them that exercise the rest of the contract (docs/Reference/simulation.md §Result).
import dps from './dps.json';
import ttk from './ttk.json';

const clone = (x) => structuredClone(x);

export const dpsResult = () => clone(dps);
export const ttkResult = () => clone(ttk);

const est = (v, lo, hi, n = 64) => ({ est: v, lo, hi, n, seed: 7, level: 0.95, alphaAdj: 0.05, method: 'wilson' });
const contrast = (delta, lo, hi, verdict, extra = {}) => ({
  delta, lo, hi, pct: null, n: 64, seed: 7, alphaAdj: 0.025, method: 'newcombe', verdict,
  significant: verdict === 'better' || verdict === 'worse', nNeeded: null, basis: null, higherIsBetter: true, ...extra,
});

/** A DPS result shaped for the rest of the contract: a tie group, an unresolved row with Run more, a remainder, side effects. */
export function richResult() {
  const r = clone(dps);
  const [a, b, c] = r.rows;
  a.tieGroup = 1;
  a.rank = 1;
  b.tieGroup = 1;
  b.rank = 2;
  c.tieGroup = null;
  c.rank = 3;
  c.vsBaseline = { ...c.vsBaseline, verdict: 'unresolved', significant: false, nNeeded: 2400, lo: -1200, hi: 9000, delta: 3900 };
  c.runMore = { targetN: 4096, reason: 'unresolved' };
  a.remainder = { delta: 1200, lo: null, hi: null, method: 'difference' };
  a.writes = [
    { scope: 'character', title: 'Talents (set 1)', owner: { talentSet: 0 }, changeIds: ['talents:0'], sideEffects: [{ presetId: 'p2', name: 'Boss build', reason: 'uses Talent Set 1' }] },
    { scope: 'preset', title: 'Preset Main', owner: { presetId: 'p1' }, changeIds: ['relics'], sideEffects: [] },
  ];
  a.changes[0].sideEffects = [{ presetId: 'p2', name: 'Boss build', reason: 'uses Talent Set 1' }];
  r.headline = { better: 2, equivalent: 0, unresolved: 1, worseHidden: 1, text: '2 builds measured better than the current preset; 1 is too close to call.' };
  return r;
}

/** A PVP win-rate result: per-matchup rows on the leader. */
export function pvpResult() {
  const r = clone(dps);
  r.rows = r.rows.slice(0, 1);
  r.target = { kind: 'pvp', opponentIds: ['opp-a'], seats: 'both', label: 'PVP vs Tanky, both seats', key: 'pvp', mode: 'pvp', fidelity: 'server-model', assumptions: [{ id: 'pvp-server', label: 'Arena fights are resolved by the server', value: '', tag: 'SERVER' }] };
  r.objective = { kind: 'pvp-winrate', label: 'PVP win rate', unit: 'p', higherIsBetter: true, statistic: 'proportion', q: null };
  r.request = { ...r.request, mode: 'pvp', target: { kind: 'pvp', opponentIds: ['opp-a'], seats: 'both' }, objective: { kind: 'pvp-winrate' }, effort: { ...r.request.effort, deltaKind: 'absolute', delta: 0.01 } };
  r.baseline.value = est(0.5, 0.42, 0.58);
  const row = r.rows[0];
  row.value = est(0.62, 0.54, 0.69);
  row.vsBaseline = contrast(0.12, 0.03, 0.21, 'better');
  row.changes.forEach((ch) => { ch.own = contrast(0.07, 0.01, 0.13, 'better'); ch.needed = contrast(0.05, 0.0, 0.1, 'better'); });
  row.remainder = null;
  row.aux = {
    meanMs: 21000,
    timeoutShare: 0.01,
    matchups: [
      { opponentId: 'opp-a', name: 'Tanky', seat: 'attacker', value: est(0.7, 0.58, 0.8, 32), vsBaseline: contrast(0.1, -0.02, 0.22, 'unresolved') },
      { opponentId: 'opp-a', name: 'Tanky', seat: 'defender', value: est(0.54, 0.42, 0.66, 32), vsBaseline: contrast(0.14, 0.02, 0.26, 'better') },
    ],
  };
  r.headline = { better: 1, equivalent: 0, unresolved: 0, worseHidden: 0, text: '1 build measured better than the current preset.' };
  return r;
}

/** A run saved before schema 2 (model/runs.js RunEntry detail): values are score-space numbers. */
export function legacyRun(id = 'legacy-1') {
  const entry = (rank, o = {}) => ({
    rank, isBaseline: rank === 0, key: `k${rank}`, candidate: {}, value: 1000 + rank * 50, lo: 990, hi: 1010 + rank * 50, n: 64, score: 0,
    vsBaseline: rank ? { delta: 50 * rank, lo: 10, hi: 90 * rank, significant: true, pct: 0.05 * rank } : null,
    changes: [{ label: 'Relics', from: 'None', to: 'Swift Emblem' }], lines: [{ label: 'Relics', value: 'Swift Emblem' }], ...o,
  });
  return {
    id, kind: 'optimise', at: '2026-09-01T10:00:00.000Z', name: 'Old run', notes: '', pinned: false,
    presetId: 'p1', presetName: 'Main', realm: 'base',
    target: { kind: 'dummy', seconds: 60, label: 'Training dummy, 60 s', key: '{"kind":"dummy","seconds":60}' },
    objective: { kind: 'dps', label: 'Damage per second', unit: 'dps', higherIsBetter: true },
    seed: 3, space: { relics: true }, budget: { n1: 16 },
    headline: { unit: 'dps', higherIsBetter: true, tier: 2, aborted: false, truncated: null, baseline: 1000, best: 1050, gainPct: 0.05, significant: true, n: 64, evaluated: 42, changes: 1 },
    detail: { baseline: entry(0), results: [entry(1)] },
  };
}
