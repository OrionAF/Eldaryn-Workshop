// features/dropView.js: the view model of the Drop Check page (redesign U9). Pure: turns prepareSwap rows
// and runSwapMetrics results into per-set cards, a verdict-chip mapping, a tally for the summary bar, and the
// "Run more" request. The statistics stay in swap.js (verdictFor, Holm); nothing here decides a verdict.
//
//   chipFor(verdict, basis, state)   VerdictChip props for a set verdict
//   setCards(rows, results)          one card per equipment set: Holm verdict, coverage, notJudged, metrics, guards
//   pctInterval(m), goalFigure(m)    a goal's contrast on its axis (percent of the start, points, or raw)
//   tally(judged, skipped)           counts for the summary bar
//   isDowngrade(best)                a judged (simulated) downgrade, the rows "Hide downgrades" drops
//   bagSummaryText(rows)             the loot bag as plain text lines for the clipboard
//   runMoreRequest(request)          a stricter request for the same inputs, or null at the ceiling
import { groupBySet, verdictFor, aggregateVerdict, statKeyLabel, guardText, DROP_PRECISION } from './swap.js';
import { EQUIP_SETS } from '../model/equipment.js';

export const setLabelOf = (setKey) => EQUIP_SETS.find((s) => s.key === setKey)?.label ?? setKey;

const CHIP = {
  upgrade: { verdict: 'better', label: 'Upgrade' },
  downgrade: { verdict: 'worse', label: 'Downgrade' },
  sidegrade: { verdict: 'equivalent', label: 'Sidegrade' },
  mixed: { verdict: 'unresolved', label: 'Mixed' },
  inconclusive: { verdict: 'unresolved', label: 'Too close to call' },
};

/**
 * VerdictChip props for a set verdict. Only a simulated upgrade or downgrade takes up/down colour: a verdict
 * resting on the closed-form estimate, or one still being simulated, is neutral and says so.
 * @param {string} verdict  aggregateVerdict output
 * @param {'sim'|'closed'} basis
 * @param {'idle'|'queued'|'running'} state  the run this card waits for
 */
export function chipFor(verdict, basis, state = 'idle') {
  if (basis !== 'sim') {
    if (state === 'running') return { verdict: 'pending', label: 'Simulating…' };
    if (state === 'queued') return { verdict: 'queued', label: 'Queued' };
    return { verdict: 'unresolved', label: 'Not simulated' };
  }
  return CHIP[verdict] ?? CHIP.inconclusive;
}

/** A relative contrast in percent of the starting value (DPS, clear time): the unit of a relative goal's axis. */
export function pctInterval(m) {
  const base = Math.abs(m?.before?.mean ?? NaN);
  const d = m?.delta;
  if (!d || !(base > 0)) return null;
  const f = 100 / base;
  return { est: d.delta * f, lo: d.lo * f, hi: d.hi * f, n: d.n, verdict: d.verdict };
}

/**
 * The axis a goal's contrast is drawn on: 'pct' (relative goals, in percent of the starting value), 'pts'
 * (rates, in percentage points) or 'raw' (the objective's own unit, e.g. Arena Influence).
 */
export function axisOf(m) {
  if (m?.unit === 'p') return 'pts';
  if (m?.deltaKind === 'relative' || m?.unit === 'dps' || m?.unit === 'ms') return 'pct';
  return 'raw';
}

/** One goal's contrast on its axis: `{axis, est, lo, hi, n, verdict}`, or null without one. */
export function goalFigure(m) {
  const d = m?.delta;
  if (!d || !Number.isFinite(d.delta)) return null;
  const axis = axisOf(m);
  if (axis === 'pct') {
    const p = pctInterval(m);
    return p ? { axis, ...p } : null;
  }
  const f = axis === 'pts' ? 100 : 1;
  return { axis, est: d.delta * f, lo: d.lo * f, hi: d.hi * f, n: d.n, verdict: d.verdict };
}

function metricsOf(res) {
  return (res?.goals ?? []).filter((g) => g?.delta).map((g) => ({ id: g.goalId, label: g.label, unit: g.unit, m: g }));
}

/** A result's guards (swap.js guardCheck), each with its one-line reason. */
function guardsOf(res) {
  return (res?.goals ?? []).filter((g) => g?.role === 'guard' && g.guard).map((g) => ({ id: g.goalId, label: g.label, status: g.guard.status, text: guardText(g) }));
}

/**
 * One card per equipment set the item could go into. The set verdict covers every preset wearing the set
 * (aggregateVerdict over the Holm-judged preset verdicts); `coverageLabel` and `notJudged` say what the
 * verdict did not look at; `estimatePct` is the instant closed-form figure, never a result.
 * @param {object[]} rows  prepareSwap rows
 * @param {Object<string, object>|Array<object|null>} results  runSwapMetrics results by presetId, or per row
 */
export function setCards(rows, results = {}) {
  const resOf = (row, i) => (Array.isArray(results) ? results[i] : results[row.presetId]) ?? null;
  const index = new Map(rows.map((r, i) => [r, i]));
  return groupBySet(rows).map(({ setKey, rows: members }) => {
    const all0 = members.map((row) => {
      const res = resOf(row, index.get(row));
      return { row, res, v: verdictFor(row, res) };
    });
    // a preset no goal judges (goal preset lists) stays out of the set's verdict while another preset is judged
    const unjudged = all0.filter((p) => p.res?.noGoals);
    const per = unjudged.length < all0.length ? all0.filter((p) => !p.res?.noGoals) : all0;
    const verdict = aggregateVerdict(per.map((p) => p.v.verdict));
    const sim = per.every((p) => p.v.basis === 'sim');
    const all = per.flatMap((p) => metricsOf(p.res));
    const needed = all.map((m) => m.m.delta?.nNeeded).filter((n) => Number.isFinite(n));
    const estimates = per.map((p) => p.row.closed.pct).filter((n) => Number.isFinite(n));
    return {
      setKey,
      setLabel: setLabelOf(setKey),
      verdict,
      basis: sim ? 'sim' : 'closed',
      coverageLabel: [...new Set(per.map((p) => p.v.coverageLabel))].join('; '),
      notJudged: [...new Set(per.flatMap((p) => p.v.notJudged))].map(statKeyLabel),
      unresolved: per.some((p) => p.v.unresolved.length > 0),
      nNeeded: needed.length ? Math.max(...needed) : null,
      presetNames: all0.map((p) => p.row.name),
      unjudgedNames: per === all0 ? [] : unjudged.map((p) => p.row.name),
      presets: per.map((p) => ({
        presetId: p.row.presetId,
        name: p.row.name,
        method: p.row.method,
        approx: p.row.approx,
        verdict: p.v.verdict,
        metrics: metricsOf(p.res),
        guards: guardsOf(p.res),
      })),
      failedGuard: per.some((p) => p.v.failedGuards?.length > 0),
      estimatePct: estimates.length ? estimates.reduce((a, b) => a + b, 0) / estimates.length : null,
    };
  });
}

/**
 * Counts for the summary bar above a batch. `judged` is a list of `{verdict, basis}` (dropBatch.judgeEntry
 * output or a setCards entry, null where nothing was judged). One without a finished simulation counts as
 * pending, never by its closed-form verdict; skipped items come from the parse.
 */
export function tally(judged, skipped = []) {
  const t = { upgrade: 0, sidegrade: 0, downgrade: 0, mixed: 0, inconclusive: 0, pending: 0, skipped: skipped.length };
  for (const j of judged) {
    if (!j || j.basis !== 'sim') t.pending += 1;
    else t[j.verdict] += 1;
  }
  return t;
}

/** Tray chips for a tally (job summaries). */
export function tallyChips(t) {
  const out = [];
  if (t.upgrade) out.push({ tone: 'up', text: `▲ ${t.upgrade} upgrade` });
  if (t.sidegrade) out.push({ tone: 'warn', text: `◆ ${t.sidegrade} sidegrade` });
  if (t.downgrade) out.push({ tone: 'down', text: `▼ ${t.downgrade} downgrade` });
  if (t.mixed) out.push({ tone: 'warn', text: `${t.mixed} mixed` });
  if (t.inconclusive) out.push({ tone: 'warn', text: `${t.inconclusive} too close to call` });
  if (t.pending) out.push({ tone: 'warn', text: `${t.pending} not simulated` });
  if (t.skipped) out.push({ tone: 'warn', text: `! ${t.skipped} skipped` });
  return out;
}

/** True only for a finished simulated downgrade; pending, mixed and too-close rows are never hidden. */
export const isDowngrade = (best) => !!best && best.basis === 'sim' && best.verdict === 'downgrade';

const SUFFIX = { pct: '%', pts: ' pts', raw: '' };

/**
 * One line per row, `Name | slot | change | verdict`. `figure` is the table's figure ({kind:'sim', axis, est, lo, hi}
 * or {kind:'est', est}, null when nothing was computed); the closed-form figure is labelled an estimate. The
 * axis (goalFigure) picks the suffix; percent when it is missing.
 * @param {Array<{name: string, slot: string, figure: object|null, verdict: string}>} rows
 */
export function bagSummaryText(rows) {
  return rows
    .map(({ name, slot, figure, verdict }) => {
      const sfx = SUFFIX[figure?.axis] ?? '%';
      const signed = (n) => (n > 0 ? '+' : '') + n.toFixed(1) + sfx;
      const change = !figure ? 'no figure' : figure.kind === 'sim' ? `${signed(figure.est)} [${signed(figure.lo)}, ${signed(figure.hi)}]` : `${signed(figure.est)} (estimate)`;
      return [name, slot, change, verdict].join(' | ');
    })
    .join('\n');
}

const NEXT = { quick: 'standard', standard: 'thorough' };

/**
 * The request to run when "Run more" is pressed: the next precision step (tighter zone, larger give-up N),
 * and past Thorough four times the give-up N. Same fighters and seed, so the longer run is a prefix-stable
 * superset of the first. Null when nothing is left to raise.
 */
export function runMoreRequest(request) {
  if (!request) return null;
  const precision = request.precision ?? 'standard';
  if (NEXT[precision]) {
    const { maxN: _drop, ...rest } = request;
    return { ...rest, precision: NEXT[precision] };
  }
  const current = request.maxN ?? DROP_PRECISION.thorough.maxN;
  if (current >= DROP_PRECISION.thorough.maxN * 16) return null;
  return { ...request, precision, maxN: current * 4 };
}
