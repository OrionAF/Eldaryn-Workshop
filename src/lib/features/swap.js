// features/swap.js (F1): gear swap / Drop Check. rebuild-plan §5 row 1, §4 "Sheet-anchored deltas".
//
// Two halves:
//   prepareSwap()      main thread, synchronous: per preset, the stats before and after the swap, the
//                      before/after Fighters and the closed-form auto-attack DPS (combat-pve.md §7).
//   runSwapMetrics()   async (the worker task 'dropCheck' calls it): every goal (an Optimiser target and
//                      objective, search/objectives.js) as a common-random-number paired contrast resolved by
//                      the Optimiser's sequential comparator (search/sampler.js compareSets, simulation.md §Drop Check).
//                      A guard goal is instead a one-sided check that the after-build keeps a clear rate.
//   verdictFor()       upgrade / sidegrade / downgrade / mixed / inconclusive from those contrasts and guards,
//                      with the goals it covers and the changed stats no goal judged.
//
// How the "after" stats are made. With a sheet (tier 2) the in-game numbers are authoritative, so the
// item difference is added to them in raw space (engine/pipeline/anchoredDelta.js). Without a sheet the
// pipeline is exact, so the character is cloned with the item swapped and recomputed (tier 1).
import { buildFighter } from '../build/fighter.js';
import { computePresetStats } from '../build/stats.js';
import { equipSetKey } from '../build/presetInputs.js';
import { anchoredDeltaDetailed } from '../engine/pipeline/anchoredDelta.js';
import { sheetKeyMeta, toDisplay } from '../engine/pipeline/sheet.js';
import { holm } from '../engine/metrics.js';
import { statByEnum } from '../game/stats.js';
import { resolveTarget, makeObjective, enemyDealsDamage, meetsTarget } from '../search/objectives.js';
import { lookSchedule } from '../engine/stats/index.js';
import { createSampler, compareSets, looksFor, sliceSet, isAbort } from '../search/sampler.js';

// ---------------------------------------------------------------------------------------------
// item -> raw delta

/** Secondary types the pipeline sums (totals.js SECONDARY_ACC) that have no stats.json computedKey. */
const EXTRA_KEYS = { FEAR_CHANCE: 'fearChance' };
/** Gear PVP ratings are ignored by the client's equipment switch (the client totals), so they never move a total. */
const INERT = new Set(['PVP_ATTACK', 'PVP_DEFENSE']);
const CONDUIT_KEY = { FLAME: 'totalFlameConduit', EARTHEN: 'totalEarthenConduit', DARK: 'totalDarkConduit' };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Display label of a ComputedStats key. */
export const statKeyLabel = (key) => sheetKeyMeta(key)?.label ?? key;

/** The ComputedStats key an item secondary feeds, or null when it feeds nothing. */
export function secondaryKey(type) {
  if (INERT.has(type)) return null;
  return EXTRA_KEYS[type] ?? statByEnum(type)?.computedKey ?? null;
}

function addItem(acc, item, sign) {
  if (!item) return;
  const bump = (k, v) => {
    if (v) acc[k] = (acc[k] ?? 0) + sign * v;
  };
  bump('totalAttack', num(item.primaryStats?.attack));
  bump('totalHp', num(item.primaryStats?.hp));
  for (const s of item.secondaryStats ?? []) {
    const key = secondaryKey(s.type);
    if (key) bump(key, num(s.value));
  }
  if (item.conduit && CONDUIT_KEY[item.conduit.type]) bump(CONDUIT_KEY[item.conduit.type], num(item.conduit.value));
}

/**
 * Per-stat difference `candidate - current`, keyed by ComputedStats key in raw pre-curve units
 * (the input of anchoredDelta). Attack Speed and Crit Damage stay multiplier deltas, percent stats
 * percent points; `totalAttack` / `totalHp` are the primary-stat differences.
 * @returns {Object<string, number>} zero entries are left out
 */
export function itemRawDelta(current, candidate) {
  const acc = {};
  addItem(acc, candidate, 1);
  addItem(acc, current, -1);
  for (const k of Object.keys(acc)) if (Math.abs(acc[k]) < 1e-9) delete acc[k];
  return acc;
}

// ---------------------------------------------------------------------------------------------
// closed form

/**
 * Expected auto-attack damage per second against a training dummy (DR 0, Block 0), combat-pve.md §7:
 * `attack * (1 + c*(m-1) + h) * 1000 / round(1000 / attackSpeed)`. Spells, minions and DoTs are not
 * in it (the sim covers those).
 */
export function autoAttackDps(stats) {
  const speed = num(stats?.totalAttackSpeed);
  const attack = num(stats?.totalAttack);
  if (!(speed > 0) || !(attack > 0)) return 0;
  const interval = Math.max(1, Math.round(1000 / speed));
  const c = Math.min(1, Math.max(0, num(stats.totalCritChance) / 100));
  const m = num(stats.totalCritDamage) || 1;
  const h = Math.max(0, num(stats.totalDoubleHit) / 100);
  return (attack * (1 + c * (m - 1) + h) * 1000) / interval;
}

// ---------------------------------------------------------------------------------------------
// preparing the comparison (main thread)

/** Stat rows shown in the per-preset diff, in display order. */
const DIFF_KEYS = [
  'totalAttack', 'totalHp', 'totalAttackSpeed', 'totalCritChance', 'totalCritDamage', 'totalDoubleHit',
  'totalAttackPercent', 'totalHealthPercent', 'totalPenetration', 'totalLifesteal', 'totalHpRegen',
  'totalDamageReduction', 'totalBlockChance', 'totalMissChance', 'totalSpellDamage',
];

/**
 * Stats that differ between two ComputedStats, as display rows.
 * @returns {Array<{key: string, label: string, before: number, after: number, delta: number, display: {before: number, after: number, delta: number}}>}
 */
export function statDeltas(before, after, keys = DIFF_KEYS) {
  const rows = [];
  for (const key of keys) {
    const b = num(before?.[key]);
    const a = num(after?.[key]);
    if (a === b) continue;
    rows.push({
      key,
      label: sheetKeyMeta(key)?.label ?? key,
      before: b,
      after: a,
      delta: a - b,
      display: { before: toDisplay(key, b), after: toDisplay(key, a), delta: toDisplay(key, a - b) },
    });
  }
  return rows;
}

/** A clone of `character` whose set `setKey` has `item` in `slot` (everything else shared, not copied). */
export function withItem(character, setKey, slot, item) {
  const set = character.equipment[setKey];
  return { ...character, equipment: { ...character.equipment, [setKey]: { ...set, items: { ...set.items, [slot]: item } } } };
}

/**
 * Which equipment sets Drop Check compares a drop against: 'all', or 'set1' (a base-realm drop is tried only
 * in Set 1, so presets wearing Set 2 are neither simulated nor judged). Oblivion has one set either way.
 */
export const DROP_SET_SCOPES = ['all', 'set1'];
export const setInScope = (setKey, sets = 'all') => sets !== 'set1' || setKey !== 'set2';

/**
 * Everything the screen shows before any simulation, per preset.
 *
 * @param {Object} character  a normalised v2 Character
 * @param {{slot: string, item: Object, realm?: 'base'|'oblivion', presetIds?: string[]|null, sets?: 'all'|'set1'}} drop
 *   `presetIds` null or omitted means every preset; `sets` drops the presets whose set is out of scope (setInScope)
 * @returns {Array<{
 *   presetId: string, name: string, setKey: 'set1'|'set2'|'oblivion', current: Object|null,
 *   source: 'sheet'|'computed', method: 'anchored'|'recomputed', approx: boolean, errors: Object<string, number>,
 *   sheetStatus: string, warnings: string[], rawDelta: Object<string, number>,
 *   before: Object, after: Object, statsBefore: Object, statsAfter: Object,
 *   closed: {before: number, after: number, delta: number, pct: number|null},
 * }>}  `before` / `after` are Fighters (plain data)
 */
export function prepareSwap(character, { slot, item, realm = 'base', presetIds = null, sets = 'all' }) {
  const ids = presetIds ?? character.presets.map((p) => p.id);
  const out = [];
  for (const presetId of ids) {
    const preset = character.presets.find((p) => p.id === presetId);
    if (!preset) continue;
    const setKey = equipSetKey(preset, realm);
    if (!setInScope(setKey, sets)) continue;
    const current = character.equipment?.[setKey]?.items?.[slot] ?? null;
    const rawDelta = itemRawDelta(current, item);
    const res = computePresetStats(character, presetId, { realm });
    const before = buildFighter(character, presetId, { realm });
    let after;
    let method;
    let approx = false;
    let errors = {};
    if (res.source === 'sheet') {
      method = 'anchored';
      const a = anchoredDeltaDetailed(before.stats, rawDelta, { ...res.ctx, exact: res.exact });
      after = { ...before, stats: a.stats };
      ({ approx, errors } = a);
    } else {
      method = 'recomputed';
      after = buildFighter(withItem(character, setKey, slot, item), presetId, { realm });
    }
    const cb = autoAttackDps(before.stats);
    const ca = autoAttackDps(after.stats);
    out.push({
      presetId,
      name: preset.name,
      setKey,
      current,
      source: res.source,
      method,
      approx,
      errors,
      sheetStatus: res.sheetStatus,
      warnings: res.warnings,
      rawDelta,
      before,
      after,
      statsBefore: before.stats,
      statsAfter: after.stats,
      closed: { before: cb, after: ca, delta: ca - cb, pct: cb > 0 ? ((ca - cb) / cb) * 100 : null },
    });
  }
  return out;
}

/** Group prepared rows by the equipment set they would change, in set1, set2, oblivion order. */
export function groupBySet(rows) {
  const order = ['set1', 'set2', 'oblivion'];
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.setKey)) groups.set(r.setKey, []);
    groups.get(r.setKey).push(r);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([setKey, items]) => ({ setKey, rows: items }));
}

// ---------------------------------------------------------------------------------------------
// precision (open decision Q4, plan §F)

/**
 * Indifference zone and give-up size per comparison. `rel` is the zone of a relative goal (DPS, clear time),
 * `prob` the absolute zone of a rate (win chance, win rate, survival) (docs/Reference/simulation.md §Statistics).
 */
export const DROP_PRECISION = {
  quick: { rel: 0.01, prob: 0.02, maxN: 8192 },
  standard: { rel: 0.005, prob: 0.01, maxN: 32768 },
  thorough: { rel: 0.0025, prob: 0.005, maxN: 131072 },
};
/** Family-wise level over the goals of one preset. */
export const FAMILY_ALPHA = 0.05;

const precisionOf = (p) => DROP_PRECISION[p] ?? DROP_PRECISION.standard;

// ---------------------------------------------------------------------------------------------
// goals (the Optimiser's targets and objectives; simulation.md §Drop Check)

/**
 * Objective kinds Drop Check judges a drop by. `win-rate` ("fewest changes to reach X") and `push` (a ladder
 * search) mean nothing for one swap (docs/WIP/being-worked-on/drop-check-goals.md §3.2).
 */
export const DROP_OBJECTIVE_KINDS = Object.freeze(['dps', 'win-chance', 'fastest-clear', 'pvp-winrate', 'arena-reward', 'survival']);
/** Objective kinds a guard can hold to a rate: the ones whose statistic is a proportion. */
export const GUARD_OBJECTIVE_KINDS = Object.freeze(['win-chance', 'pvp-winrate', 'survival']);
const DEFAULT_GUARD_TARGET = 0.95;

/**
 * A goal's target and objective, resolved (search/objectives.js). Throws with the Optimiser's own message
 * when the target does not resolve or the objective cannot score it, or when Drop Check does not take it.
 * @param {{target: Object, objective: Object}} goal
 * @param {{character?: Object, partner?: Object|null}} ctx  pvp needs the character's opponents, Celestial its partner
 */
export function goalObjective(goal, ctx = {}) {
  if (!DROP_OBJECTIVE_KINDS.includes(goal?.objective?.kind)) throw new Error(`Drop Check cannot judge by '${goal?.objective?.kind}'`);
  if (goal.role === 'guard' && !GUARD_OBJECTIVE_KINDS.includes(goal.objective.kind)) throw new Error('A guard needs a clear rate: pick a win or survival chance');
  const target = resolveTarget(goal.target, ctx);
  return { target, objective: makeObjective(goal.objective, target) };
}

/** True when nothing in the fight can hurt the player: the goal then sees damage stats only. */
export function goalIsDamageOnly(target, objective) {
  if (objective.kind !== 'dps') return false;
  try {
    return !enemyDealsDamage(target.enemy);
  } catch {
    return false;
  }
}

/** First look per objective statistic (fights per lane): the mean settles fastest, a rate needs more. */
export function firstLook(objective) {
  if (objective.statistic === 'mean') return 32;
  return (objective.lanes ?? 1) > 1 ? 64 : 200;
}

/** The comparator options of one goal at a precision: δ in the objective's own kind. `firstN` overrides the first look (tests). */
export function goalEffort(objective, precision = 'standard', maxN = null, firstN = null) {
  const p = precisionOf(precision);
  const n0 = Number.isInteger(firstN) && firstN >= 1 ? firstN : firstLook(objective);
  const cap = Math.max(n0, Math.floor(maxN ?? p.maxN));
  const delta = objective.deltaKind === 'relative' ? p.rel : p.prob * (objective.deltaScale ?? 1);
  return { n0, maxN: cap, delta, deltaKind: objective.deltaKind, deltaWinRate: p.prob };
}

/**
 * The unit a contrast is shown in: its basis decides (a win-rate goal decided on the HP margin is still in
 * points; Fastest clear falls back to the clear rate when neither build reaches the quantile).
 */
export function contrastUnit(objective, delta) {
  const b = delta?.basis;
  if (b === 'quantile') return 'ms';
  if (b === 'winRate' || b === 'win-rate' || b === 'margin') return 'p';
  return objective.unit ?? (objective.statistic === 'mean' ? 'dps' : 'p');
}

// ---------------------------------------------------------------------------------------------
// family

const contrastsOf = (res) => (res?.goals ?? []).filter((m) => m?.delta);

/**
 * Holm step-down over one preset's goals (the family). Each p-value is first multiplied by the number of
 * looks its comparator could spend (Bonferroni over looks). Adds `delta.pHolm` and `delta.holmReject` in place.
 * @returns {Object} the same `res`
 */
export function applyFamily(res, alpha = FAMILY_ALPHA) {
  const ms = contrastsOf(res);
  if (!ms.length) return res;
  const ps = ms.map((m) => Math.min(1, (m.delta.p ?? 1) * (m.delta.nLooks ?? 1)));
  const h = holm(ps, alpha);
  ms.forEach((m, i) => {
    m.delta.pHolm = h.adjusted[i];
    m.delta.holmReject = h.reject[i];
  });
  return res;
}

// ---------------------------------------------------------------------------------------------
// metrics (pure over search/objectives.js and search/sampler.js; runs in the worker)

/** The estimate of one side in the objective's statistic, as `{mean, lo, hi, n}`. */
function briefOf(objective, set) {
  try {
    const v = objective.estimate(set).value;
    return { mean: v.est ?? null, lo: v.lo ?? null, hi: v.hi ?? null, n: set.n };
  } catch {
    return { mean: null, lo: null, hi: null, n: set.n };
  }
}

/**
 * A guard (simulation.md §Drop Check): does the after-build keep the goal's rate at its target? Looks n0, 2 n0,
 * ... maxN on the after side, Wilson at alpha / looks, until `meetsTarget` resolves (inside the zone counts as
 * kept). When the after-build falls short, the before-build is checked the same way on the same fights: a
 * build already below the target without the drop is `below` (the drop did not break it), not `fail`.
 * @returns {Promise<{status: 'pass'|'fail'|'below'|'unresolved', target: number, after: Object, before: Object|null}>}
 */
async function guardCheck(objective, tau, getSide, effort, alpha) {
  const looks = lookSchedule(effort.n0, effort.maxN);
  const a = alpha / looks.length;
  const run = async (side) => {
    for (let k = 0; k < looks.length; k++) {
      const v = objective.estimate(await getSide(side, looks[k]), { alpha: a }).value;
      const meets = meetsTarget(v, tau, effort.deltaWinRate);
      if (meets != null || k === looks.length - 1) return { meets, value: { est: v.est, lo: v.lo, hi: v.hi, n: looks[k] } };
    }
    throw new Error('unreachable');
  };
  const after = await run('after');
  if (after.meets !== false) return { status: after.meets ? 'pass' : 'unresolved', target: tau, after: after.value, before: null };
  const before = await run('before');
  const status = before.meets === true ? 'fail' : before.meets === false ? 'below' : 'unresolved';
  return { status, target: tau, after: after.value, before: before.value };
}

/**
 * Run every goal for every item. Before and after share the stage seed, so fight i draws the same randomness
 * on both sides (common random numbers). Each (item, goal) is the Optimiser's sequential comparison
 * (sampler.js compareSets): looks at n0, 2 n0, ... until the after-build is better, worse or equivalent
 * within the precision zone, or `unresolved` at maxN. A preset's goals share one family-wise level, split
 * evenly (`alpha / goals`) and re-checked with Holm (applyFamily).
 *
 * @param {Array<{presetId: string, before: Object, after: Object, baseKey?: string, goalIds?: string[]}>} items
 *   Fighters, plain data; `baseKey` marks items whose `before` is identical (its fights are drawn once);
 *   `goalIds` limits an item to some goals (an Oblivion drop only meets Oblivion goals), all when omitted
 * @param {{
 *   goals: Array<{id: string, target: Object, objective: Object, partner?: Object}>, character?: Object, partner?: Object|null,
 *   seed?: number, precision?: 'quick'|'standard'|'thorough', maxN?: number, n0?: number,
 * }} o  `n0` overrides every goal's first look (tests)
 * @param {{signal?: AbortSignal, onProgress?: Function, sampleFor?: Function, onGoalDone?: Function}} [ctx]  progress
 *   is {done, total} in whole comparisons. `sampleFor(goal)` returns a sampler `(fighter, {seed, from, to, signal}) =>
 *   chunk` for the goal (tasks/dropCheck.js: the objective kernel on the job's pool); without it the objective
 *   samples inline. Goals run one at a time over every item; `onGoalDone(goal)` follows each (to free its pool).
 * @returns {Promise<{results: Array<Object>, aborted: boolean}>}  per item `{presetId, goals: [...], noGoals?, errors?}`
 *   (`noGoals` when no goal runs on the item);
 *   a goal that cannot run (its target no longer resolves) is listed in `errors`, never thrown
 */
export async function runSwapMetrics(items, o = {}, { signal, onProgress, sampleFor, onGoalDone } = {}) {
  const { goals = [], character = null, partner = null, seed = 1, precision = 'standard' } = o;
  const resolved = goals.map((goal) => {
    try {
      const { target, objective } = goalObjective(goal, { character, partner: goal.partner ?? partner });
      const sample = sampleFor ? sampleFor(goal) : objective.sample;
      return { goal, target, objective, sampler: createSampler({ sample }), meta: metaOf(goal, target, objective) };
    } catch (e) {
      return { goal, error: e?.message ?? String(e) };
    }
  });
  const goalsOf = (item) => resolved.filter((g) => !item.goalIds || item.goalIds.includes(g.goal.id));
  const total = items.reduce((a, it) => a + goalsOf(it).filter((g) => !g.error).length, 0);
  let done = 0;
  let aborted = false;

  // One result per item up front; goals run one after another (each over every item), so a goal's worker pool
  // can close before the next opens (`onGoalDone`).
  const results = items.map((item) => {
    const errors = goalsOf(item).filter((g) => g.error).map((g) => ({ goalId: g.goal.id, error: g.error }));
    // no goal judges this item (its preset is out of every goal's scope, or the batch screen left it out)
    const noGoals = !goalsOf(item).some((g) => !g.error);
    return { presetId: item.presetId, goals: [], ...(noGoals ? { noGoals: true } : {}), ...(errors.length ? { errors } : {}) };
  });
  const alphaOf = items.map((item) => FAMILY_ALPHA / Math.max(1, goalsOf(item).filter((g) => !g.error).length));

  try {
    for (const g of resolved) {
      if (g.error) continue;
      for (const [idx, item] of items.entries()) {
        if (item.goalIds && !item.goalIds.includes(g.goal.id)) continue;
        const alpha = alphaOf[idx];
        const stage = { id: g.goal.id, seed };
        const keys = [item.baseKey == null ? `${idx}|before` : `base|${item.baseKey}`, `${idx}|after`];
        const effort = goalEffort(g.objective, precision, o.maxN, o.n0);
        if (g.goal.role === 'guard') {
          const getSide = (side, n) => g.sampler.get(keys[side === 'after' ? 1 : 0], stage, item[side], n, { signal });
          const guard = await guardCheck(g.objective, g.goal.guard?.target ?? DEFAULT_GUARD_TARGET, getSide, effort, alpha);
          results[idx].goals.push({ goalId: g.goal.id, ...g.meta, role: 'guard', unit: 'p', guard });
          onProgress?.({ done: ++done, total });
          continue;
        }
        let before = null;
        let after = null;
        const getAfter = async (n) => (after = await g.sampler.get(keys[1], stage, item.after, n, { signal }));
        const getBefore = async (n) => (before = await g.sampler.get(keys[0], stage, item.before, n, { signal }));
        const c = await compareSets(g.objective, getAfter, getBefore, { ...effort, alpha, seed });
        const n = c.n;
        results[idx].goals.push({
          goalId: g.goal.id,
          ...g.meta,
          role: 'judge',
          unit: contrastUnit(g.objective, c),
          before: briefOf(g.objective, sliceSet(before, n)),
          after: briefOf(g.objective, sliceSet(after, n)),
          delta: {
            delta: c.delta, lo: c.lo, hi: c.hi, n, significant: c.significant, verdict: c.verdict, pct: c.pct,
            zone: c.zone, p: c.p, sd: c.sd, nNeeded: c.nNeeded, method: c.method, basis: c.basis ?? null,
            higherIsBetter: c.higherIsBetter, alphaAdj: c.alphaAdj, looks: c.looks,
            nLooks: looksFor(g.objective, { ...effort, alpha }).length, maxN: effort.maxN, seed,
          },
        });
        onProgress?.({ done: ++done, total });
      }
      g.sampler = null;
      onGoalDone?.(g.goal);
    }
  } catch (e) {
    if (!isAbort(e)) throw e;
    aborted = true;
  }
  for (const r of results) applyFamily(r);
  return { results, aborted };
}

/** What the page shows about a goal, without resolving it again. */
function metaOf(goal, target, objective) {
  return {
    label: `${target.label}: ${objective.label}`,
    targetLabel: target.label,
    objectiveLabel: objective.label,
    objectiveKind: objective.kind,
    deltaKind: objective.deltaKind,
    higherIsBetter: objective.higherIsBetter,
    damageOnly: goalIsDamageOnly(target, objective),
  };
}

// ---------------------------------------------------------------------------------------------
// verdict

/** The closed-form DPS change smaller than this (percent) is a sidegrade. It is an estimate, never a result. */
export const NEUTRAL_PCT = 0.25;

/** Stat keys a damage-only goal (a dummy, a boss that never hits back) can move. */
export const DPS_STAT_KEYS = new Set([
  'totalAttack', 'totalAttackPercent', 'totalAttackSpeed', 'totalCritChance', 'totalCritDamage', 'totalDoubleHit',
  'totalSpellDamage', 'totalSpellCritChance', 'totalMinionAttack', 'totalMinionAttackSpeed', 'totalMinionCritChance',
  'totalFlameConduit', 'totalEarthenConduit', 'totalDarkConduit',
]);

/**
 * 'up' | 'down' | 'flat' | 'unknown' for one contrast. An effect inside the indifference zone is flat even
 * when its interval excludes zero; an unresolved contrast is unknown unless Holm rejects it. The direction
 * follows the contrast's own sense (a shorter clear time is `better`).
 */
export function metricSignal(d) {
  if (!d || !d.verdict) return 'unknown';
  const small = Number.isFinite(d.zone) && Math.abs(d.delta) < d.zone;
  if (d.verdict === 'equivalent') return 'flat';
  if (d.verdict === 'better' || d.verdict === 'worse') {
    if (small) return 'flat';
    return d.verdict === 'better' ? 'up' : 'down';
  }
  if (d.holmReject && !small && d.delta !== 0) {
    const gain = d.higherIsBetter === false ? -d.delta : d.delta;
    return gain > 0 ? 'up' : 'down';
  }
  return 'unknown';
}

/** The closed-form signal: the deterministic auto-attack change against NEUTRAL_PCT. */
function closedSignal(row) {
  const pct = row.closed.pct;
  if (pct == null || Math.abs(pct) < NEUTRAL_PCT) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

/** A guard's one-line reason ("Dungeon 8 drops to 88% (keeps 95%)"). */
export function guardText(g) {
  const pct = (v) => `${Math.round(v * 1000) / 10}%`;
  const r = g.guard;
  if (!r) return '';
  const name = g.targetLabel ?? g.label;
  const at = Number.isFinite(r.after?.est) ? pct(r.after.est) : '?';
  if (r.status === 'fail') return `${name} drops to ${at} (guard ${pct(r.target)})`;
  if (r.status === 'below') return `${name} is below ${pct(r.target)} with or without the drop`;
  if (r.status === 'unresolved') return `${name}: too close to ${pct(r.target)} to call`;
  return `${name} stays at ${pct(r.target)} or more`;
}

/**
 * Verdict for one preset. Over the judges:
 *  'upgrade'      something improves, nothing worsens, nothing is unresolved
 *  'downgrade'    the reverse
 *  'mixed'        something improves and something worsens
 *  'sidegrade'    every measured goal is equivalent within the precision zone
 *  'inconclusive' a goal was still unresolved at its maxN ("too close to call") and nothing contradicts
 * Then the guards (drop-check-goals.md §4.3): a failed guard makes it a downgrade whatever the judges say; an
 * unresolved guard turns an upgrade into inconclusive. A guard never makes a drop an upgrade, and one already
 * failing without the drop (`below`) does not count.
 * Without a simulation the closed-form estimate decides (`basis: 'closed'`, `estimate: true`).
 *
 * `coverage` names the goals measured and `notJudged` the stat keys this item changes that no measured goal
 * can see (HP% when every goal is damage-only), so "Sidegrade" is never read as "defence is fine".
 *
 * @param {{closed: {pct: number|null}, rawDelta?: Object<string, number>}} row  a prepareSwap row
 * @param {Object|null} [simResult]  its runSwapMetrics result, when it has run
 * @returns {{
 *   verdict: 'upgrade'|'sidegrade'|'downgrade'|'mixed'|'inconclusive', basis: 'sim'|'closed', estimate: boolean,
 *   signals: Object<string, string>, unresolved: string[], coverage: string[], coverageLabel: string, notJudged: string[],
 * }}
 */
export function verdictFor(row, simResult = null) {
  const measured = (simResult?.goals ?? []).filter((g) => g?.delta);
  const guards = (simResult?.goals ?? []).filter((g) => g?.role === 'guard' && g.guard);
  const signals = {};
  for (const g of measured) signals[g.goalId] = metricSignal(g.delta);
  const coverage = [...measured, ...guards].map((g) => g.goalId);
  const basis = measured.length || guards.length ? 'sim' : 'closed';
  if (basis === 'closed') signals.dps = closedSignal(row);
  const all = Object.values(signals);
  const up = all.includes('up');
  const down = all.includes('down');
  const unresolved = Object.keys(signals).filter((k) => signals[k] === 'unknown');
  let verdict = up && down ? 'mixed' : unresolved.length ? 'inconclusive' : up ? 'upgrade' : down ? 'downgrade' : 'sidegrade';
  const failed = guards.filter((g) => g.guard.status === 'fail');
  const guardOpen = guards.filter((g) => g.guard.status === 'unresolved').map((g) => g.goalId);
  unresolved.push(...guardOpen);
  if (failed.length) verdict = 'downgrade';
  else if (guardOpen.length && (verdict === 'upgrade' || verdict === 'sidegrade')) verdict = 'inconclusive';
  const seesDefence = guards.length > 0 || measured.some((g) => !g.damageOnly);
  const notJudged = seesDefence ? [] : Object.keys(row?.rawDelta ?? {}).filter((k) => !DPS_STAT_KEYS.has(k));
  const labels = [...measured.map((g) => g.label), ...guards.map((g) => `Guard: ${g.label}`)].join('; ');
  const coverageLabel = basis === 'closed' ? 'Quick estimate from auto-attacks only'
    : seesDefence ? labels
      : `${labels}. Damage only: defence not measured`;
  const guardNotes = guards.filter((g) => g.guard.status !== 'pass').map((g) => ({ goalId: g.goalId, status: g.guard.status, text: guardText(g) }));
  return { verdict, basis, estimate: basis === 'closed', signals, unresolved, coverage, coverageLabel, notJudged, guardNotes, failedGuards: failed.map((g) => g.goalId) };
}

/** Aggregate verdict of a set of preset verdicts (an Apply button writes to the whole set). */
export function aggregateVerdict(verdicts) {
  if (!verdicts.length) return 'empty';
  const up = verdicts.some((v) => v === 'upgrade' || v === 'mixed');
  const down = verdicts.some((v) => v === 'downgrade' || v === 'mixed');
  if (verdicts.includes('mixed') || (up && down)) return 'mixed';
  if (verdicts.includes('inconclusive')) return 'inconclusive';
  return up ? 'upgrade' : down ? 'downgrade' : 'sidegrade';
}
