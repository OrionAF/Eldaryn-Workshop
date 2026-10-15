// features/swap.js (F1): gear swap / Drop Check. rebuild-plan §5 row 1, §4 "Sheet-anchored deltas".
//
// Two halves:
//   prepareSwap()      main thread, synchronous: per preset, the stats before and after the swap, the
//                      before/after Fighters and the closed-form auto-attack DPS (combat-pve.md §7).
//   runSwapMetrics()   async, pure over engine/metrics.js (the worker task 'dropCheck' calls it):
//                      sim DPS, survival and PVP win rate, each a common-random-number paired contrast
//                      resolved by the sequential comparator (engine/stats, simulation.md §Statistics).
//   verdictFor()       upgrade / sidegrade / downgrade / mixed / inconclusive from those contrasts,
//                      with the metrics it covers and the changed stats no metric judged.
//
// How the "after" stats are made. With a sheet (tier 2) the in-game numbers are authoritative, so the
// item difference is added to them in raw space (engine/pipeline/anchoredDelta.js). Without a sheet the
// pipeline is exact, so the character is cloned with the item swapped and recomputed (tier 1).
import { buildFighter } from '../build/fighter.js';
import { computePresetStats } from '../build/stats.js';
import { equipSetKey } from '../build/presetInputs.js';
import { anchoredDeltaDetailed } from '../engine/pipeline/anchoredDelta.js';
import { sheetKeyMeta, toDisplay } from '../engine/pipeline/sheet.js';
import {
  dpsVsDummyAsync, survivalAsync, pvpWinRateAsync, meanCI, wilson, compareAsync, lookSchedule, holm,
} from '../engine/metrics.js';
import { opponentFighter, missingStats } from './duel.js';
import { statByEnum } from '../game/stats.js';
import { PVE_HARD_CHAPTER_OFFSET } from '../game/combatPve.js';
import { raidById } from '../game/fortress.js';
import { chapterMobs, dungeonMobs, raidMobs, oblivionFloorMob } from '../engine/pve/enemies.js';

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
function withItem(character, setKey, slot, item) {
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
// enemies and opponents

/**
 * A PVE target for the survival metric.
 * @param {{kind: 'campaign', chapter: number, level: number}
 *   | {kind: 'dungeon', id: string, step: number}
 *   | {kind: 'raid', id: string, step: number}
 *   | {kind: 'oblivion', floor: number}} spec
 * @returns {{label: string, mobs: Object[], oblivion: boolean}|null}
 */
export function buildEnemy(spec) {
  if (!spec) return null;
  if (spec.kind === 'campaign') {
    const mobs = chapterMobs(spec.chapter, spec.level);
    if (!mobs) return null;
    const hard = spec.chapter > PVE_HARD_CHAPTER_OFFSET;
    const n = hard ? spec.chapter - PVE_HARD_CHAPTER_OFFSET : spec.chapter;
    return { label: `${hard ? 'Hard ' : ''}Chapter ${n}, level ${spec.level}`, mobs, oblivion: false };
  }
  if (spec.kind === 'dungeon') {
    const mobs = dungeonMobs(spec.id, spec.step);
    return mobs ? { label: `${spec.id}, step ${spec.step}`, mobs, oblivion: false } : null;
  }
  if (spec.kind === 'raid') {
    const mobs = raidMobs(spec.id, spec.step);
    return mobs ? { label: `Village raid ${raidById(spec.id).name}, step ${spec.step}`, mobs, oblivion: false } : null;
  }
  if (spec.kind === 'oblivion') {
    const mob = oblivionFloorMob(spec.floor);
    return mob ? { label: `Oblivion floor ${spec.floor}`, mobs: [mob], oblivion: true } : null;
  }
  return null;
}


/**
 * Saved opponents as Drop Check PVP targets. features/duel.js builds each Fighter, so Drop Check fights
 * the same opponent the Duel screen does (Druid form and glyph gate included, #93). An opponent that
 * cannot fight (a blank or partial sheet) is left out and listed with the required stats it lacks.
 * @param {{opponents?: Object[]}} character
 * @returns {{
 *   opponents: Array<{id: string, name: string, fighter: Object}>,
 *   skipped: Array<{id: string, name: string, missing: string[]}>,
 * }}
 */
export function dropOpponents(character) {
  const opponents = [];
  const skipped = [];
  for (const o of character?.opponents ?? []) {
    const fighter = opponentFighter(o);
    const missing = missingStats(fighter);
    if (missing.length) skipped.push({ id: o.id, name: o.name, missing });
    else opponents.push({ id: o.id, name: o.name, fighter });
  }
  return { opponents, skipped };
}

// ---------------------------------------------------------------------------------------------
// precision (open decision Q4, plan §F)

/**
 * Indifference zone and give-up size per comparison. `rel` is the relative DPS zone, `prob` the absolute
 * survival / win-rate zone (docs/Reference/simulation.md §Statistics, sequential comparator).
 */
export const DROP_PRECISION = {
  quick: { rel: 0.01, prob: 0.02, maxN: 8192 },
  standard: { rel: 0.005, prob: 0.01, maxN: 32768 },
  thorough: { rel: 0.0025, prob: 0.005, maxN: 131072 },
};
/** Family-wise level over the metrics of one preset. */
export const FAMILY_ALPHA = 0.05;

const precisionOf = (p) => DROP_PRECISION[p] ?? DROP_PRECISION.standard;

const METRIC = {
  dps: { statistic: 'mean', deltaKind: 'relative' },
  survival: { statistic: 'proportion', deltaKind: 'absolute' },
  pvp: { statistic: 'proportion', deltaKind: 'absolute' },
};

/** Value and interval of one side's samples, in the metric's own statistic. */
function briefOf(kind, xs) {
  if (kind === 'dps') {
    const r = meanCI(xs);
    return { mean: r.mean, lo: r.lo, hi: r.hi, n: r.n };
  }
  const w = wilson(xs.reduce((a, b) => a + b, 0), xs.length);
  return { mean: w.p, lo: w.lo, hi: w.hi, n: w.n };
}

/**
 * One metric: the after-minus-before contrast, resolved by the sequential comparator. `getBefore(n)` and
 * `getAfter(n)` return the first n per-fight outcomes (same fight index, same random draws on both sides).
 * `alpha` is already divided by the metric family (see applyFamily).
 *
 * @param {'dps'|'survival'|'pvp'} kind
 * @param {{n0: number, maxN: number, alpha?: number, precision?: string, seed?: number}} o
 * @returns {Promise<{before: Object, after: Object, delta: Object}>}  `delta.verdict` is
 *   'better' | 'worse' | 'equivalent' | 'unresolved'; `delta.zone` the indifference zone in the metric's units
 */
export async function contrastMetric(kind, getBefore, getAfter, { n0, maxN, alpha = FAMILY_ALPHA, precision = 'standard', seed = 1 }) {
  const prec = precisionOf(precision);
  const spec = METRIC[kind];
  const cap = Math.max(1, Math.floor(maxN));
  const first = Math.min(Math.max(1, Math.floor(n0)), cap);
  let lastBefore = [];
  let lastAfter = [];
  const r = await compareAsync(
    async (n) => (lastAfter = await getAfter(n)),
    async (n) => (lastBefore = await getBefore(n)),
    { ...spec, delta: kind === 'dps' ? prec.rel : prec.prob, alpha, n0: first, maxN: cap, seed },
  );
  return {
    before: briefOf(kind, lastBefore.slice(0, r.n)),
    after: briefOf(kind, lastAfter.slice(0, r.n)),
    delta: {
      delta: r.delta, lo: r.lo, hi: r.hi, n: r.n, significant: r.significant, verdict: r.verdict,
      pct: r.pct, zone: r.zone, p: r.p, sd: r.sd, nNeeded: r.nNeeded, method: r.method,
      alphaAdj: r.alphaAdj, looks: r.looks, nLooks: lookSchedule(first, cap).length, maxN: cap, seed,
    },
  };
}

const contrastsOf = (res) => [res?.sim, res?.survival, ...(res?.pvp ?? [])].filter((m) => m?.delta);

/**
 * Holm step-down over one preset's metrics (the family). Each p-value is first multiplied by the number of
 * looks its comparator spent (Bonferroni over looks). Adds `delta.pHolm` and `delta.holmReject` in place.
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
// metrics (pure over engine/metrics.js; runs in the worker)

const ABORTED = Symbol('aborted');

/**
 * Run the requested metrics for every item. Before and after use the same seed, so fight i sees the
 * same random draws on both sides (common random numbers). Each metric is a sequential comparison: it
 * looks at n0, 2 n0, 4 n0 ... fights and stops when the contrast is better, worse or equivalent
 * (within the precision zone), or at `maxN`, where it is reported `unresolved`. A preset's metrics share
 * one family-wise level, split evenly (`alpha / metrics`) and re-checked with Holm (applyFamily).
 *
 * @param {Array<{presetId: string, before: Object, after: Object, baseKey?: string}>} items  Fighters, plain data;
 *   `baseKey` marks items whose `before` is identical so its samples are drawn once and extended on demand
 * @param {{
 *   sim?: boolean, seconds?: number, nSim?: number,
 *   enemy?: {mobs: Object[], oblivion?: boolean}|null, survivalSeconds?: number, nSurvival?: number,
 *   opponents?: Array<{id: string, name?: string, fighter: Object}>, nPvp?: number, seed?: number,
 *   precision?: 'quick'|'standard'|'thorough', maxN?: number,
 * }} o  `nSim` / `nSurvival` / `nPvp` are the first look of each comparison, not its size
 * @param {{signal?: AbortSignal, onProgress?: Function, sampleRange?: Function}} [ctx]  progress is {done, total} in
 *   whole metrics. `sampleRange(metric, fighter, from, to, {signal})` (tasks/dropCheck.js, over a worker pool) draws
 *   fights from..to-1 of 'sim' | 'survival' | 'pvp:<id>' as the engine metric would, and promises a chunk
 *   `{main: [samples], aborted}`; with it a side's samples are extended instead of re-drawn from 0.
 * @returns {Promise<{results: Array<Object>, aborted: boolean}>}  cancelling returns what finished
 */
export async function runSwapMetrics(items, o = {}, { signal, onProgress, sampleRange } = {}) {
  const {
    sim = true, seconds = 60, nSim = 32, enemy = null, survivalSeconds = 60, nSurvival = 200,
    opponents = [], nPvp = 64, seed = 1, precision = 'standard',
  } = o;
  const maxN = o.maxN ?? precisionOf(precision).maxN;
  const perItem = (sim ? 1 : 0) + (enemy ? 1 : 0) + opponents.length;
  const total = items.length * perItem;
  const alpha = FAMILY_ALPHA / Math.max(1, perItem);
  let done = 0;
  const step = () => onProgress?.({ done: ++done, total });
  const common = { seed, signal, keepSamples: true, cache: false };
  const results = [];
  let aborted = false;

  // Samples per side and metric, extended on demand (a longer run is a prefix-stable superset of a shorter
  // one, so reusing a prefix changes no number). Items that share a `baseKey` have the same "before"
  // Fighter (a batch of drops against one preset): its samples are drawn once.
  const store = new Map();
  const sampler = (key, run) => async (n) => {
    const have = store.get(key);
    if (have && have.length >= n) return have.length === n ? have : have.slice(0, n);
    const r = await run(n);
    if (r.aborted || signal?.aborted) throw ABORTED;
    store.set(key, r.samples);
    return r.samples;
  };
  const ranged = (key, metric, f) => async (n) => {
    let have = store.get(key) ?? [];
    if (have.length < n) {
      const c = await sampleRange(metric, f, have.length, n, { signal });
      have = have.concat(c.main[0] ?? []); // a new array: sets already handed out never change
      store.set(key, have);
      if (c.aborted || signal?.aborted) throw ABORTED;
    }
    return have.length === n ? have : have.slice(0, n);
  };
  const pair = (item, idx, metric, runFor) => {
    const keys = [item.baseKey == null ? `${idx}|before|${metric}` : `${item.baseKey}|${metric}`, `${idx}|after|${metric}`];
    const sides = [item.before, item.after];
    return sampleRange
      ? keys.map((k, j) => ranged(k, metric, sides[j]))
      : keys.map((k, j) => sampler(k, runFor(sides[j])));
  };
  const contrast = (kind, [getBefore, getAfter], n0) => contrastMetric(kind, getBefore, getAfter, { n0, maxN, alpha, precision, seed });

  try {
    for (const [idx, item] of items.entries()) {
      const r = { presetId: item.presetId };
      results.push(r);
      if (sim) {
        r.sim = await contrast('dps', pair(item, idx, 'sim', (f) => (n) => dpsVsDummyAsync(f, { ...common, seconds, n })), nSim);
        step();
      }
      if (enemy) {
        const optsFor = (f) => (enemy.oblivion ? { oblivion: { power: f.stats?.totalOblivionPower ?? 0 } } : {});
        const runFor = (f) => (n) => survivalAsync(f, enemy.mobs, { ...common, seconds: survivalSeconds, n, opts: optsFor(f) });
        r.survival = await contrast('survival', pair(item, idx, 'survival', runFor), nSurvival);
        step();
      }
      if (opponents.length) {
        r.pvp = [];
        for (const opp of opponents) {
          const runFor = (f) => (n) => pvpWinRateAsync(f, opp.fighter, { ...common, n });
          const c = await contrast('pvp', pair(item, idx, `pvp:${opp.id}`, runFor), nPvp);
          r.pvp.push({ opponentId: opp.id, name: opp.name ?? opp.id, ...c });
          step();
        }
      }
      applyFamily(r);
    }
  } catch (e) {
    if (e !== ABORTED) throw e;
    aborted = true;
  }
  return { results, aborted };
}

// ---------------------------------------------------------------------------------------------
// verdict

/** The closed-form DPS change smaller than this (percent) is a sidegrade. It is an estimate, never a result. */
export const NEUTRAL_PCT = 0.25;

/** Stat keys the training-dummy DPS run can move (it has no defence, no damage dealt to the player). */
export const DPS_STAT_KEYS = new Set([
  'totalAttack', 'totalAttackPercent', 'totalAttackSpeed', 'totalCritChance', 'totalCritDamage', 'totalDoubleHit',
  'totalSpellDamage', 'totalSpellCritChance', 'totalMinionAttack', 'totalMinionAttackSpeed', 'totalMinionCritChance',
  'totalFlameConduit', 'totalEarthenConduit', 'totalDarkConduit',
]);

const COVERAGE_LABEL = { dps: 'DPS', survival: 'survival', pvp: 'PVP win rate' };

/**
 * 'up' | 'down' | 'flat' | 'unknown' for one contrast. An effect inside the indifference zone is flat even
 * when its interval excludes zero; an unresolved contrast is unknown unless Holm rejects it.
 */
export function metricSignal(d) {
  if (!d || !d.verdict) return 'unknown';
  const small = Number.isFinite(d.zone) && Math.abs(d.delta) < d.zone;
  if (d.verdict === 'equivalent') return 'flat';
  if (d.verdict === 'better' || d.verdict === 'worse') {
    if (small) return 'flat';
    return d.verdict === 'better' ? 'up' : 'down';
  }
  if (d.holmReject && !small && d.delta !== 0) return d.delta > 0 ? 'up' : 'down';
  return 'unknown';
}

/** The closed-form signal: the deterministic auto-attack change against NEUTRAL_PCT. */
function closedSignal(row) {
  const pct = row.closed.pct;
  if (pct == null || Math.abs(pct) < NEUTRAL_PCT) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

/**
 * Verdict for one preset.
 *  'upgrade'      something improves, nothing worsens, nothing is unresolved
 *  'downgrade'    the reverse
 *  'mixed'        something improves and something worsens
 *  'sidegrade'    every measured metric is equivalent within the precision zone
 *  'inconclusive' a metric was still unresolved at its maxN ("too close to call") and nothing contradicts
 * Without a simulation the closed-form estimate decides (`basis: 'closed'`, `estimate: true`).
 *
 * `coverage` names the metrics measured and `notJudged` the stat keys this item changes that no measured
 * metric can see (HP% with survival and PVP off), so "Sidegrade" is never read as "defence is fine".
 *
 * @param {{closed: {pct: number|null}, rawDelta?: Object<string, number>}} row  a prepareSwap row
 * @param {Object|null} [simResult]  its runSwapMetrics result, when it has run
 * @returns {{
 *   verdict: 'upgrade'|'sidegrade'|'downgrade'|'mixed'|'inconclusive', basis: 'sim'|'closed', estimate: boolean,
 *   signals: Object<string, string>, unresolved: string[], coverage: string[], coverageLabel: string, notJudged: string[],
 * }}
 */
export function verdictFor(row, simResult = null) {
  const signals = {};
  const coverage = [];
  if (simResult?.sim) { signals.dps = metricSignal(simResult.sim.delta); coverage.push('dps'); }
  if (simResult?.survival) { signals.survival = metricSignal(simResult.survival.delta); coverage.push('survival'); }
  if (simResult?.pvp?.length) {
    simResult.pvp.forEach((p, i) => { signals[`pvp${i}`] = metricSignal(p.delta); });
    coverage.push('pvp');
  }
  const basis = Object.keys(signals).length ? 'sim' : 'closed';
  if (basis === 'closed') signals.dps = closedSignal(row);
  const all = Object.values(signals);
  const up = all.includes('up');
  const down = all.includes('down');
  const unresolved = Object.keys(signals).filter((k) => signals[k] === 'unknown');
  const verdict = up && down ? 'mixed' : unresolved.length ? 'inconclusive' : up ? 'upgrade' : down ? 'downgrade' : 'sidegrade';
  const everything = coverage.includes('survival') || coverage.includes('pvp');
  const notJudged = everything ? [] : Object.keys(row?.rawDelta ?? {}).filter((k) => !DPS_STAT_KEYS.has(k));
  const coverageLabel = !coverage.length ? 'Closed-form auto-attack estimate'
    : everything ? coverage.map((c) => COVERAGE_LABEL[c]).join(', ')
      : 'DPS only: defence not measured';
  return { verdict, basis, estimate: basis === 'closed', signals, unresolved, coverage, coverageLabel, notJudged };
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
