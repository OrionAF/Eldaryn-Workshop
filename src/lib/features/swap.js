// features/swap.js (F1): gear swap / Drop Check. rebuild-plan §5 row 1, §4 "Sheet-anchored deltas".
//
// Two halves:
//   prepareSwap()      main thread, synchronous: per preset, the stats before and after the swap, the
//                      before/after Fighters and the closed-form auto-attack DPS (combat-pve.md §7).
//   runSwapMetrics()   async, pure over engine/metrics.js (the worker task 'dropCheck' calls it):
//                      sim DPS, survival and PVP win rate, each as a common-random-number paired delta.
//   verdictFor()       upgrade / sidegrade / downgrade / mixed from those deltas and their intervals.
//
// How the "after" stats are made. With a sheet (tier 2) the in-game numbers are authoritative, so the
// item difference is added to them in raw space (engine/pipeline/anchoredDelta.js). Without a sheet the
// pipeline is exact, so the character is cloned with the item swapped and recomputed (tier 1).
import { buildFighter } from '../build/fighter.js';
import { computePresetStats } from '../build/stats.js';
import { equipSetKey } from '../build/presetInputs.js';
import { anchoredDelta } from '../engine/pipeline/anchoredDelta.js';
import { sheetKeyMeta, toDisplay } from '../engine/pipeline/sheet.js';
import {
  dpsVsDummyAsync, survivalAsync, pvpWinRateAsync, pairedDelta,
} from '../engine/metrics.js';
import { statByEnum } from '../game/stats.js';
import { PVE_HARD_CHAPTER_OFFSET } from '../game/combatPve.js';
import { chapterMobs, dungeonMobs, oblivionFloorMob } from '../engine/pve/enemies.js';

// ---------------------------------------------------------------------------------------------
// item -> raw delta

/** Secondary types the pipeline sums (totals.js SECONDARY_ACC) that have no stats.json computedKey. */
const EXTRA_KEYS = { FEAR_CHANCE: 'fearChance' };
/** Gear PVP ratings are ignored by the client's equipment switch (the client totals), so they never move a total. */
const INERT = new Set(['PVP_ATTACK', 'PVP_DEFENSE']);
const CONDUIT_KEY = { FLAME: 'totalFlameConduit', EARTHEN: 'totalEarthenConduit', DARK: 'totalDarkConduit' };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

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
 * Everything the screen shows before any simulation, per preset.
 *
 * @param {Object} character  a normalised v2 Character
 * @param {{slot: string, item: Object, realm?: 'base'|'oblivion', presetIds?: string[]|null}} drop
 *   `presetIds` null or omitted means every preset
 * @returns {Array<{
 *   presetId: string, name: string, setKey: 'set1'|'set2'|'oblivion', current: Object|null,
 *   source: 'sheet'|'computed', method: 'anchored'|'recomputed', rawDelta: Object<string, number>,
 *   before: Object, after: Object, statsBefore: Object, statsAfter: Object,
 *   closed: {before: number, after: number, delta: number, pct: number|null},
 * }>}  `before` / `after` are Fighters (plain data)
 */
export function prepareSwap(character, { slot, item, realm = 'base', presetIds = null }) {
  const ids = presetIds ?? character.presets.map((p) => p.id);
  const out = [];
  for (const presetId of ids) {
    const preset = character.presets.find((p) => p.id === presetId);
    if (!preset) continue;
    const setKey = equipSetKey(preset, realm);
    const current = character.equipment?.[setKey]?.items?.[slot] ?? null;
    const rawDelta = itemRawDelta(current, item);
    const res = computePresetStats(character, presetId, { realm });
    const before = buildFighter(character, presetId, { realm });
    let after;
    let method;
    if (res.sheet) {
      method = 'anchored';
      after = { ...before, stats: anchoredDelta(before.stats, rawDelta, res.ctx) };
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
  if (spec.kind === 'oblivion') {
    const mob = oblivionFloorMob(spec.floor);
    return mob ? { label: `Oblivion floor ${spec.floor}`, mobs: [mob], oblivion: true } : null;
  }
  return null;
}

/**
 * A saved opponent (rebuild-plan §3 `opponents[]`) as a Fighter for pvpWinRate. Its sheet is the stat
 * block. Opponents without a sheet cannot fight and give null.
 */
export function opponentFighter(o) {
  const stats = o?.sheet?.values ?? null;
  if (!stats || typeof stats !== 'object') return null;
  return {
    stats,
    class: o.class,
    spec: o.spec ?? null,
    level: o.level,
    sigils: o.sigils ?? [],
    utility: o.utility ?? null,
    ancient: o.ancient ?? null,
    conditions: o.conditions ?? {},
    glyphMods: o.majorGlyphs ?? [],
    altarTier: o.altarTier ?? 1,
  };
}

// ---------------------------------------------------------------------------------------------
// metrics (pure over engine/metrics.js; runs in the worker)

const brief = (r) => ({ mean: r.mean ?? r.p, lo: r.lo, hi: r.hi, n: r.n });

/** Paired comparison of two runs that used the same seed and kept their samples. */
function compare(a, b) {
  const d = pairedDelta(a.samples, b.samples);
  return { before: brief(a), after: brief(b), delta: { delta: d.delta, lo: d.lo, hi: d.hi, n: d.n, significant: d.significant } };
}

/**
 * Run the requested metrics for every item. Before and after use the same seed, so fight i sees the
 * same random draws on both sides (common random numbers) and the paired delta cancels most noise.
 *
 * @param {Array<{presetId: string, before: Object, after: Object, baseKey?: string}>} items  Fighters, plain data;
 *   `baseKey` marks items whose `before` is identical so it is simulated once
 * @param {{
 *   sim?: boolean, seconds?: number, nSim?: number,
 *   enemy?: {mobs: Object[], oblivion?: boolean}|null, survivalSeconds?: number, nSurvival?: number,
 *   opponents?: Array<{id: string, name?: string, fighter: Object}>, nPvp?: number, seed?: number,
 * }} o
 * @param {{signal?: AbortSignal, onProgress?: Function}} [ctx]  progress is {done, total} in whole metrics
 * @returns {Promise<{results: Array<Object>, aborted: boolean}>}  cancelling returns what finished
 */
export async function runSwapMetrics(items, o = {}, { signal, onProgress } = {}) {
  const {
    sim = true, seconds = 60, nSim = 32, enemy = null, survivalSeconds = 60, nSurvival = 200,
    opponents = [], nPvp = 64, seed = 1,
  } = o;
  const perItem = (sim ? 1 : 0) + (enemy ? 1 : 0) + opponents.length;
  const total = items.length * perItem;
  let done = 0;
  const step = () => onProgress?.({ done: ++done, total });
  const common = { seed, signal, keepSamples: true };
  const results = [];
  let aborted = false;
  // Items that share a `baseKey` have the same "before" Fighter (a batch of drops against one preset):
  // its runs are done once and reused. Same seed, so the reuse changes no number.
  const baselines = new Map();
  const baseline = async (item, metric, run) => {
    if (item.baseKey == null) return run();
    const k = `${item.baseKey}|${metric}`;
    if (!baselines.has(k)) baselines.set(k, await run());
    return baselines.get(k);
  };

  outer: for (const item of items) {
    const r = { presetId: item.presetId };
    results.push(r);
    if (sim) {
      const a = await baseline(item, 'sim', () => dpsVsDummyAsync(item.before, { ...common, seconds, n: nSim }));
      const b = await dpsVsDummyAsync(item.after, { ...common, seconds, n: nSim });
      if (a.aborted || b.aborted || signal?.aborted) { aborted = true; break outer; }
      r.sim = compare(a, b);
      step();
    }
    if (enemy) {
      const optsFor = (f) => (enemy.oblivion ? { oblivion: { power: f.stats?.totalOblivionPower ?? 0 } } : {});
      const run = (f) => survivalAsync(f, enemy.mobs, { ...common, seconds: survivalSeconds, n: nSurvival, opts: optsFor(f) });
      const a = await baseline(item, 'survival', () => run(item.before));
      const b = await run(item.after);
      if (a.aborted || b.aborted || signal?.aborted) { aborted = true; break outer; }
      r.survival = compare(a, b);
      step();
    }
    if (opponents.length) {
      r.pvp = [];
      for (const opp of opponents) {
        const a = await baseline(item, `pvp:${opp.id}`, () => pvpWinRateAsync(item.before, opp.fighter, { ...common, n: nPvp }));
        const b = await pvpWinRateAsync(item.after, opp.fighter, { ...common, n: nPvp });
        if (a.aborted || b.aborted || signal?.aborted) { aborted = true; break outer; }
        r.pvp.push({ opponentId: opp.id, name: opp.name ?? opp.id, ...compare(a, b) });
        step();
      }
    }
  }
  return { results, aborted };
}

// ---------------------------------------------------------------------------------------------
// verdict

/** A DPS change smaller than this (percent) is a sidegrade even when the interval excludes zero. */
export const NEUTRAL_PCT = 0.25;
/** The same floor for survival / win-rate changes, in probability (0.005 = half a percentage point). */
export const NEUTRAL_PROB = 0.005;

/** 'up' | 'down' | 'flat' for a paired delta, from its interval and a minimum size. */
export function signalOf(delta, minSize = 0) {
  if (!delta || delta.delta == null) return 'flat';
  if (Math.abs(delta.delta) < minSize) return 'flat';
  if (delta.lo > 0) return 'up';
  if (delta.hi < 0) return 'down';
  return 'flat';
}

/**
 * The DPS signal. With a sim result it is the paired CI relative to the starting DPS; without one it is
 * the closed-form change against NEUTRAL_PCT (no interval: the closed form is deterministic).
 */
export function dpsSignal(row, simResult) {
  if (simResult?.sim) {
    const base = simResult.sim.before.mean;
    return signalOf(simResult.sim.delta, base > 0 ? (base * NEUTRAL_PCT) / 100 : 0);
  }
  const pct = row.closed.pct;
  if (pct == null || Math.abs(pct) < NEUTRAL_PCT) return 'flat';
  return pct > 0 ? 'up' : 'down';
}

/**
 * Verdict for one preset: 'upgrade' (something improves, nothing worsens), 'downgrade' (the reverse),
 * 'mixed' (both), 'sidegrade' (nothing moves beyond noise).
 * @param {{closed: {pct: number|null}}} row  a prepareSwap row
 * @param {Object|null} [simResult]  its runSwapMetrics result, when it has run
 * @returns {{verdict: 'upgrade'|'sidegrade'|'downgrade'|'mixed', basis: 'sim'|'closed', signals: Object}}
 */
export function verdictFor(row, simResult = null) {
  const signals = { dps: dpsSignal(row, simResult) };
  if (simResult?.survival) signals.survival = signalOf(simResult.survival.delta, NEUTRAL_PROB);
  (simResult?.pvp ?? []).forEach((p, i) => { signals[`pvp${i}`] = signalOf(p.delta, NEUTRAL_PROB); });
  const all = Object.values(signals);
  const up = all.includes('up');
  const down = all.includes('down');
  const verdict = up && down ? 'mixed' : up ? 'upgrade' : down ? 'downgrade' : 'sidegrade';
  return { verdict, basis: simResult?.sim ? 'sim' : 'closed', signals };
}

/** Aggregate verdict of a set of preset verdicts (an Apply button writes to the whole set). */
export function aggregateVerdict(verdicts) {
  const up = verdicts.some((v) => v === 'upgrade' || v === 'mixed');
  const down = verdicts.some((v) => v === 'downgrade' || v === 'mixed');
  if (!verdicts.length) return 'empty';
  if (verdicts.includes('mixed') || (up && down)) return 'mixed';
  return up ? 'upgrade' : down ? 'downgrade' : 'sidegrade';
}
