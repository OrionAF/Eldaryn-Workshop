// search/result.js (A4): the optimiser result contract (redesign plan A.9) and its invariants I1-I3.
// Shape and field meanings: docs/Reference/simulation.md §Result. Everything here is plain JSON:
// a non-finite bound becomes null.
import { legalityOf } from './legality.js';
import { candidateEngineKey, revert } from './effect.js';

export const RESULT_SCHEMA = 'optimiser-result/2';
export const CHECKPOINT_SCHEMA = 'optimiser-checkpoint/1';

export const PHASES = Object.freeze([
  { id: 'screen', label: 'Screen' },
  { id: 'search', label: 'Search' },
  { id: 'minimise', label: 'Minimise' },
  { id: 'confirm', label: 'Confirm' },
  { id: 'attribute', label: 'Attribute' },
]);

export const MULTIPLICITY = Object.freeze({ vsBaseline: 'holm', perChange: 'holm-within-row', racing: 'bonferroni', looks: 'bonferroni', alpha: 0.05 });

// Provenance of each target assumption (app labels for the assumption ids of objectives.js targets):
// SERVER = the server decides and the client holds the value; UNRESOLVED = whether the server runs
// it is unknown; APP = a value the app assumes or the user chose.
const ASSUMPTION_TAG = {
  'server-fight': 'UNRESOLVED', 'pvp-server': 'SERVER', 'world-boss-model': 'SERVER', 'fortress-boss-model': 'SERVER',
  // Celestial (combat-pve.md §20): fitted to the server logs, or never seen in one
  'celestial-server': 'SERVER', 'celestial-add-phase': 'SERVER', 'celestial-stack-player': 'SERVER',
  'celestial-overload-end': 'UNRESOLVED', 'celestial-overload-judgment': 'UNRESOLVED', 'celestial-time-limit': 'UNRESOLVED',
  'celestial-max-alive': 'UNRESOLVED', 'celestial-fury-stacking': 'UNRESOLVED',
};

const fin = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** An Estimate (plain JSON). */
export function estimateOut(e) {
  if (!e) return null;
  return { est: fin(e.est), lo: fin(e.lo), hi: fin(e.hi), n: e.n ?? 0, seed: e.seed ?? null, level: 0.95, alphaAdj: e.alphaAdj ?? 0.05, method: e.method };
}

/** A Contrast (plain JSON). `basis` and `higherIsBetter` say what the delta measures (a TTK contrast may fall back to win rate). */
export function contrastOut(c) {
  if (!c) return null;
  return {
    delta: fin(c.delta), lo: fin(c.lo), hi: fin(c.hi), pct: fin(c.pct), n: c.n ?? 0, seed: c.seed ?? null,
    alphaAdj: c.alphaAdj ?? null, method: c.method, verdict: c.verdict, significant: c.verdict === 'better' || c.verdict === 'worse',
    nNeeded: fin(c.nNeeded), basis: c.basis ?? null, higherIsBetter: c.higherIsBetter ?? null,
    ...(c.winRate ? { winRate: { delta: fin(c.winRate.delta), lo: fin(c.winRate.lo), hi: fin(c.winRate.hi) } } : {}),
  };
}

/** The target echo: kind, label, key, fidelity and tagged assumptions. */
export function targetOut(target) {
  return {
    ...target.spec,
    ...(target.fortress ? { fortress: target.fortress } : {}),
    kind: target.kind, label: target.label, key: target.key, mode: target.mode, fidelity: target.fidelity,
    assumptions: (target.assumptions ?? []).map((a) => ({ id: a.id, label: a.label, value: a.value ?? '', tag: ASSUMPTION_TAG[a.id] ?? 'APP' })),
  };
}

/** The objective echo. */
export function objectiveOut(objective) {
  return {
    ...objective.spec,
    kind: objective.kind, label: objective.label, unit: objective.unit, higherIsBetter: objective.higherIsBetter,
    statistic: objective.statistic, q: objective.q ?? null,
  };
}

/** The headline counts and sentence. */
export function headlineOf(rows, worseHidden) {
  const count = (v) => rows.filter((r) => !r.provisional && r.vsBaseline?.verdict === v).length;
  const better = count('better');
  const equivalent = count('equivalent');
  const unresolved = count('unresolved');
  const builds = (n) => `${n} build${n === 1 ? '' : 's'}`;
  let text = better ? `${builds(better)} measured better than the current preset.` : 'No change measured better than the current preset.';
  if (equivalent) text += ` ${builds(equivalent)} equivalent.`;
  if (unresolved) text += ` ${builds(unresolved)} too close to call.`;
  if (rows.some((r) => r.provisional)) text = `Provisional: ${rows.length} build${rows.length === 1 ? '' : 's'} not confirmed.`;
  return { better, equivalent, unresolved, worseHidden, text };
}

/**
 * Invariants I1-I3 on one row (plan A.1). I1: the candidate is legal. I2: reverting any change alters
 * the engine inputs (a change legality puts straight back must sit in another change's bundle).
 * I3 (confirmed rows): every change was decided needed on the minimise stage, or is bundled.
 * @param {Object} space   createBuildSpace(...)
 * @param {Object} B       baseline candidate
 * @param {Object} row     a Row (its candidate and changes)
 * @param {{decided?: Record<string, {verdict: string}>|null}} [o]  minimise's last contrasts; null skips I3
 * @returns {string[]} violations (empty when the row holds)
 */
export function rowViolations(space, B, row, { decided = null } = {}) {
  const out = [];
  const X = row.candidate;
  const legal = legalityOf(space.character, space.presetId, X);
  if (!legal.ok) out.push(`I1 illegal: ${legal.violations.map((v) => `${v.gate} (${v.detail})`).join('; ')}`);
  if (!row.isBaseline && !row.changes.length) out.push('I1 a non-baseline row has no changes');
  if (space.admissible && !space.admissible(X)) out.push(`I1 below the Combat Power floor of ${space.powerFloor}`);
  const bundled = new Set(row.changes.flatMap((c) => c.bundle ?? []));
  const key = space.key(X);
  const ek = candidateEngineKey(space, X);
  for (const c of row.changes) {
    const Y = space.legalise(revert(space, B, X, c));
    if (space.key(Y) === key) {
      if (!bundled.has(c.id)) out.push(`I2 change ${c.id} cannot be reverted and is in no bundle`);
      continue;
    }
    if (space.admissible && !space.admissible(Y)) continue; // held by the Combat Power guard: needed for legality
    let same = false;
    try {
      same = candidateEngineKey(space, Y) === ek;
    } catch {
      same = false; // the reverted build cannot fight: the change certainly matters
    }
    if (same) out.push(`I2 inert change ${c.id}: reverting it leaves the engine inputs unchanged`);
    if (decided && !bundled.has(c.id) && decided[c.id]?.verdict !== 'better') out.push(`I3 change ${c.id} was not decided needed`);
  }
  return out;
}

/** Throws on the first violated invariant (strict mode: tests and development builds). */
export function assertRow(space, B, row, o) {
  const v = rowViolations(space, B, row, o);
  if (v.length) throw new Error(`Optimiser invariant violated on row ${row.rank}: ${v.join('; ')}`);
}

/**
 * Rank rows: better by estimate (best first), then equivalent and unresolved by fewest changes. With
 * `primaryOf` (win rate: the capped rate) better rows are ordered by it, then by fewest changes, then
 * by the score, so of the builds that reach the target the one with the fewest changes leads.
 */
export function rankRows(rows, scoreOf, { primaryOf = null } = {}) {
  const prim = primaryOf ?? (() => 0);
  const better = rows.filter((r) => r.vsBaseline?.verdict === 'better')
    .sort((a, b) => prim(b) - prim(a) || (primaryOf ? a.changes.length - b.changes.length : 0) || scoreOf(b) - scoreOf(a)
      || a.changes.length - b.changes.length || (a.key < b.key ? -1 : 1));
  const rest = rows.filter((r) => r.vsBaseline?.verdict !== 'better')
    .sort((a, b) => a.changes.length - b.changes.length || scoreOf(b) - scoreOf(a) || (a.key < b.key ? -1 : 1));
  return [...better, ...rest].map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Builds equal in effect on this target (bit-identical outcome vectors at the same n, A.5 b): of each
 * set the one nearest the baseline stays (then the smaller key). Rows carry `_sig` (n and a hash of the
 * vectors) and `_dist` (distanceOf). Keeps the input order.
 * @returns {{rows: Object[], merged: number}}
 */
export function nearestOfEqual(rows) {
  const bySig = new Map();
  for (const r of rows) {
    const k = bySig.get(r._sig);
    if (!k || r._dist < k._dist || (r._dist === k._dist && r.key < k.key)) bySig.set(r._sig, r);
  }
  const kept = rows.filter((r) => bySig.get(r._sig) === r);
  return { rows: kept, merged: rows.length - kept.length };
}

/**
 * Tie groups over ranked rows (simulation.md §Minimise and confirm, Ranking): adjacent `better` rows
 * not resolved apart (Bonferroni over the adjacent pairs) share a group, the first one's rank; other
 * `better` rows have null; `equivalent` and `unresolved` rows have 0 (not resolved apart from the
 * baseline). `apart(a, b, alpha)` resolves whether the pair differs. Sets `tieGroup` in place.
 * @returns {Promise<Object[]>} the rows
 */
export async function groupTies(ranked, apart, alpha = MULTIPLICITY.alpha) {
  const better = ranked.filter((r) => r.vsBaseline?.verdict === 'better');
  for (const r of ranked) r.tieGroup = r.vsBaseline?.verdict === 'better' ? null : 0;
  const a = alpha / Math.max(1, better.length - 1);
  for (let i = 1; i < better.length; i++) {
    const [x, y] = [better[i - 1], better[i]];
    if (!(await apart(x, y, a))) {
      x.tieGroup = x.tieGroup ?? x.rank;
      y.tieGroup = x.tieGroup;
    }
  }
  return ranked;
}

/** A failed result (setup blocker or engine error): no rows, the reason stated. */
export function failedResult({ request, target, objective, warnings = [], baselineViolations = [], error = null, ms = 0 }) {
  return {
    schema: RESULT_SCHEMA,
    status: 'failed',
    aborted: false,
    error: error ? { message: error } : null,
    request,
    target,
    objective,
    headline: { better: 0, equivalent: 0, unresolved: 0, worseHidden: 0, text: error ?? 'The current preset breaks a game rule; fix it before optimising.' },
    baseline: null,
    rows: [],
    search: null,
    phases: PHASES.map((p) => ({ ...p, state: 'not-run', fights: 0, ms: 0 })),
    multiplicity: { ...MULTIPLICITY },
    warnings,
    baselineViolations,
    checkpoint: null,
    stats: { ms, workers: 1 },
  };
}
