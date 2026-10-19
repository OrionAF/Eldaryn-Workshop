// ui/optimiserView.js - the optimiser page's pure view logic over an 'optimiser-result/2' result
// (docs/Reference/simulation.md §Result): signs contrasts for display, builds the one shared forest
// domain, maps phases to progress segments, prints the effort plan and turns a row's write groups into
// an Apply plan. No store, no DOM.
import { forestDomain } from './forestScale.js';
import { fmtCount } from './statsFormat.js';
import { formatFlat } from '../format.js';
import { resolveEffort } from '../search/search.js';
import { SCOPES } from '../search/patch.js';
import { arenaRewardConfig } from '../search/arenaRewardObjective.js';

/**
 * Measured cost of the Quick level on the Warrior fixture (simulation.md §Cost: measured before the A5
 * futility stop, so upper figures); no run is time-capped.
 */
export const MEASURED_COST = Object.freeze({
  small: { space: 'only relics and pet', time: 'about 1 s' },
  full: { space: 'every part of your build', time: 'about 4 minutes' },
});

export const TARGET_KIND_LABEL = Object.freeze({
  dummy: 'Training dummy',
  chapter: 'Campaign chapter',
  dungeon: 'Dungeon',
  raid: 'Village raid',
  oblivion: 'Oblivion floor',
  worldBoss: 'World boss',
  fortressBoss: 'Fortress boss',
  custom: 'Custom mob',
  celestial: 'Celestial Trial',
  pvp: 'PVP vs my saved opponents',
});

export const OBJECTIVE_LABEL = Object.freeze({
  dps: 'Damage per second',
  survival: 'Survival chance',
  'win-chance': 'Highest chance to win',
  'win-rate': 'Reach a win rate',
  push: 'Push (deepest step)',
  'pvp-winrate': 'PVP win rate',
  'arena-reward': 'Arena Influence from wins',
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

/** A contrast that fell back to win rate, kept in win-rate points (the table's unit when every row fell back). */
const asWinRate = (c) => (c?.basis === 'winRate' ? { ...c, pct: null } : orientContrast(c));

/**
 * Why a row has no value of its own (backlog §6): a time objective has no median when the build rarely
 * wins, so say so with its win rate and the basis the verdicts used. Null when the row has a value.
 */
export function valueNoteOf(row, rows = []) {
  if (!row || finite(row.value?.est)) return null;
  const rate = row.aux?.winRate?.est;
  if (!finite(rate)) return null;
  const basis = rows.some((r) => r.vsBaseline?.basis === 'winRate') ? 'compared by win rate' : 'too few wins to time';
  return `Rarely clears: ${Math.round(rate * 100)}% win rate; ${basis}`;
}

/**
 * What the results table renders: the baseline, the ranked rows, the table's single forest domain, and
 * how many non-baseline rows were withheld because they list no change (I3 would be broken, so such a
 * row is never shown as a result).
 * @returns {{unit: string, higherIsBetter: boolean, baseline: Object|null, rows: Object[], withheld: number, domain: Object}}
 */
export function viewResult(result) {
  const hib = result?.objective?.higherIsBetter !== false;
  const all = (result?.rows ?? []).filter((r) => !r.isBaseline);
  const listed = all.filter((r) => (r.changes ?? []).length > 0);
  // Every row fell back to win rate (a saved kill-time run where nothing wins often): draw the axis in
  // win-rate points, the basis the verdicts actually used, and show each build's win rate as its value.
  const winBasis = listed.length > 0 && listed.every((r) => r.vsBaseline?.basis === 'winRate');
  const unit = winBasis ? 'p' : (result?.objective?.unit ?? 'dps');
  const winRow = (r) => ({
    ...r,
    value: r.aux?.winRate ?? r.value,
    vsBaseline: asWinRate(r.vsBaseline),
    changes: (r.changes ?? []).map((c) => ({ ...c, own: asWinRate(c.own), needed: asWinRate(c.needed) })),
    remainder: null,
  });
  const rows = listed.map((r) => (winBasis ? winRow(r) : orientRow(r, hib)));
  const base = result?.baseline ? { changes: [], ...result.baseline } : null;
  const valueNote = valueNoteOf(base, listed);
  const baseline = base ? { ...base, ...(winBasis && base.aux?.winRate ? { value: base.aux.winRate } : {}), ...(valueNote ? { valueNote } : {}) } : null;
  const items = [];
  for (const r of rows) {
    items.push(r.vsBaseline);
    for (const c of r.changes) items.push(c.own);
    items.push(r.remainder);
  }
  return {
    unit,
    kind: result?.objective?.kind ?? null,
    fortress: result?.target?.fortress ?? null,
    goal: result?.goal ? { status: result.goal.status, target: result.goal.target, ...(result.goal.mode === 'max' ? { mode: 'max' } : {}) } : null,
    push: result?.push ?? null,
    higherIsBetter: hib,
    baseline,
    rows,
    withheld: all.length - rows.length,
    domain: forestDomain(items),
  };
}

/**
 * A Fortress boss row's damage in the 60 s fight: raw, and what the clan is credited (the run's constant
 * multipliers, display only). `dps` is the row's mean damage per second.
 */
export function fortressDamage(fortress, dps, seconds = 60) {
  if (!fortress || !finite(dps)) return null;
  const raw = Math.round(dps * seconds);
  return { raw, effective: Math.round(raw * fortress.total) };
}

/**
 * The win-rate goal's standing of one row against its target: a chip verdict ('meets' | 'below' | 'open' for
 * a target not yet resolved, null when the row has none) and how far short it is, in points.
 */
export function targetStanding(row, target) {
  const m = row?.aux?.meetsTarget;
  if (target == null || typeof m !== 'boolean' && m !== null) return { verdict: null, gap: '' };
  const est = row.aux.winRate?.est;
  const gap = m !== true && finite(est) && est < target ? `${((target - est) * 100).toFixed(1)} points below target` : '';
  return { verdict: m === true ? 'meets' : m === false ? 'below' : 'open', gap };
}

/**
 * The win rate a goal's headline talks about: the current build's when it already clears, else the leading
 * row's (search.js goalOf: the first row, or the current build when there is none; for the highest chance to
 * win, the first row shown better than the current build); null without a goal or a rate.
 */
export function goalWinRate(view) {
  if (!view?.goal) return null;
  const lead = view.goal.mode === 'max' ? view.rows.find((r) => r.vsBaseline?.verdict === 'better') : view.rows[0];
  const row = view.goal.status === 'already' ? view.baseline : (lead ?? view.baseline);
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
    const push = run.headline?.push ? { ...run.headline.push, rungs: run.detail.push?.rungs ?? [] } : null;
    return viewResult({
      objective: { unit, higherIsBetter: hib, kind: run.objective?.kind }, target: run.target ?? null, goal: run.headline?.goal ?? null,
      baseline: run.detail.baseline, rows: run.detail.rows, push,
    });
  }
  const { baseline, rows } = legacyRows(run.detail, unit);
  return { ...viewResult({ objective: { unit, higherIsBetter: true }, baseline, rows }), legacy: true };
}

// ---- Push ------------------------------------------------------------------------------------

/**
 * The Push ladder strip (simulation.md §Push): one cell per rung shown, from the start rung. `now`: the
 * current build clears it (confirmed); `new`: only the suggested build does (confirmed); `stop`: the
 * first rung not reached; `open`: climbed past without a confirmed claim. `push` is a result's `push`
 * block or a saved run's (headline.push plus detail.push.rungs).
 */
export function ladderStrip(push) {
  if (!push) return [];
  const now = push.baseline?.index ?? push.baseline?.deepest ?? null;
  const reached = push.reached?.index ?? push.reached?.deepest ?? null;
  const stop = push.stop?.index ?? null;
  return (push.rungs ?? []).map((r) => {
    const state = now != null && r.index <= now ? 'now'
      : reached != null && r.index <= reached ? 'new'
        : r.index === stop ? 'stop' : 'open';
    return { index: r.index, label: r.label, state };
  });
}

/** The Push block's one-line reading of where the climb stopped. */
export function pushStopText(push) {
  const s = push?.stop;
  if (!s) return '';
  const pct = (p) => `${Math.round((p ?? 0) * 1000) / 10}%`;
  if (s.reason === 'top') return 'The climb reached the top of the ladder.';
  if (s.reason === 'screen') return `Stopped at ${s.label}: no build one change away came close to ${pct(push.target)}, and no single change raised the win rate (best seen ${pct(s.best?.est)}). Not reached at this effort; the Win rate goal on that ${push.ladder?.unit ?? 'step'} searches further.`;
  return `Stopped at ${s.label}: no build reached ${pct(push.target)} (best ${pct(s.best?.est)}).`;
}

// ---- change labels --------------------------------------------------------------------------

/** What each change dimension (effect.js `changesOf`) is called on screen. */
export const DIMENSION_LABEL = Object.freeze({
  stones: 'Stone assignment',
  relicUpgrades: 'Relic upgrades', relicPurchases: 'Relic purchases',
  boardAllocation: 'Board allocation', awakening: 'Awakening',
  equipmentSet: 'Gear set', spec: 'Talent set', talents: 'Talents', pet: 'Pet', mount: 'Mount', relics: 'Relics', sigils: 'Sigils',
  utility: 'Utility sigil', ancient: 'Ancient sigil', transcendence: 'Transcendence', conditions: 'Sigil conditions',
  minorGlyphs: 'Minor glyphs', majorGlyphs: 'Major glyphs', mythicGlyphs: 'Mythic glyphs',
});
const GLYPH_DIMENSION = /Glyphs$/;
const TIER_WORD = { minor: 'Minor', major: 'Major', mythic: 'Mythic' };

/** A change as one line: a talent change lists only the points that moved (`moved`, backlog §6). */
export const changeText = (c) => `${c.label}: ${c.moved || `${c.from} → ${c.to}`}`;

/** A dimension key as text; never the raw key. */
export const dimensionLabel = (dimension) => DIMENSION_LABEL[dimension] ?? (/^[A-Z]/.test(dimension) ? dimension : 'Other'); // a legacy run stored the label itself

/**
 * "8 changes · Talent set, Talents, Mount, Relics, Sigils, 3 glyph sockets": each dimension once, every
 * glyph socket counted together; free fills are not changes and are named last ("· fills 1 empty socket").
 */
export function changeSummary(all = []) {
  const changes = all.filter((c) => !c.free);
  const fills = all.length - changes.length;
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
  const free = fills ? ` · fills ${fills} empty socket${fills === 1 ? '' : 's'}` : '';
  return `${changes.length} change${changes.length === 1 ? '' : 's'}${text ? ` · ${text}` : ''}${free}`;
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

/** The badge of a change kept for its interaction: what it means, never a red Downgrade. */
export const INTERACTION_LABEL = 'Helps with the other changes';

/**
 * How a change row reads (simulation.md §Result, change display). A change kept for its interaction
 * (`keptBecause: 'interaction'`, or "Only with" another change) leads with `needed`, its value in this build
 * ("Without it"), under the badge INTERACTION_LABEL, coloured up only when `needed` is better and otherwise
 * neutral; its own effect alone on the current build is secondary text. Every other change leads with `own`.
 * @returns {{kind: 'interaction'|'own', lead: Object|null, chip: {verdict: string, label?: string}|null, dep: string|null}}
 */
export function changeEffect(change, changes = []) {
  const dep = onlyWith(change, changes);
  if (change?.needed && (dep || change.keptBecause === 'interaction')) {
    const verdict = change.needed.verdict === 'better' ? 'better' : 'equivalent';
    return { kind: 'interaction', lead: { ...change.needed, verdict }, chip: { verdict, label: INTERACTION_LABEL }, dep };
  }
  return { kind: 'own', lead: change?.own ?? null, chip: change?.own ? { verdict: change.own.verdict } : null, dep: null };
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
export function effortPlan(level, objective, target) {
  const relative = objective?.kind === 'dps';
  let deltaScale;
  if (objective?.kind === 'arena-reward') {
    try { deltaScale = arenaRewardConfig(objective, target).scale; } catch { /* incomplete form */ }
  }
  const e = resolveEffort(level, { deltaKind: relative ? 'relative' : 'absolute', deltaScale });
  const zone = objective?.kind === 'arena-reward'
    ? deltaScale == null ? 'a reward difference (enter Arena positions)' : `${+e.delta.toFixed(3)} Influence per attack`
    : relative ? `${+(e.delta * 100).toFixed(2)}%` : `${+(e.delta * 100).toFixed(1)} points`;
  return { ...e, zone, relative, sub: `spots ${zone} or more` };
}

// ---- allowed to change ----------------------------------------------------------------------

/** The space toggles in the order of the four step groups (ia.md §3.3; keys are search/space.js BLOCKS). */
export const SPACE_GROUPS = Object.freeze([
  { id: 'gear', label: 'Gear', items: [['equipmentSet', 'Gear set'], ['stones', 'Re-slot owned stones']] },
  { id: 'talents', label: 'Talents', items: [['spec', 'Talent set'], ['talents', 'Talent points']] },
  { id: 'companions', label: 'Companions', items: [['pet', 'Pet'], ['mount', 'Mount'], ['minorGlyphs', 'Minor glyphs'], ['majorGlyphs', 'Major glyphs']] },
  { id: 'relics', label: 'Relics', items: [['relics', 'Owned relic selection'], ['relicUpgrades', 'Upgrade relics'], ['relicPurchases', 'Buy relics']] },
  { id: 'sigils', label: 'Sigils', items: [['sigils', 'Sigils'], ['utility', 'Utility sigil'], ['ancient', 'Ancient sigil'], ['conditions', 'Sigil conditions']] },
  { id: 'transcendence', label: 'Transcendence', items: [['transcendence', 'Saved board'], ['boardAllocation', 'Reallocate board']] },
  { id: 'awakening', label: 'Awakening', items: [['awakening', 'Path and actual level']] },
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
  if (cand.relicLevels) cand.relicLevels = { ...cand.relicLevels };
  const kept = new Set();
  row.writes.forEach((g, i) => {
    if (off.has(i)) return;
    kept.add(g.scope);
  });
  row.writes.forEach((g, i) => {
    if (!off.has(i)) return;
    if (g.scope !== 'character') return;
    if (g.changeIds.some((id) => id.startsWith('talents:'))) cand.talentAllocation = null;
    else if (g.changeIds.some((id) => id.startsWith('stones:'))) delete cand.stoneAssignment;
    else if (g.changeIds.some((id) => id.startsWith('board:'))) delete cand.boardAllocation;
    else if (g.changeIds.includes('awakening')) delete cand.awakening;
    else if (g.changeIds.some((id) => id.startsWith('relicLevel:'))) {
      for (const id of g.changeIds) if (id.startsWith('relicLevel:')) delete cand.relicLevels?.[id.slice(11)];
      if (cand.relicLevels && !Object.keys(cand.relicLevels).length) delete cand.relicLevels;
    }
    else cand.sigilConditions = {};
  });
  // A character-scope group stays on when any of its groups does; the dropped one was reset above.
  // Nothing excluded: every scope, so the store checks the whole candidate's legality before writing.
  const include = off.size === 0 ? [...SCOPES] : SCOPES.filter((s) => kept.has(s));
  const presetIndex = row.writes.findIndex((g) => g.scope === 'preset');
  const purchases = (row.changes ?? []).filter((c) => c.dimension === 'relicPurchases');
  const splitPurchase = purchases.some((c) => {
    const i = row.writes.findIndex((g) => g.changeIds.includes(c.id));
    return i >= 0 && presetIndex >= 0 && off.has(i) !== off.has(presetIndex);
  });
  const boardDependency = (row.changes ?? []).some((c) => c.id === 'transcendence' || (c.id === 'ancient' && c.bundle?.some((id) => id.startsWith('board:'))));
  const boardIndex = row.writes.findIndex((g) => g.changeIds.some((id) => id.startsWith('board:')));
  const splitBoard = boardDependency && boardIndex >= 0 && presetIndex >= 0 && off.has(boardIndex) !== off.has(presetIndex);
  return { cand, include, writesCount: row.writes.length - off.size,
    ...(splitPurchase ? { blockReason: 'Apply relic purchases and their equipment changes together, or switch both off.' }
      : splitBoard ? { blockReason: 'Apply this board allocation and its board/Ancient choices together, or switch both off.' } : {}) };
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
  if (result.push) {
    const p = result.push;
    return [p.status === 'pushed' ? { tone: 'up', text: `Reaches ${p.reached.label}` } : { text: p.baseline?.label ? `Stays at ${p.baseline.label}` : 'No step reached' }];
  }
  if (result.goal) {
    const g = result.goal.status;
    return [g === 'already' ? { tone: 'up', text: 'Already clears' } : g === 'reached' ? { tone: 'up', text: 'Target reached' } : { tone: 'warn', text: 'Target not reached' }];
  }
  if (h.better > 0) chips.push({ tone: 'up', text: `${h.better} better` });
  else chips.push({ text: 'Nothing beat the current build' });
  if (h.unresolved > 0) chips.push({ tone: 'warn', text: `${h.unresolved} too close to call` });
  return chips;
}

/** Why attribution kept a change (search/minimise.js attribute). */
export const KEPT_BECAUSE_TEXT = Object.freeze({
  'own-effect': 'Kept for its own effect',
  interaction: 'Kept because it works with other changes',
  'power-floor': 'Kept to stay at or above your minimum Combat Power',
  free: 'Fills an empty socket with a glyph you own. It made no clear difference in this fight and is not counted as a change',
});

const powerNum = (v) => formatFlat(Math.abs(v));

/**
 * A row's Combat Power line, flat game style: the baseline's Power ("Power 250.969"), a build's change
 * against it ("Power −1.240", "Power +310", "Power ±0"), or '' when either figure is missing (runs saved without Power).
 */
export function powerText(row, basePower) {
  const p = row?.power;
  if (typeof p !== 'number' || !Number.isFinite(p)) return '';
  if (row.isBaseline) return `Power ${powerNum(p)}`;
  if (typeof basePower !== 'number' || !Number.isFinite(basePower)) return '';
  const d = Math.round(p - basePower);
  return `Power ${d > 0 ? '+' : d < 0 ? '−' : '±'}${powerNum(d)}`;
}
