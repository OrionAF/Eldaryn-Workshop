// ui/optimiserView.js - the optimiser page's pure view logic over an 'optimiser-result/2' result
// (docs/Reference/simulation.md §Result): signs contrasts for display, builds the one shared forest
// domain, maps phases to progress segments, prints the effort plan and turns a row's write groups into
// an Apply plan. No store, no DOM.
import { forestDomain } from './forestScale.js';
import { fmtCount } from './statsFormat.js';
import { resolveEffort } from '../search/search.js';
import { SCOPES } from '../search/patch.js';

/** Measured cost of the Quick level on the Warrior fixture (simulation.md §Cost); no run is time-capped. */
export const MEASURED_COST = Object.freeze({
  small: { space: 'relics and pet', time: 'about 1 s' },
  full: { space: 'every block', time: 'about 4 minutes' },
});

export const TARGET_KIND_LABEL = Object.freeze({
  dummy: 'Training dummy',
  chapter: 'Campaign chapter',
  dungeon: 'Dungeon',
  raid: 'Village raid',
  oblivion: 'Oblivion floor',
  worldBoss: 'World boss',
  custom: 'Custom mob',
  pvp: 'PVP vs my saved opponents',
});

export const OBJECTIVE_LABEL = Object.freeze({
  dps: 'Damage per second',
  survival: 'Survival chance',
  'win-rate': 'Win rate (clear without dying)',
  'pvp-winrate': 'PVP win rate',
});

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const neg = (v) => (finite(v) ? -v : null);

/**
 * A Contrast for display: score space (positive = better) in the objective's own unit. A time-to-kill
 * contrast is `θ(X) − θ(Y)` in ms, so a faster build has a negative raw delta; it is flipped here (kill time
 * is retired, but saved runs of it stay viewable). A TTK
 * contrast that fell back to win rate (`basis: 'winRate'`) is in a different unit from the table, so its
 * numbers move to `winRate` and the table cells stay empty.
 */
export function orientContrast(c) {
  if (!c) return null;
  if (c.basis === 'winRate') {
    return { ...c, delta: null, lo: null, hi: null, pct: null, winRate: { delta: c.delta, lo: c.lo, hi: c.hi } };
  }
  if ((c.basis === 'win-rate' || c.basis === 'margin') && c.winRate) {
    // PVE win-rate goal: the table axis is win-rate points, so show the uncapped paired difference. The verdict
    // is still the capped-rate (or margin) one, said under the row (simulation.md §Win rate).
    return { ...c, delta: c.winRate.delta, lo: c.winRate.lo, hi: c.winRate.hi, pct: null };
  }
  if (c.higherIsBetter === false) {
    return { ...c, delta: neg(c.delta), lo: neg(c.hi), hi: neg(c.lo), pct: neg(c.pct) };
  }
  return c;
}

function orientRemainder(r, higherIsBetter) {
  if (!r) return null;
  return higherIsBetter === false ? { ...r, delta: neg(r.delta), lo: neg(r.hi), hi: neg(r.lo) } : r;
}

/** A Row with every contrast oriented; provisional rows keep their null contrasts. */
export function orientRow(row, higherIsBetter = true) {
  return {
    ...row,
    vsBaseline: orientContrast(row.vsBaseline),
    changes: (row.changes ?? []).map((c) => ({ ...c, own: orientContrast(c.own), needed: orientContrast(c.needed) })),
    remainder: orientRemainder(row.remainder, higherIsBetter),
  };
}

/**
 * What the results table renders: the baseline, the ranked rows, the table's single forest domain, and
 * how many non-baseline rows were withheld because they list no change (I3 would be broken, so such a
 * row is never shown as a result).
 * @returns {{unit: string, higherIsBetter: boolean, baseline: Object|null, rows: Object[], withheld: number, domain: Object}}
 */
export function viewResult(result) {
  const unit = result?.objective?.unit ?? 'dps';
  const hib = result?.objective?.higherIsBetter !== false;
  const all = (result?.rows ?? []).filter((r) => !r.isBaseline);
  const rows = all.filter((r) => (r.changes ?? []).length > 0).map((r) => orientRow(r, hib));
  const items = [];
  for (const r of rows) {
    items.push(r.vsBaseline);
    for (const c of r.changes) items.push(c.own);
    items.push(r.remainder);
  }
  return {
    unit,
    kind: result?.objective?.kind ?? null,
    goal: result?.goal ? { status: result.goal.status, target: result.goal.target } : null,
    higherIsBetter: hib,
    baseline: result?.baseline ? { changes: [], ...result.baseline } : null,
    rows,
    withheld: all.length - rows.length,
    domain: forestDomain(items),
  };
}

/**
 * The win-rate goal's standing of one row against its target: a chip verdict ('meets' | 'below' | 'open' for
 * a target not yet resolved, null when the row has none) and how far short it is, in points.
 */
export function targetStanding(row, target) {
  const m = row?.aux?.meetsTarget;
  if (target == null || typeof m !== 'boolean' && m !== null) return { verdict: null, gap: '' };
  const est = row.aux.winRate?.est;
  const gap = m !== true && finite(est) && est < target ? `${((target - est) * 100).toFixed(1)} pts below target` : '';
  return { verdict: m === true ? 'meets' : m === false ? 'below' : 'open', gap };
}

/**
 * The win rate a goal's headline talks about: the current build's when it already clears, else the leading
 * row's (search.js goalOf: the first row, or the current build when there is none); null without a goal or a rate.
 */
export function goalWinRate(view) {
  if (!view?.goal) return null;
  const row = view.goal.status === 'already' ? view.baseline : (view.rows[0] ?? view.baseline);
  const rate = row?.aux?.winRate?.est;
  return finite(rate) ? rate : null;
}

/** A saved schema 1 run's entries as rows: positive-is-better deltas, no per-change effects ("not measured"). */
export function legacyRows(detail, unit) {
  const est = (e) => ({ est: e.value, lo: e.lo, hi: e.hi, n: e.n ?? 0, seed: null, level: 0.95, alphaAdj: 0.05, method: '' });
  const row = (e) => {
    const vs = e.vsBaseline;
    return {
      rank: e.rank, tieGroup: null, isBaseline: !!e.isBaseline, provisional: false, key: e.key, candidate: e.candidate,
      value: est(e), aux: {}, lines: e.lines ?? [], remainder: null, writes: [], runMore: null,
      vsBaseline: vs
        ? {
            delta: vs.delta, lo: vs.lo, hi: vs.hi, pct: unit === 'dps' ? vs.pct : null, n: e.n ?? 0, higherIsBetter: true,
            verdict: vs.significant ? (vs.delta > 0 ? 'better' : 'worse') : 'unresolved', significant: !!vs.significant, nNeeded: null,
          }
        : null,
      changes: (e.changes ?? []).map((c, i) => ({
        id: c.id ?? `legacy:${i}`, dimension: c.dimension ?? c.label, label: c.label, from: c.from, to: c.to,
        scope: c.scope ?? 'preset', owner: {}, sideEffects: [], bundle: [], own: null, needed: null, keptBecause: null,
      })),
    };
  };
  return { baseline: detail?.baseline ? row(detail.baseline) : null, rows: (detail?.results ?? []).filter((e) => !e.isBaseline).map(row) };
}

/** The same view over a saved run: schema 2 rows as recorded, schema 1 entries adapted. */
export function viewRun(run) {
  const unit = run.headline?.unit || run.objective?.unit || 'dps';
  const hib = run.headline?.higherIsBetter !== false;
  if (!run.detail) return null;
  if (run.schema === 2) {
    return viewResult({
      objective: { unit, higherIsBetter: hib, kind: run.objective?.kind }, goal: run.headline?.goal ?? null,
      baseline: run.detail.baseline, rows: run.detail.rows,
    });
  }
  const { baseline, rows } = legacyRows(run.detail, unit);
  return { ...viewResult({ objective: { unit, higherIsBetter: true }, baseline, rows }), legacy: true };
}

// ---- change labels --------------------------------------------------------------------------

/** What each change dimension (effect.js `changesOf`) is called on screen. */
export const DIMENSION_LABEL = Object.freeze({
  equipmentSet: 'Gear set', spec: 'Talent set', talents: 'Talents', pet: 'Pet', mount: 'Mount', relics: 'Relics', sigils: 'Sigils',
  utility: 'Utility sigil', ancient: 'Ancient sigil', transcendence: 'Transcendence', conditions: 'Sigil conditions',
  minorGlyphs: 'Minor glyphs', majorGlyphs: 'Major glyphs', mythicGlyphs: 'Mythic glyphs',
});
const GLYPH_DIMENSION = /Glyphs$/;
const TIER_WORD = { minor: 'Minor', major: 'Major', mythic: 'Mythic' };

/** A dimension key as text; never the raw key. */
export const dimensionLabel = (dimension) => DIMENSION_LABEL[dimension] ?? (/^[A-Z]/.test(dimension) ? dimension : 'Other'); // a legacy run stored the label itself

/**
 * "8 changes · Talent set, Talents, Mount, Relics, Sigils, 3 glyph sockets": each dimension once, every
 * glyph socket counted together.
 */
export function changeSummary(changes = []) {
  const parts = [];
  let sockets = 0;
  for (const c of changes) {
    if (GLYPH_DIMENSION.test(c.dimension)) {
      if (sockets++ === 0) parts.push(null); // the socket count goes where the first socket was
      continue;
    }
    const l = dimensionLabel(c.dimension);
    if (!parts.includes(l)) parts.push(l);
  }
  const text = parts.map((p) => p ?? `${sockets} glyph socket${sockets === 1 ? '' : 's'}`).join(', ');
  return `${changes.length} change${changes.length === 1 ? '' : 's'}${text ? ` · ${text}` : ''}`;
}

/** The label of one change id: from the row's own changes when it lists it, else read from the id's shape. */
export function changeIdLabel(id, changes = []) {
  const own = changes.find((c) => c.id === id);
  if (own) return own.label;
  const [kind, a, tier, i] = String(id).split(':');
  if (kind === 'talents') return `Talents (${a === '1' ? 'Set B' : 'Set A'})`;
  if (kind === 'glyph') return `${TIER_WORD[tier] ?? 'Mount'} glyph socket ${Number(i) + 1}`;
  if (kind === 'condition') return 'Sigil condition';
  return DIMENSION_LABEL[kind] ?? 'Another change';
}

/**
 * "Only with: X" for a change whose own effect is exactly zero because it works only together with another
 * change (a talent allocation for the other set, minor glyphs on a newly chosen mount): the label of the
 * change whose legality bundle forces it. Null for any other change. Its effect is `needed` (Without it).
 */
export function onlyWith(change, changes = []) {
  const o = change?.own;
  if (!o || !change.needed || o.delta !== 0 || o.lo !== 0 || o.hi !== 0) return null;
  const driver = changes.find((x) => x.id !== change.id && (x.bundle ?? []).includes(change.id));
  return driver ? driver.label : 'another change';
}

/** The "Comes with" text: the forced companions by name, every glyph socket counted together. */
export function bundleText(bundle = [], changes = []) {
  const labels = [];
  let sockets = 0;
  for (const id of bundle) {
    if (String(id).startsWith('glyph:')) {
      if (sockets++ === 0) labels.push(null);
      continue;
    }
    const l = changeIdLabel(id, changes);
    if (!labels.includes(l)) labels.push(l);
  }
  return labels.map((l) => l ?? `${sockets} glyph socket${sockets === 1 ? '' : 's'}`).join(', ');
}

// ---- progress -------------------------------------------------------------------------------

/** RunProgress segments from a live progress report (A.10 phases) or a finished result's phases. */
export function progressSegments({ progress = null, result = null, status = 'running' } = {}) {
  if (result?.phases?.length && status !== 'running' && status !== 'queued') {
    return result.phases.map((p) => ({
      id: p.id,
      label: p.label,
      state: p.state === 'done' ? 'done' : p.state === 'cancelled' ? 'cancelled' : 'queued',
      text: p.state === 'not-run' ? 'not run' : `${fmtCount(p.fights)} fights`,
    }));
  }
  return (progress?.phases ?? []).map((p) => ({
    id: p.id,
    label: p.label,
    state: status === 'cancelled' && p.state === 'current' ? 'cancelled' : p.state === 'current' ? 'active' : p.state,
    done: p.done,
    total: p.total,
  }));
}

/** One line under the segments: what the search is doing right now. */
export function progressLine(progress) {
  if (!progress?.phases) return 'Starting';
  const cur = progress.phases.find((p) => p.state === 'current');
  const c = progress.counts ?? {};
  const block = progress.block ? `, ${progress.block}` : '';
  return `${cur?.label ?? 'Working'}${block}: ${fmtCount(c.evaluated ?? 0)} builds tried, ${fmtCount(c.fights ?? 0)} fights`;
}

// ---- effort ---------------------------------------------------------------------------------

/** The numbers an effort level means for an objective, as printed on the Effort control. */
export function effortPlan(level, objective) {
  const relative = objective?.kind === 'dps';
  const e = resolveEffort(level, { deltaKind: relative ? 'relative' : 'absolute' });
  const zone = relative ? `${+(e.delta * 100).toFixed(2)}%` : `${+(e.delta * 100).toFixed(1)} points`;
  return { ...e, zone, relative, sub: `δ ${zone}` };
}

// ---- allowed to change ----------------------------------------------------------------------

/** The space toggles in the order of the four step groups (ia.md §3.3; keys are search/space.js BLOCKS). */
export const SPACE_GROUPS = Object.freeze([
  { id: 'gear', label: 'Gear', items: [['equipmentSet', 'Gear set']] },
  { id: 'talents', label: 'Talents', items: [['spec', 'Talent set'], ['talents', 'Talent points']] },
  { id: 'companions', label: 'Companions', items: [['pet', 'Pet'], ['mount', 'Mount'], ['minorGlyphs', 'Minor glyphs'], ['majorGlyphs', 'Major glyphs']] },
  { id: 'relics', label: 'Relics', items: [['relics', 'Relics']] },
  { id: 'sigils', label: 'Sigils', items: [['sigils', 'Sigils'], ['utility', 'Utility sigil'], ['ancient', 'Ancient sigil'], ['conditions', 'Sigil conditions']] },
  { id: 'transcendence', label: 'Transcendence', items: [['transcendence', 'Board']] },
]);

/** Set every toggle of one group (or all groups when `groupId` is null) to `on`. */
export function setGroup(space, groupId, on) {
  const next = { ...space };
  for (const g of SPACE_GROUPS) if (groupId == null || g.id === groupId) for (const [k] of g.items) next[k] = on;
  return next;
}

export const enabledCount = (space) => SPACE_GROUPS.reduce((n, g) => n + g.items.filter(([k]) => space[k]).length, 0);
export const toggleTotal = SPACE_GROUPS.reduce((n, g) => n + g.items.length, 0);

// ---- Apply ----------------------------------------------------------------------------------

/**
 * What an Apply writes when some write groups are excluded. `include` is the set of scopes to write;
 * the character scope holds two groups (a talent set's allocation, the sigil conditions) which the
 * candidate can drop separately by returning to "equal to saved" (null / empty).
 * @param {Object} row  a Row with `writes` and `candidate`
 * @param {Set<number>|number[]} excluded  indexes into `row.writes` the user switched off
 */
export function applyPlan(row, excluded = []) {
  const off = new Set(excluded);
  const cand = { ...row.candidate };
  const kept = new Set();
  row.writes.forEach((g, i) => {
    if (off.has(i)) return;
    kept.add(g.scope);
  });
  row.writes.forEach((g, i) => {
    if (!off.has(i)) return;
    if (g.scope !== 'character') return;
    if (g.changeIds.some((id) => id.startsWith('talents:'))) cand.talentAllocation = null;
    else cand.sigilConditions = {};
  });
  // A character-scope group stays on when any of its groups does; the dropped one was reset above.
  // Nothing excluded: every scope, so the store checks the whole candidate's legality before writing.
  const include = off.size === 0 ? [...SCOPES] : SCOPES.filter((s) => kept.has(s));
  return { cand, include, writesCount: row.writes.length - off.size };
}

/** Every distinct other preset an Apply of these groups changes, with the reasons. */
export function sideEffectsOf(row, excluded = []) {
  const off = new Set(excluded);
  const out = [];
  row.writes.forEach((g, i) => {
    if (off.has(i)) return;
    for (const s of g.sideEffects ?? []) if (!out.some((o) => o.presetId === s.presetId && o.reason === s.reason)) out.push({ ...s, group: g.title });
  });
  return out;
}

/** The change objects a write group covers, in row order. */
export const changesOfGroup = (row, group) => row.changes.filter((c) => group.changeIds.includes(c.id));

// ---- tray and header text -------------------------------------------------------------------

/** "2m 14s", "38 s", "0.4 s". */
export function fmtDuration(ms) {
  if (!finite(ms) || ms < 0) return 'n/a';
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** The chips a finished optimiser job shows in the Jobs tray. */
export function optimiserJobChips(result) {
  if (!result) return [];
  if (result.status === 'failed') return [{ tone: 'warn', text: 'Could not run' }];
  const h = result.headline ?? {};
  const chips = [];
  if (result.goal) {
    const g = result.goal.status;
    return [g === 'already' ? { tone: 'up', text: 'Already clears' } : g === 'reached' ? { tone: 'up', text: 'Target reached' } : { tone: 'warn', text: 'Target not reached' }];
  }
  if (h.better > 0) chips.push({ tone: 'up', text: `${h.better} better` });
  else chips.push({ text: 'Nothing beat the current build' });
  if (h.unresolved > 0) chips.push({ tone: 'warn', text: `${h.unresolved} too close to call` });
  return chips;
}
