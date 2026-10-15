// optimiser/resultAdapter.js (A4): the current ResultList and run history read the legacy entry shape;
// this maps an OptimiserResult ('optimiser-result/2', docs/Reference/simulation.md §Result) onto it until
// U8 replaces the screen. A legacy result passes through unchanged.
import { RESULT_SCHEMA } from '../../lib/search/result.js';

/** A Contrast as the legacy `vsBaseline`: delta signed so that positive is better. */
function legacyVs(c, objectiveKind) {
  if (!c) return null;
  const flip = c.higherIsBetter === false ? -1 : 1;
  const winRate = c.basis === 'winRate';
  const s = (v) => (v == null || winRate ? null : flip * v);
  return {
    delta: s(c.delta),
    lo: s(flip > 0 ? c.lo : c.hi),
    hi: s(flip > 0 ? c.hi : c.lo),
    significant: c.significant,
    pct: objectiveKind === 'dps' ? c.pct : null,
    verdict: c.verdict,
  };
}

function legacyEntry(row, objectiveKind) {
  const matchups = row.aux?.matchups ?? null;
  return {
    rank: row.rank,
    tieGroup: row.tieGroup ?? null,
    isBaseline: row.isBaseline,
    provisional: row.provisional,
    key: row.key,
    candidate: row.candidate,
    value: row.value?.est ?? null,
    lo: row.value?.lo ?? null,
    hi: row.value?.hi ?? null,
    n: row.value?.n ?? 0,
    score: 0,
    vsBaseline: legacyVs(row.vsBaseline, objectiveKind),
    changes: row.changes.map((c) => ({ id: c.id, label: c.label, from: c.from, to: c.to, scope: c.scope })),
    lines: row.lines,
    ...(matchups ? {
      perMatchupN: matchups[0]?.value?.n ?? 0,
      matchups: matchups.map((m) => ({ opponentId: m.opponentId, name: m.name, seat: m.seat, p: m.value?.est ?? null, lo: m.value?.lo ?? null, hi: m.value?.hi ?? null, n: m.value?.n ?? 0 })),
    } : {}),
  };
}

/**
 * The legacy view of a result: {status, aborted, headline, warnings, target, objective, realm, presetId,
 * seed, space, budget, baseline, results, stats: {tier1, ms}, tier}. `tier` is 2 for a finished run
 * (every value confirmed on its own seed), 1 for a cancelled one (provisional values).
 */
export function legacyView(result) {
  if (!result || result.schema !== RESULT_SCHEMA) return result;
  const kind = result.objective?.kind;
  return {
    status: result.status,
    aborted: result.status === 'cancelled',
    truncated: null,
    tier: result.status === 'done' ? 2 : 1,
    headline: result.headline,
    warnings: result.warnings,
    baselineViolations: result.baselineViolations,
    error: result.error,
    target: result.target,
    objective: result.objective,
    realm: result.request?.realm,
    presetId: result.request?.presetId,
    seed: result.request?.seed,
    space: result.request?.space,
    budget: result.request?.effort,
    baseline: result.baseline ? legacyEntry(result.baseline, kind) : null,
    results: result.rows.map((r) => legacyEntry(r, kind)),
    stats: { tier1: result.search?.evaluated ?? 0, ms: result.stats?.ms ?? 0 },
  };
}

/** Text for a legacy vsBaseline: the verdict when there is one. */
export function verdictText(vs) {
  if (!vs) return '';
  if (vs.verdict === 'unresolved') return 'too close to call';
  if (vs.verdict) return vs.verdict;
  return vs.significant ? 'significant' : 'within noise';
}
