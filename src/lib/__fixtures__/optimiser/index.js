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


// ---- PVE win-rate goal (backlog §4; simulation.md §Win rate) ----------------------------------

const wr = (delta, lo, hi, verdict, basis = 'win-rate', uncapped = {}) =>
  contrast(delta, lo, hi, verdict, { basis, method: basis === 'margin' ? 't' : 'capped-tango', winRate: { delta, lo, hi, ...uncapped } });
const wrAux = (p, lo, hi, meets) => ({ winRate: est(p, lo, hi, 2048), meetsTarget: meets, margin: est(1.2, 1.1, 1.3, 2048), target: 0.95 });

/** A win-rate result in one of the three goal states: 'reached' (default), 'not-reached' or 'already'. */
export function winRateResult(status = 'reached') {
  const r = clone(dps);
  r.objective = { kind: 'win-rate', label: 'Win rate (target 95%)', unit: 'p', higherIsBetter: true, statistic: 'proportion', q: null };
  r.target = { ...r.target, kind: 'dungeon', label: 'Dungeon Forsaken Mines, step 3' };
  r.rows = r.rows.slice(0, 2);
  const [a, b] = r.rows;
  a.tieGroup = null;
  b.tieGroup = null;
  a.rank = 1;
  b.rank = 2;
  r.baseline.value = est(0.7, 0.68, 0.72, 2048);
  r.baseline.aux = wrAux(0.7, 0.68, 0.72, false);
  if (status === 'already') {
    r.baseline.value = est(0.99, 0.98, 1, 2048);
    r.baseline.aux = wrAux(0.99, 0.98, 1, true);
    r.rows = [];
    r.search = null;
    r.goal = { target: 0.95, status, baseline: { winRate: r.baseline.value, meetsTarget: true, check: { meets: true, n: 2048, value: r.baseline.value } }, bestKey: r.baseline.key, text: 'Already clears at 99% (95% CI 98%-100%). No change needed.' };
    r.headline = { better: 0, equivalent: 0, unresolved: 0, worseHidden: 0, text: r.goal.text };
    return r;
  }
  const reached = status === 'reached';
  a.value = est(reached ? 0.96 : 0.82, reached ? 0.95 : 0.8, reached ? 0.97 : 0.84, 2048);
  a.aux = wrAux(a.value.est, a.value.lo, a.value.hi, reached);
  a.vsBaseline = wr(reached ? 0.25 : 0.12, reached ? 0.2 : 0.09, reached ? 0.3 : 0.15, 'better', 'win-rate', reached ? { delta: 0.26, lo: 0.21, hi: 0.31 } : {});
  a.changes.forEach((c) => {
    c.own = wr(0.1, 0.05, 0.15, 'better');
    c.needed = wr(0.08, 0.03, 0.13, 'better');
  });
  a.remainder = { delta: 0.02, lo: null, hi: null, method: 'difference' };
  b.value = est(0.75, 0.73, 0.77, 2048);
  b.aux = wrAux(0.75, 0.73, 0.77, false);
  b.vsBaseline = wr(0.02, -0.01, 0.05, 'better', 'margin', { delta: 0.05, lo: 0.03, hi: 0.07 });
  b.changes.forEach((c) => {
    c.own = wr(0.02, -0.01, 0.05, 'unresolved', 'margin');
    c.needed = null;
  });
  b.remainder = null;
  r.goal = {
    target: 0.95, status, baseline: { winRate: r.baseline.value, meetsTarget: false, check: { meets: false, n: 2048, value: r.baseline.value } }, bestKey: a.key,
    text: reached ? '1 build reaches 95%. Fewest changes: 1 change, win rate 96% (95% CI 95%-97%).' : 'No build was shown to reach 95%. The best build wins 82% (95% CI 80%-84%).',
  };
  r.headline = { better: 2, equivalent: 0, unresolved: 0, worseHidden: 0, text: r.goal.text };
  return r;
}

/**
 * A Push result (simulation.md §Push): from dungeon step 3 the current build clears steps 3-4, the suggested
 * build (found on step 5) clears steps 3-6, step 7 is not reached at this effort.
 */
export function pushResult() {
  const r = winRateResult('reached');
  delete r.goal;
  r.objective = { kind: 'push', target: 0.95, label: 'Push: deepest step at 95%', unit: 'p', higherIsBetter: true, statistic: 'proportion', q: null };
  r.request = { ...r.request, target: { kind: 'dungeon', id: 'dungeon_1', step: 3 }, objective: { kind: 'push', target: 0.95 } };
  r.target = { ...r.target, kind: 'dungeon', id: 'dungeon_1', step: 3, label: 'Dungeon Forsaken Mines, step 3' };
  r.rows = r.rows.slice(0, 1);
  r.search = null;
  r.phases = [
    { id: 'climb', label: 'Climb', state: 'done', fights: 900, ms: 10 },
    { id: 'screen', label: 'Screen', state: 'done', fights: 300, ms: 10 },
    { id: 'optimise', label: 'Optimise', state: 'done', fights: 40000, ms: 10 },
    { id: 'confirm', label: 'Confirm', state: 'done', fights: 1200, ms: 10 },
  ];
  const rung = (i, current, build) => ({ index: i, label: `step ${i + 1}`, key: `{"id":"dungeon_1","kind":"dungeon","step":${i + 1}}`, current, build });
  r.push = {
    target: 0.95, status: 'pushed',
    ladder: { kind: 'dungeon', label: 'Dungeon Forsaken Mines', size: 8 },
    start: { index: 2, label: 'step 3' },
    baseline: { deepest: 3, label: 'step 4', searched: 3 },
    reached: { deepest: 5, label: 'step 6', key: r.rows[0].key, foundAt: 4, foundLabel: 'step 5', searched: 5 },
    stop: { index: 6, label: 'step 7', reason: 'screen', best: { est: 0.4, lo: 0.2, hi: 0.6, n: 64, seed: null, level: 0.95, alphaAdj: 0.001, method: 'wilson' } },
    rungs: [rung(2, 'clears', 'clears'), rung(3, 'clears', 'clears'), rung(4, 'fails', 'clears'), rung(5, null, 'clears'), rung(6, null, null)],
    contradictions: [],
    text: 'Reaches step 6 (now: step 4) at 95%. Step 7 is not reached at this effort: no build one change away comes plausibly near 95% and no single change raises the rate (best seen 40%).',
  };
  r.headline = { better: 1, equivalent: 0, unresolved: 0, worseHidden: 0, text: r.push.text };
  return r;
}
