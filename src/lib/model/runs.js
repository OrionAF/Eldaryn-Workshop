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
//   RunEntry = {rank, isBaseline, key, candidate, value, lo, hi, n, score, vsBaseline, changes, lines}
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

function normaliseDetail(d) {
  if (!isObj(d)) return null;
  const results = (Array.isArray(d.results) ? d.results : []).map(normaliseEntry).filter(Boolean).slice(0, RUN_DETAIL_RESULTS);
  const baseline = normaliseEntry(d.baseline);
  if (!baseline && results.length === 0) return null;
  return { baseline, results };
}

function normaliseHeadline(h) {
  const x = isObj(h) ? h : {};
  return {
    unit: str(x.unit), higherIsBetter: x.higherIsBetter !== false, tier: x.tier === 2 ? 2 : 1,
    aborted: x.aborted === true, truncated: x.truncated === 'evals' || x.truncated === 'time' ? x.truncated : null,
    baseline: num(x.baseline), best: num(x.best), gainPct: num(x.gainPct),
    significant: typeof x.significant === 'boolean' ? x.significant : null,
    n: num(x.n) ?? 0, evaluated: num(x.evaluated) ?? 0, changes: num(x.changes) ?? 0,
  };
}

/** One raw run -> a valid run, or null when it has no usable id. */
export function normaliseRun(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    kind: RUN_KIND,
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
    budget: plain(raw.budget),
    headline: normaliseHeadline(raw.headline),
    detail: normaliseDetail(raw.detail),
  };
}

/**
 * Build a run record from an optimiser result (search/search.js). Pure apart from the id and the clock,
 * which `fields.id` / `fields.at` override.
 * @param {Object} result  OptimiserResult
 * @param {{id?: string, at?: string, name?: string, presetName?: string, notes?: string, pinned?: boolean}} [fields]
 */
export function runFromResult(result, fields = {}) {
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
