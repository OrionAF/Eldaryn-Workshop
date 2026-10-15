// model/runs.js - persisted `runs` (rebuild-plan §3), owned by F2a. Pure; imports nothing.
//
// Domain contract (§3 "Normalisation layout"): every function deals in a PARTIAL CHARACTER.
//   defaultRuns() / normaliseRuns(rawCharacter, ctx) / migrateRunsFromV1(v1Character) / reconcileRuns(character)
//
// An OptimiserRun is the saved outcome of one optimiser run (search/search.js OptimiserResult), plain data
// only: every name is resolved to text when the run is recorded (build/describe.js lines), so a run keeps
// reading correctly after renames, deletions or a class change. Newest first.
//
//   {
//     id, kind: 'optimise', at: ISO string, name, notes, pinned,
//     presetId, presetName, realm: 'base'|'oblivion',
//     target:    {kind, label, key, ...spec},          objective: {kind, label, unit, higherIsBetter, ...},
//     seed, space: {...toggles}, budget: {...},
//     headline: {                                      small, kept forever (history charts)
//       unit, higherIsBetter, tier: 1|2, aborted, truncated,
//       baseline: number|null, best: number|null,      headline values of the current preset and the top result
//       gainPct: number|null, significant: boolean|null,   top vs current: DPS only for the %, CI-based flag
//       n: fights behind the top value, evaluated: tier-1 candidates, changes: number of lines that differ
//     },
//     detail: {                                        compacts to null beyond RUN_DETAIL_LIMIT unpinned runs
//       baseline: RunEntry, results: RunEntry[] (top RUN_DETAIL_RESULTS; `lines` only on the first RUN_DETAIL_FULL_LINES)
//     } | null
//   }
//   steps: [{id, state, reason, pass, tried, fights, improved}]   optional: the search's final per-block rows
//     (simulation.md §Progress); absent on a run saved before they existed, on a Push run and on a cancelled one
//   RunEntry = {rank, isBaseline, key, candidate, value, lo, hi, n, score, vsBaseline, changes, lines}
//
// Schema 2 (`schema: 2`, redesign plan U8) records an 'optimiser-result/2' result (docs/Reference/simulation.md
// §Result): `budget` is the request's effort, `characterKey` the snapshot it was measured on, `headline` adds
// `text` and the verdict counts, and `detail` is {baseline: Row, rows: Row[]} with Row = {rank, tieGroup,
// isBaseline, key, candidate, value: Estimate, aux, vsBaseline: Contrast|null, changes (each with own, needed,
// keptBecause, sideEffects), remainder, lines}. Schema 1 runs (no `schema`) keep the RunEntry detail above and
// show per-change effects as "not measured". `powerFloor` is the run's Combat Power guard (absent: none) and each
// schema 2 Row keeps its Combat Power as `power` (absent on older runs). A PVE win-rate run also keeps `headline.goal` {status, target, mode?}, each
// Row's `aux.meetsTarget` / `aux.target` and each Contrast's `winRate` {delta, lo, hi}. A Push run (simulation.md §Push)
// keeps `headline.push` {status, target, ladder, start, baseline, reached, stop} (rung indexes and labels) and
// `detail.push` {rungs: [{index, label, current, build}]} (the ladder strip). `applied` is {at, rank} once a row was written to the preset.
//
// Budget (single localStorage key, so overflow is prevented up front; storage.js also reports a failed save):
// detail drops oldest-first until the history fits RUN_BYTE_BUDGET, then whole rows beyond
// RUN_MAX_ROWS (pinned runs are exempt from both). storage.js saveRoster applies the roster-wide
// ROSTER_RUN_BYTE_BUDGET across every character with enforceRosterRunsBudget.

export const RUN_KIND = 'optimise';
export const RUN_DETAIL_LIMIT = 50;      // runs that keep their detail (pinned exempt)
export const RUN_DETAIL_RESULTS = 10;    // entries kept in a detail
export const RUN_DETAIL_FULL_LINES = 3;  // of those, entries that also keep their full describe lines
export const RUN_BYTE_BUDGET = 1_500_000;
export const RUN_MAX_ROWS = 2000;
export const ROSTER_RUN_BYTE_BUDGET = 3_000_000; // all characters together; localStorage holds about 5M characters in total

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, d = '') => (typeof v === 'string' ? v : d);
const plain = (v) => (isObj(v) ? JSON.parse(JSON.stringify(v)) : {});

let counter = 0;
const newRunId = () => `run-${Date.now().toString(36)}-${(counter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

function normaliseEntry(e) {
  if (!isObj(e)) return null;
  const vs = isObj(e.vsBaseline) ? e.vsBaseline : null;
  return {
    rank: Number.isInteger(e.rank) ? e.rank : 0,
    isBaseline: e.isBaseline === true,
    key: str(e.key),
    candidate: plain(e.candidate),
    value: num(e.value), lo: num(e.lo), hi: num(e.hi), n: num(e.n) ?? 0, score: num(e.score) ?? 0,
    vsBaseline: vs ? { delta: num(vs.delta), lo: num(vs.lo), hi: num(vs.hi), significant: vs.significant === true, pct: num(vs.pct) } : null,
    changes: (Array.isArray(e.changes) ? e.changes : []).filter(isObj).map((c) => ({ label: str(c.label), from: str(c.from), to: str(c.to) })),
    lines: (Array.isArray(e.lines) ? e.lines : []).filter(isObj).map((l) => ({ label: str(l.label), value: str(l.value) })),
  };
}

const VERDICTS = ['better', 'worse', 'equivalent', 'unresolved'];
const KEPT_BECAUSE = ['own-effect', 'interaction', 'power-floor'];
/** The Combat Power guard of a run (simulation.md §Build space): a positive whole number, else null. */
const powerFloorOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : null);
const SCOPES = ['preset', 'character', 'mount'];

function normaliseEstimate(e) {
  if (!isObj(e)) return null;
  return { est: num(e.est), lo: num(e.lo), hi: num(e.hi), n: num(e.n) ?? 0, seed: num(e.seed), level: 0.95, alphaAdj: num(e.alphaAdj) ?? 0.05, method: str(e.method) };
}

function normaliseContrast(c) {
  if (!isObj(c)) return null;
  const verdict = VERDICTS.includes(c.verdict) ? c.verdict : 'unresolved';
  return {
    delta: num(c.delta), lo: num(c.lo), hi: num(c.hi), pct: num(c.pct), n: num(c.n) ?? 0, seed: num(c.seed),
    alphaAdj: num(c.alphaAdj), method: str(c.method), verdict, significant: verdict === 'better' || verdict === 'worse',
    nNeeded: num(c.nNeeded), basis: typeof c.basis === 'string' ? c.basis : null,
    higherIsBetter: typeof c.higherIsBetter === 'boolean' ? c.higherIsBetter : null,
    ...(isObj(c.winRate) ? { winRate: { delta: num(c.winRate.delta), lo: num(c.winRate.lo), hi: num(c.winRate.hi) } } : {}),
  };
}

function normaliseChange(c) {
  if (!isObj(c)) return null;
  return {
    id: str(c.id), dimension: str(c.dimension), label: str(c.label), from: str(c.from), to: str(c.to),
    scope: SCOPES.includes(c.scope) ? c.scope : 'preset', owner: plain(c.owner),
    sideEffects: (Array.isArray(c.sideEffects) ? c.sideEffects : []).filter(isObj).map((s) => ({ presetId: str(s.presetId), name: str(s.name), reason: str(s.reason) })),
    bundle: (Array.isArray(c.bundle) ? c.bundle : []).filter((b) => typeof b === 'string'),
    own: normaliseContrast(c.own), needed: normaliseContrast(c.needed),
    keptBecause: KEPT_BECAUSE.includes(c.keptBecause) ? c.keptBecause : null,
    ...(typeof c.moved === 'string' && c.moved ? { moved: c.moved } : {}),
  };
}

function normaliseMatchup(m) {
  if (!isObj(m)) return null;
  return { opponentId: str(m.opponentId), name: str(m.name), seat: m.seat === 'defender' ? 'defender' : 'attacker', value: normaliseEstimate(m.value), vsBaseline: normaliseContrast(m.vsBaseline) };
}

function normaliseWrite(w) {
  if (!isObj(w)) return null;
  return {
    scope: SCOPES.includes(w.scope) ? w.scope : 'preset', title: str(w.title), owner: plain(w.owner),
    changeIds: (Array.isArray(w.changeIds) ? w.changeIds : []).filter((x) => typeof x === 'string'),
    sideEffects: (Array.isArray(w.sideEffects) ? w.sideEffects : []).filter(isObj).map((s) => ({ presetId: str(s.presetId), name: str(s.name), reason: str(s.reason) })),
  };
}

/**
 * A schema 2 Row, compacted: no `runMore` (a saved run never measures more; Re-run measures afresh). The
 * `writes` are kept so a saved run can be applied from the history; a run saved before that has none.
 */
function normaliseRow(r) {
  if (!isObj(r)) return null;
  const aux = isObj(r.aux) ? r.aux : {};
  const rem = isObj(r.remainder) ? r.remainder : null;
  return {
    rank: Number.isInteger(r.rank) ? r.rank : 0,
    tieGroup: Number.isInteger(r.tieGroup) ? r.tieGroup : null,
    isBaseline: r.isBaseline === true,
    provisional: false,
    key: str(r.key),
    candidate: plain(r.candidate),
    writes: (Array.isArray(r.writes) ? r.writes : []).map(normaliseWrite).filter(Boolean),
    value: normaliseEstimate(r.value),
    aux: {
      winRate: normaliseEstimate(aux.winRate), meanMs: num(aux.meanMs), timeoutShare: num(aux.timeoutShare),
      ...(typeof aux.meetsTarget === 'boolean' || aux.target != null ? { meetsTarget: typeof aux.meetsTarget === 'boolean' ? aux.meetsTarget : null, target: num(aux.target) } : {}),
      matchups: (Array.isArray(aux.matchups) ? aux.matchups : []).map(normaliseMatchup).filter(Boolean),
    },
    vsBaseline: normaliseContrast(r.vsBaseline),
    changes: (Array.isArray(r.changes) ? r.changes : []).map(normaliseChange).filter(Boolean),
    ...(num(r.power) != null ? { power: num(r.power) } : {}),
    remainder: rem ? { delta: num(rem.delta), lo: num(rem.lo), hi: num(rem.hi), method: str(rem.method) } : null,
    lines: (Array.isArray(r.lines) ? r.lines : []).filter(isObj).map((l) => ({ label: str(l.label), value: str(l.value) })),
  };
}

function normaliseDetail2(d) {
  if (!isObj(d)) return null;
  const rows = (Array.isArray(d.rows) ? d.rows : []).map(normaliseRow).filter(Boolean).slice(0, RUN_DETAIL_RESULTS);
  const baseline = normaliseRow(d.baseline);
  if (!baseline && rows.length === 0) return null;
  const push = normalisePushDetail(d.push);
  return { baseline, rows, ...(push ? { push } : {}) };
}

function normaliseDetail(d, schema = 1) {
  if (schema === 2) return normaliseDetail2(d);
  if (!isObj(d)) return null;
  const results = (Array.isArray(d.results) ? d.results : []).map(normaliseEntry).filter(Boolean).slice(0, RUN_DETAIL_RESULTS);
  const baseline = normaliseEntry(d.baseline);
  if (!baseline && results.length === 0) return null;
  return { baseline, results };
}

const STEP_STATES = ['queued', 'running', 'done', 'skipped'];
const STEP_REASONS = ['off', 'nothing-to-try'];
/** A run's final search steps; null when absent or unusable (an older run simply has none). */
function normaliseSteps(steps) {
  if (!Array.isArray(steps)) return null;
  const rows = steps.filter((r) => isObj(r) && typeof r.id === 'string' && STEP_STATES.includes(r.state)).slice(0, 32).map((r) => ({
    id: r.id, state: r.state, reason: STEP_REASONS.includes(r.reason) ? r.reason : null,
    pass: int(r.pass) ?? 0, tried: int(r.tried) ?? 0, fights: int(r.fights) ?? 0, improved: r.improved === true,
  }));
  return rows.length ? rows : null;
}

function normaliseHeadline(h) {
  const x = isObj(h) ? h : {};
  return {
    unit: str(x.unit), higherIsBetter: x.higherIsBetter !== false, tier: x.tier === 2 ? 2 : 1,
    aborted: x.aborted === true, truncated: x.truncated === 'evals' || x.truncated === 'time' ? x.truncated : null,
    baseline: num(x.baseline), best: num(x.best), gainPct: num(x.gainPct),
    significant: typeof x.significant === 'boolean' ? x.significant : null,
    n: num(x.n) ?? 0, evaluated: num(x.evaluated) ?? 0, changes: num(x.changes) ?? 0,
    text: str(x.text),
    // A PVE win-rate run's verdict and its target share; null otherwise. Highest chance to win ({mode: 'max'}, no
    // target): 'already' | 'best' | 'no-wins'; reach a win rate: 'already' | 'reached' | 'not-reached'.
    goal: normaliseGoal(x.goal),
    // a Push run's block; absent on every other run
    ...(normalisePushHeadline(x.push) ? { push: normalisePushHeadline(x.push) } : {}),
  };
}

const GOAL_STATUSES = { target: ['already', 'reached', 'not-reached'], max: ['already', 'best', 'no-wins'] };
function normaliseGoal(g) {
  if (!isObj(g)) return null;
  const max = g.mode === 'max';
  if (!GOAL_STATUSES[max ? 'max' : 'target'].includes(g.status)) return null;
  return max ? { mode: 'max', status: g.status, target: null } : { status: g.status, target: num(g.target) };
}

const PUSH_STATUSES = ['pushed', 'no-gain', 'none'];
const PUSH_STOPS = ['top', 'screen', 'not-reached'];
const OUTCOMES = ['clears', 'fails', 'open'];
const int = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const rungRef = (r) => (isObj(r) ? { index: int(r.index ?? r.deepest), label: typeof r.label === 'string' ? r.label : null } : { index: null, label: null });

/** A Push run's headline block: where each build reached and where the climb stopped; null otherwise. */
function normalisePushHeadline(p) {
  if (!isObj(p) || !PUSH_STATUSES.includes(p.status)) return null;
  const stop = isObj(p.stop) && PUSH_STOPS.includes(p.stop.reason) ? { ...rungRef(p.stop), reason: p.stop.reason, best: normaliseEstimate(p.stop.best) } : null;
  return {
    status: p.status, target: num(p.target),
    ladder: { kind: str(p.ladder?.kind), label: str(p.ladder?.label), size: int(p.ladder?.size) ?? 0 },
    start: rungRef(p.start), baseline: rungRef(p.baseline),
    reached: { ...rungRef(p.reached), foundLabel: typeof p.reached?.foundLabel === 'string' ? p.reached.foundLabel : null },
    stop,
  };
}

/** A Push run's ladder strip (detail). */
function normalisePushDetail(p) {
  if (!isObj(p) || !Array.isArray(p.rungs)) return null;
  const outcome = (v) => (OUTCOMES.includes(v) ? v : null);
  return { rungs: p.rungs.filter(isObj).map((r) => ({ index: int(r.index) ?? 0, label: str(r.label), current: outcome(r.current), build: outcome(r.build) })) };
}

/** One raw run -> a valid run, or null when it has no usable id. */
export function normaliseRun(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  const schema = raw.schema === 2 ? 2 : 1;
  const applied = isObj(raw.applied) && str(raw.applied.at) ? { at: str(raw.applied.at), rank: num(raw.applied.rank) } : null;
  return {
    id: raw.id,
    kind: RUN_KIND,
    schema,
    at: str(raw.at) || new Date(0).toISOString(),
    name: str(raw.name) || 'Optimiser run',
    notes: str(raw.notes),
    pinned: raw.pinned === true,
    presetId: typeof raw.presetId === 'string' ? raw.presetId : null,
    presetName: str(raw.presetName),
    realm: raw.realm === 'oblivion' ? 'oblivion' : 'base',
    target: plain(raw.target),
    objective: plain(raw.objective),
    seed: num(raw.seed) ?? 1,
    space: plain(raw.space),
    ...(powerFloorOf(raw.powerFloor) != null ? { powerFloor: powerFloorOf(raw.powerFloor) } : {}),
    budget: plain(raw.budget),
    characterKey: str(raw.characterKey) || null,
    applied,
    headline: normaliseHeadline(raw.headline),
    ...(normaliseSteps(raw.steps) ? { steps: normaliseSteps(raw.steps) } : {}),
    detail: normaliseDetail(raw.detail, schema),
  };
}

/**
 * Build a run record from an optimiser result (search/search.js). Pure apart from the id and the clock,
 * which `fields.id` / `fields.at` override.
 * @param {Object} result  OptimiserResult
 * @param {{id?: string, at?: string, name?: string, presetName?: string, notes?: string, pinned?: boolean}} [fields]
 */
export function runFromResult(result, fields = {}) {
  if (result?.schema === 'optimiser-result/2') return runFromResultV2(result, fields);
  const top = result.results?.[0] ?? null;
  const base = result.baseline ?? null;
  const bestIsBaseline = !top || top.isBaseline;
  const vs = top?.vsBaseline ?? null;
  return normaliseRun({
    id: fields.id ?? newRunId(),
    at: fields.at ?? new Date().toISOString(),
    name: fields.name || `${result.objective?.label ?? 'Optimiser'} - ${result.target?.label ?? 'run'}`,
    notes: fields.notes ?? '',
    pinned: fields.pinned === true,
    presetId: result.presetId,
    presetName: fields.presetName ?? '',
    realm: result.realm,
    target: result.target,
    objective: result.objective,
    seed: result.seed,
    space: result.space,
    budget: result.budget,
    headline: {
      unit: result.objective?.unit, higherIsBetter: result.objective?.higherIsBetter, tier: result.tier,
      aborted: result.aborted, truncated: result.truncated,
      baseline: base?.value ?? null, best: top?.value ?? null,
      gainPct: bestIsBaseline ? 0 : vs?.pct ?? null,
      significant: bestIsBaseline ? null : vs?.significant ?? null,
      n: top?.n ?? 0, evaluated: result.stats?.tier1 ?? 0, changes: top?.changes?.length ?? 0,
    },
    // Full describe lines are long text: only the baseline and the top RUN_DETAIL_FULL_LINES keep them;
    // every entry keeps `changes` (what differs from the current build), which is what a reader needs.
    detail: { baseline: base, results: (result.results ?? []).map((e, i) => (i < RUN_DETAIL_FULL_LINES ? e : { ...e, lines: [] })) },
  });
}

/** A schema 2 run from an 'optimiser-result/2' result (the rows are compacted by normaliseRun). */
function runFromResultV2(result, fields) {
  const req = result.request ?? {};
  const top = result.rows?.[0] ?? null;
  const base = result.baseline ?? null;
  const vs = top?.vsBaseline ?? null;
  const unit = result.objective?.unit;
  return normaliseRun({
    id: fields.id ?? newRunId(),
    at: fields.at ?? new Date().toISOString(),
    name: fields.name || `${result.objective?.label ?? 'Optimiser'} - ${result.target?.label ?? 'run'}`,
    notes: fields.notes ?? '',
    pinned: fields.pinned === true,
    schema: 2,
    presetId: req.presetId,
    presetName: fields.presetName ?? '',
    realm: req.realm,
    target: result.target,
    objective: result.objective,
    seed: req.seed,
    space: req.space,
    powerFloor: req.powerFloor ?? null,
    budget: req.effort,
    characterKey: req.characterKey,
    applied: fields.applied ?? null,
    steps: result.search?.steps ?? null,
    headline: {
      unit, higherIsBetter: result.objective?.higherIsBetter, tier: 2, aborted: false, truncated: null,
      baseline: base?.value?.est ?? null, best: (top ?? base)?.value?.est ?? null,
      gainPct: top ? (unit === 'dps' ? vs?.pct ?? null : null) : 0,
      significant: top ? vs?.significant ?? null : null,
      n: (top ?? base)?.value?.n ?? 0, evaluated: result.search?.evaluated ?? 0, changes: top?.changes?.length ?? 0,
      text: result.headline?.text ?? '',
      goal: normaliseGoal(result.goal),
      ...(result.push ? { push: result.push } : {}),
    },
    // Full describe lines are long text: only the baseline and the top RUN_DETAIL_FULL_LINES keep them.
    detail: {
      baseline: base, rows: (result.rows ?? []).map((r, i) => (i < RUN_DETAIL_FULL_LINES ? r : { ...r, lines: [] })),
      ...(result.push ? { push: { rungs: result.push.rungs } } : {}),
    },
  });
}

/** Newest first by `at` (ties keep their order). Mutates and returns the list. */
export function sortRuns(runs) {
  return runs.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Drop `detail` beyond the newest RUN_DETAIL_LIMIT unpinned detailed runs. Mutates and returns the list. */
export function compactRuns(runs, limit = RUN_DETAIL_LIMIT) {
  let kept = 0;
  for (const r of runs) {
    if (r.pinned || r.detail === null) continue;
    kept++;
    if (kept > limit) r.detail = null;
  }
  return runs;
}

/**
 * Keep the serialised history inside the byte budget: oldest detail goes first, then whole rows beyond
 * the per-history row cap. Pinned runs are never touched. Returns the (possibly shorter) list.
 */
export function enforceRunsBudget(runs, { byteBudget = RUN_BYTE_BUDGET, maxRows = RUN_MAX_ROWS } = {}) {
  if (JSON.stringify(runs).length <= byteBudget) return runs;
  for (let i = runs.length - 1; i >= 0; i--) {
    const r = runs[i];
    if (r.pinned || r.detail === null) continue;
    r.detail = null;
    if (JSON.stringify(runs).length <= byteBudget) return runs;
  }
  let rows = 0;
  return runs.filter((r) => r.pinned || ++rows <= maxRows);
}

/**
 * The roster is one localStorage value, so the per-history budget above is not enough on its own: with
 * several characters the sum can still overflow the quota. One pass over every unpinned run of every
 * character, oldest first (by `at`), drops detail by per-run size estimates until the roster-wide run
 * total fits `byteBudget`, then whole unpinned rows. Pinned runs are never touched. Mutates the runs.
 * @param {{runs?: object[]}[]} characters
 * @returns {{trimmed: number, dropped: number}} runs that lost their detail / rows removed
 */
export function enforceRosterRunsBudget(characters, { byteBudget = ROSTER_RUN_BYTE_BUDGET } = {}) {
  const rows = [];
  let total = 0;
  for (const c of characters) {
    for (const r of Array.isArray(c?.runs) ? c.runs : []) {
      const detail = r.detail ? JSON.stringify(r.detail).length : 0;
      const size = JSON.stringify({ ...r, detail: null }).length + detail;
      total += size;
      if (!r.pinned) rows.push({ c, r, detail, size });
    }
  }
  const out = { trimmed: 0, dropped: 0 };
  if (total <= byteBudget) return out;
  rows.sort((a, b) => (a.r.at < b.r.at ? -1 : a.r.at > b.r.at ? 1 : 0));
  for (const row of rows) {
    if (total <= byteBudget) break;
    if (row.detail === 0) continue;
    row.r.detail = null;
    total -= row.detail;
    row.size -= row.detail;
    out.trimmed++;
  }
  for (const row of rows) {
    if (total <= byteBudget) break;
    row.c.runs = row.c.runs.filter((x) => x !== row.r);
    total -= row.size;
    out.dropped++;
  }
  return out;
}

// --- domain contract -----------------------------------------------------------------------

export function defaultRuns() {
  return { runs: [] };
}

// eslint-disable-next-line no-unused-vars
export function normaliseRuns(rawCharacter, ctx) {
  const seen = new Set();
  const runs = [];
  for (const raw of Array.isArray(rawCharacter?.runs) ? rawCharacter.runs : []) {
    const r = normaliseRun(raw);
    if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    runs.push(r);
  }
  return { runs: enforceRunsBudget(compactRuns(sortRuns(runs))) };
}

// v1 run history (sim, pvp and goal records) has no v2 meaning: dropped (rebuild-plan §3 table).
// eslint-disable-next-line no-unused-vars
export function migrateRunsFromV1(v1Character) {
  return { value: defaultRuns(), idMap: {} };
}

// A run's presetId is a snapshot: it may outlive its preset on purpose, so nothing is reconciled.
// eslint-disable-next-line no-unused-vars
export function reconcileRuns(character) {}
