// search/objectives.js (A3): optimiser targets and objectives. The contract (per-fight outcomes, the
// statistic, its interval and its paired contrast per objective, windows, compatibility) is
// docs/Reference/simulation.md §Objectives; this file implements it.
//
// A TARGET is what the build fights (plain JSON, so it crosses the worker boundary and is saved in a run):
//   {kind: 'dummy', seconds?: 60}                     dps only
//   {kind: 'chapter', chapter: 1..22, level: 1..10}   chapters above 11 are the hard ones (enemies.js)
//   {kind: 'dungeon', id: 'dungeon_N'|'dungeon_N_hard', step: 1..8}   classic dungeon step, 3 mobs
//   {kind: 'raid', id: 'raid_1', step: 1..8}          village raid step, 5 mobs
//   {kind: 'oblivion', floor: n, applyOutputCut?: false}   forces the Oblivion realm; power comes from the fighter
//   {kind: 'worldBoss', affinity?: 'NONE'|'FORTIFIED'|'ENRAGED'}
//   {kind: 'custom', mob: MobSpec, seconds?: 60}      a user-entered mob
//   {kind: 'pvp', opponentIds: string[], seats}       saved opponents (pvpObjective.js); needs `{character}`
// An OBJECTIVE is what "better" means: {kind: 'dps'|'ttk-median'|'ttk-p90'|'survival', seconds?}.
import { fightRng } from '../engine/rng.js';
import {
  stableStringify, meanInterval, wilsonInterval, quantileInterval, censoredQuantile, pairedT, pairedProportion,
  pairedQuantileDiff,
} from '../engine/metrics.js';
import { preparePveFighter, simulatePve, trainingDummy, PVE_MODES } from '../engine/pve/fight.js';
import { chapterMobs, dungeonMobs, raidMobs, oblivionFloorMob, worldBossMob } from '../engine/pve/enemies.js';
import { raidById } from '../game/fortress.js';
import { CLASSIC_DUNGEONS } from '../game/pveContent.js';
import { WORLD_BOSS_AFFINITIES } from '../game/worldBoss.js';
import { formatFlat } from '../format.js';
import { setOf } from './sampler.js';
import { resolvePvpTarget, makePvpObjective, PVP_TARGET_KIND, PVP_OBJECTIVE_KIND } from './pvpObjective.js';

// The PVE kinds. The PVP pair is kept apart: it is only valid together and needs the character's opponents.
export const OBJECTIVE_KINDS = ['dps', 'ttk-median', 'ttk-p90', 'survival'];
export const TARGET_KINDS = ['dummy', 'chapter', 'dungeon', 'raid', 'oblivion', 'worldBoss', 'custom'];

const COMPAT = {
  dummy: ['dps'],
  chapter: ['ttk-median', 'ttk-p90', 'survival'],
  dungeon: ['ttk-median', 'ttk-p90', 'survival'],
  raid: ['ttk-median', 'ttk-p90', 'survival'],
  oblivion: ['ttk-median', 'ttk-p90', 'survival'],
  worldBoss: ['dps', 'survival'],
  custom: ['dps', 'ttk-median', 'ttk-p90', 'survival'],
  [PVP_TARGET_KIND]: [PVP_OBJECTIVE_KIND],
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const posInt = (v) => Number.isInteger(v) && v >= 1;
const asArray = (x) => (Array.isArray(x) ? x : [x]);

/**
 * Whether anything in a mob spec can damage the player: its own swings, a World Boss hit-back, or
 * an Oblivion instability pulse. Survival is meaningless (always 1) against a target that cannot.
 */
export function enemyDealsDamage(enemy) {
  return asArray(enemy).some((m) => (m.attack > 0 && m.attackSpeed > 0)
    || (m.affinity?.hitDamagePctOfMaxHp > 0 && m.affinity?.baseAttackSpeed > 0)
    || Math.round(m.instability ?? 0) > 0);
}

/**
 * Objective kinds that can score a target. With only a kind the list is the kind's; with the raw
 * target too, survival is dropped for a target that deals no damage (a World Boss NONE / FORTIFIED,
 * a custom mob with no attack).
 */
export function objectiveKindsFor(targetKind, rawTarget = null) {
  const kinds = [...(COMPAT[targetKind] ?? [])];
  if (!rawTarget || !kinds.includes('survival')) return kinds;
  try {
    const t = resolveTarget(rawTarget);
    return enemyDealsDamage(t.enemy) ? kinds : kinds.filter((k) => k !== 'survival');
  } catch {
    return kinds;
  }
}

const dungeonLabel = (id) => {
  const hard = id.endsWith('_hard');
  const base = hard ? id.slice(0, -'_hard'.length) : id;
  const name = CLASSIC_DUNGEONS.find((d) => d.id === base)?.name ?? base;
  return `${hard ? 'Hard dungeon' : 'Dungeon'} ${name}`;
};

/** The PVE mode's labelled assumptions (engine/pve/fight.js PVE_MODES), in the result's shape. */
function assumptionsOf(mode, { applyOutputCut } = {}) {
  return PVE_MODES[mode].assumptions.map((a) => ({
    id: a.key, label: a.text, ...(a.key === 'oblivion-output-cut' ? { value: applyOutputCut ? 'on' : 'off' } : {}),
  }));
}
const SERVER_RUN = new Set(['server-fight', 'world-boss-model']);

/**
 * @returns {{kind: string, spec: Object, label: string, key: string, realm: 'base'|'oblivion'|null,
 *   enemy: Object|Object[], maxMs: number|undefined, seconds: number, opts: Object, mode: string,
 *   fidelity: 'client'|'server-model', assumptions: Array<{id: string, label: string, value?: string}>}}
 *   `opts` is passed to simulatePve; `maxMs`/`seconds` are the target's own window when it has one
 *   (dummy, custom, World Boss), else undefined/0 and every mob keeps its own cap.
 */
export function resolveTarget(raw = { kind: 'dummy' }, { character } = {}) {
  const kind = raw?.kind;
  if (kind === PVP_TARGET_KIND) return resolvePvpTarget(raw, character);
  if (!TARGET_KINDS.includes(kind)) throw new Error(`unknown target kind '${kind}'`);
  const t = { kind, spec: null, label: '', realm: null, enemy: null, maxMs: undefined, seconds: 0, opts: {} };
  let cut = false;
  if (kind === 'dummy') {
    t.seconds = isNum(raw.seconds) && raw.seconds > 0 ? raw.seconds : 60;
    t.maxMs = t.seconds * 1000;
    t.spec = { kind, seconds: t.seconds };
    t.enemy = trainingDummy();
    t.label = `Training dummy, ${t.seconds} s`;
  } else if (kind === 'chapter') {
    const mobs = posInt(raw.chapter) && posInt(raw.level) ? chapterMobs(raw.chapter, raw.level) : null;
    if (!mobs) throw new Error(`chapter ${raw.chapter} level ${raw.level} does not exist`);
    t.spec = { kind, chapter: raw.chapter, level: raw.level };
    t.enemy = mobs;
    t.label = `${raw.chapter > 11 ? 'Hard chapter' : 'Chapter'} ${raw.chapter}, level ${raw.level}`;
  } else if (kind === 'dungeon') {
    const mobs = posInt(raw.step) && typeof raw.id === 'string' ? dungeonMobs(raw.id, raw.step) : null;
    if (!mobs) throw new Error(`dungeon '${raw.id}' step ${raw.step} does not exist`);
    t.spec = { kind, id: raw.id, step: raw.step };
    t.enemy = mobs;
    t.label = `${dungeonLabel(raw.id)}, step ${raw.step}`;
  } else if (kind === 'raid') {
    const mobs = posInt(raw.step) ? raidMobs(raw.id, raw.step) : null;
    if (!mobs) throw new Error(`village raid '${raw.id}' step ${raw.step} does not exist`);
    t.spec = { kind, id: raw.id, step: raw.step };
    t.enemy = mobs;
    t.label = `Village raid ${raidById(raw.id).name}, step ${raw.step}`;
  } else if (kind === 'oblivion') {
    const mob = posInt(raw.floor) ? oblivionFloorMob(raw.floor) : null;
    if (!mob) throw new Error(`Oblivion floor ${raw.floor} does not exist`);
    cut = raw.applyOutputCut === true; // decision Q2: the instability output cut is off unless asked for
    t.spec = { kind, floor: raw.floor, ...(cut ? { applyOutputCut: true } : {}) };
    t.enemy = mob;
    t.realm = 'oblivion';
    t.label = `Oblivion floor ${raw.floor}${cut ? ', output cut on' : ''}`;
  } else if (kind === 'worldBoss') {
    const affinity = raw.affinity ?? 'NONE';
    if (!WORLD_BOSS_AFFINITIES[affinity]) throw new Error(`unknown World Boss affinity '${affinity}'`);
    const mob = worldBossMob(affinity);
    t.spec = { kind, affinity };
    t.enemy = mob;
    t.maxMs = mob.fightDurationMs;
    t.seconds = mob.fightDurationMs / 1000;
    t.label = `World Boss (${affinity.toLowerCase()})`;
  } else {
    const m = raw.mob;
    if (!m || !isNum(m.hp) || m.hp <= 0 || !isNum(m.attack) || m.attack < 0 || !isNum(m.attackSpeed) || m.attackSpeed < 0) {
      throw new Error('custom target needs mob {hp > 0, attack >= 0, attackSpeed >= 0}');
    }
    t.seconds = isNum(raw.seconds) && raw.seconds > 0 ? raw.seconds : 60;
    t.spec = { kind, mob: { ...m }, seconds: t.seconds };
    t.enemy = { id: 'custom', ...m };
    t.maxMs = t.seconds * 1000;
    t.label = `Custom mob (${formatFlat(m.hp)} HP)`;
  }
  t.mode = kind === 'chapter' ? 'campaign' : kind;
  t.opts = { mode: t.mode, ...(cut ? { applyOutputCut: true } : {}) };
  t.assumptions = assumptionsOf(t.mode, { applyOutputCut: cut });
  t.fidelity = t.assumptions.some((a) => SERVER_RUN.has(a.id)) ? 'server-model' : 'client';
  t.key = stableStringify(t.spec);
  return t;
}

// ---------------------------------------------------------------------------------------------
// Ordering heuristics (plan §A.6 I7): they order arms inside a race and fill labelled ESTIMATE
// cells; they never prune, rank or break ties. The expected-damage form is combat-pve.md §7.

/** Weight of spell damage and minion attack in the heuristic. ASSUMED (ordering only, not a game fact). */
export const SCREEN_SPELL_WEIGHT = 0.35;

/**
 * Expected auto-attack damage per second against a defender (combat-pve.md §5, §7), times a crude
 * spell and minion factor. The defender's `damageReduction`, `blockChance` and `missChance` (percent)
 * negate; the attacker's own `totalPenetration` pierces a negated swing only when the defender's Miss
 * is exactly 0 (§5.4).
 */
export function closedFormDps(stats, enemy = {}) {
  const c = Math.min(1, Math.max(0, (stats.totalCritChance ?? 0) / 100));
  const m = stats.totalCritDamage ?? 1;
  const h = Math.max(0, (stats.totalDoubleHit ?? 0) / 100);
  const R = 1 - (enemy.damageReduction ?? 0) / 100;
  const miss = enemy.missChance ?? 0;
  const b = Math.min(1, Math.max(0, ((enemy.blockChance ?? 0) + miss) / 100));
  const p = miss === 0 ? Math.max(0, (stats.totalPenetration ?? 0) / 100) : 0;
  const atk = stats.totalAttack ?? 0;
  const perSwing = (1 - b) * R * atk * (1 + c * (m - 1) + h) + b * p * R * atk * (1 + c * (m - 1));
  const speed = stats.totalAttackSpeed > 0 ? stats.totalAttackSpeed : 0;
  const swings = speed > 0 ? 1000 / Math.round(1000 / speed) : 0;
  const extra = 1 + (((stats.totalSpellDamage ?? 0) + (stats.totalMinionAttack ?? 0)) / 100) * SCREEN_SPELL_WEIGHT;
  return perSwing * swings * extra;
}

/** Effective HP against ordinary hits: Damage Reduction, and Block plus Miss. Ordering only. */
export function ehpProxy(stats) {
  const dr = Math.min(0.9, Math.max(0, (stats.totalDamageReduction ?? 0) / 100));
  const avoid = Math.min(0.95, Math.max(0, ((stats.totalBlockChance ?? 0) + (stats.totalMissChance ?? 0)) / 100));
  return (stats.totalHp ?? 0) / (1 - dr) / (1 - avoid);
}

// ---------------------------------------------------------------------------------------------
// Run inputs

/**
 * The residual the optimiser carries onto candidates (rebuild-plan §4): only from a sheet confirmed
 * for this build (`sheetStatus` 'fresh', build/stats.js). Any other stored sheet is not carried and
 * the run says so.
 * @param {{sheetStatus: string, residual: Object}} presetStats  computePresetStats' result
 * @returns {{residual: Object, warnings: Array<{code: string, message: string, severity: 'info'|'warn'}>}}
 */
export function residualFor(presetStats) {
  const status = presetStats?.sheetStatus ?? 'none';
  if (status === 'fresh') {
    const residual = presetStats.residual ?? {};
    return {
      residual,
      warnings: Object.keys(residual).length
        ? [{ code: 'residual-applied', severity: 'info', message: "The confirmed stat sheet's gap to the computed stats is carried onto every candidate." }]
        : [],
    };
  }
  if (status === 'none') return { residual: {}, warnings: [] };
  const why = status === 'stale' ? 'no longer matches this build' : 'is not confirmed for this build';
  return {
    residual: {},
    warnings: [{
      code: status === 'stale' ? 'sheet-stale' : 'sheet-unverified', severity: 'warn',
      message: `The stat sheet ${why}, so candidates are measured on computed stats only.`,
    }],
  };
}

// ---------------------------------------------------------------------------------------------
// Per-fight outcomes

/** The mob with effectively unlimited HP (a dummy's 1e15), defences and attack untouched. */
const unkillable = (mob) => (Array.isArray(mob) ? mob.map(unkillable) : { ...mob, hp: Math.max(mob.hp, trainingDummy().hp) });

function optsFor(target, fighter) {
  return target.kind === 'oblivion'
    ? { ...target.opts, oblivion: { power: fighter.stats?.totalOblivionPower ?? 0 } }
    : target.opts;
}

/**
 * A synchronous PVE sampler: fight i (from <= i < to) uses rng fightRng(seed, i), the same lanes for
 * every build (simulation.md §Statistics, sampling unit; §Common random numbers).
 */
function pveSampler(target, { enemy, maxMs }, outcome) {
  return (fighter, { seed, from = 0, to, signal }) => {
    const prepared = preparePveFighter(fighter);
    const opts = optsFor(target, fighter);
    const out = [];
    for (let i = from; i < to; i++) {
      if (signal?.aborted) return { main: [out], side: {}, aborted: true };
      const r = simulatePve({ fighter: prepared, enemy, maxMs, rng: fightRng(seed, i), ...opts });
      out.push(outcome(r));
    }
    return { main: [out], side: {}, aborted: false };
  };
}

const level = (alpha) => 1 - alpha;
const finiteOrNull = (x) => (Number.isFinite(x) ? x : null);
const sumOf = (xs) => xs.reduce((a, b) => a + b, 0);

/** Wilson estimate of 0/1 outcomes. */
function proportionEstimate(xs, alpha) {
  const w = wilsonInterval(sumOf(xs), xs.length, { alpha });
  return { est: w.est, lo: w.lo, hi: w.hi, n: xs.length, level: level(alpha), alphaAdj: alpha, method: 'wilson' };
}

/** `score` of a TTK set (higher is better; picks a race's leader): ∞ ranks below every finite time, by win rate. */
const UNREACHED_MS = 1e12;

// ---------------------------------------------------------------------------------------------
// Objectives

/**
 * @param {{kind: string, seconds?: number}} raw
 * @param {ReturnType<typeof resolveTarget>} target
 */
export function makeObjective(raw = { kind: 'dps' }, target = resolveTarget({ kind: 'dummy' })) {
  const kind = raw?.kind;
  if (kind !== PVP_OBJECTIVE_KIND && !OBJECTIVE_KINDS.includes(kind)) throw new Error(`unknown objective kind '${kind}'`);
  if (!COMPAT[target.kind].includes(kind)) throw new Error(`objective '${kind}' cannot score a '${target.kind}' target`);
  if (kind === PVP_OBJECTIVE_KIND) return withLegacy(makePvpObjective(raw, target, { closedFormDps, ehpProxy }));
  if (kind === 'survival' && !enemyDealsDamage(target.enemy)) {
    throw new Error(`objective 'survival' cannot score '${target.label}': it deals no damage`);
  }
  const enemyView = asArray(target.enemy)[0];
  const screen = kind === 'survival' ? (stats) => ehpProxy(stats) : (stats) => closedFormDps(stats, enemyView);
  const common = { kind, lanes: 1, screen, tier0: screen };

  if (kind === 'dps') {
    const seconds = target.seconds;
    return withLegacy({
      ...common, key: stableStringify({ kind, seconds }), spec: { kind },
      label: 'Damage per second', unit: 'dps', higherIsBetter: true, statistic: 'mean', q: null, deltaKind: 'relative',
      window: seconds,
      // the mob never dies inside the window: a finite pool would cap every strong build at hp / seconds
      sample: pveSampler(target, { enemy: unkillable(target.enemy), maxMs: seconds * 1000 }, (r) => r.damageDealt / seconds),
      estimate(s, { alpha = 0.05 } = {}) {
        const m = meanInterval(s.main[0], { alpha });
        return { value: { est: m.est, lo: m.lo, hi: m.hi, n: s.n, level: level(alpha), alphaAdj: alpha, method: 't' }, aux: {} };
      },
      contrast(x, y, { alpha = 0.05 } = {}) {
        return { ...pairedT(x.main[0], y.main[0], { alpha }), method: 'paired-t', ref: meanInterval(y.main[0]).est };
      },
      score: (s) => meanInterval(s.main[0]).est ?? 0,
    });
  }

  if (kind === 'survival') {
    // window: the objective's own seconds, else the target's own length (its window, else each mob's cap)
    const seconds = isNum(raw.seconds) && raw.seconds > 0 ? raw.seconds : (target.seconds || null);
    const maxMs = seconds ? seconds * 1000 : undefined;
    return withLegacy({
      ...common, key: stableStringify({ kind, seconds }), spec: { kind, ...(isNum(raw.seconds) && raw.seconds > 0 ? { seconds } : {}) },
      label: seconds ? `Survival chance (${seconds} s)` : 'Survival chance (whole fight)', unit: 'p', higherIsBetter: true,
      statistic: 'proportion', q: null, deltaKind: 'absolute', window: seconds,
      sample: pveSampler(target, { enemy: target.enemy, maxMs }, (r) => (r.hpLeft > 0 ? 1 : 0)),
      estimate: (s, { alpha = 0.05 } = {}) => ({ value: proportionEstimate(s.main[0], alpha), aux: {} }),
      contrast(x, y, { alpha = 0.05 } = {}) {
        return { ...pairedProportion(x.main[0], y.main[0], { alpha }), ref: sumOf(y.main[0]) / y.n };
      },
      score: (s) => sumOf(s.main[0]) / Math.max(1, s.n),
    });
  }

  // ttk-median / ttk-p90: time if won, else +∞; θ = the q-quantile over ALL fights (simulation.md §Objectives)
  const q = kind === 'ttk-median' ? 0.5 : 0.9;
  const won = (xs) => xs.map((t) => (Number.isFinite(t) ? 1 : 0));
  return withLegacy({
    ...common, key: stableStringify({ kind }), spec: { kind },
    label: kind === 'ttk-median' ? 'Median time to kill' : 'P90 time to kill', unit: 'ms', higherIsBetter: false,
    statistic: 'censored-quantile', q, deltaKind: 'relative', window: target.seconds || null,
    sample: pveSampler(target, { enemy: target.enemy, maxMs: target.maxMs }, (r) => (r.won ? r.timeMs : Infinity)),
    estimate(s, { alpha = 0.05 } = {}) {
      const xs = s.main[0];
      const qi = quantileInterval(xs, q, { alpha });
      const wins = xs.filter(Number.isFinite);
      return {
        value: { est: qi.est, lo: qi.lo, hi: qi.hi, n: s.n, level: level(alpha), alphaAdj: alpha, method: 'order-stat' },
        aux: { winRate: proportionEstimate(won(xs), alpha), meanMs: wins.length ? sumOf(wins) / wins.length : null },
      };
    },
    contrast(x, y, { alpha = 0.05, seed = 1, B = 2000 } = {}) {
      const tx = censoredQuantile(x.main[0], q);
      const ty = censoredQuantile(y.main[0], q);
      // neither build reaches the quantile: the quantiles cannot differ, so the contrast is on win rate
      if (!Number.isFinite(tx) && !Number.isFinite(ty)) {
        const wx = won(x.main[0]);
        const wy = won(y.main[0]);
        return { ...pairedProportion(wx, wy, { alpha }), basis: 'winRate', higherIsBetter: true, ref: sumOf(wy) / wy.length };
      }
      return { ...pairedQuantileDiff(x.main[0], y.main[0], q, { alpha, seed, B }), basis: 'quantile', ref: ty };
    },
    score(s) {
      const t = censoredQuantile(s.main[0], q);
      return Number.isFinite(t) ? -t : -UNREACHED_MS * (2 - sumOf(won(s.main[0])) / Math.max(1, s.n));
    },
  });
}

// ---------------------------------------------------------------------------------------------
// `measure`: one fixed-n measure of a fighter in the legacy flat shape (value, lo, hi, n, score,
// samples), for one-off measures and tests. The optimiser itself samples through search/sampler.js.

function legacyMeasure(o, s) {
  const { value, aux } = o.estimate(s);
  const extra = o.legacyExtra ? o.legacyExtra(s, aux)
    : aux.winRate ? { winRate: aux.winRate.est, winLo: aux.winRate.lo, winHi: aux.winRate.hi, meanMs: aux.meanMs } : undefined;
  return {
    score: o.score(s), tie: 0, value: finiteOrNull(value.est), lo: finiteOrNull(value.lo), hi: finiteOrNull(value.hi),
    n: value.n, aborted: false, samples: s, ...(extra ? { extra } : {}),
  };
}
const ABORTED = Object.freeze({ score: 0, tie: 0, value: null, lo: null, hi: null, n: 0, aborted: true });

function withLegacy(o) {
  return {
    ...o,
    /** One fixed-n measure (sync for PVE, a promise for PVP). `samples` is the sample set. */
    measure(fighter, { n, seed, signal }) {
      const chunk = o.sample(fighter, { seed, from: 0, to: n, signal });
      const done = (c) => (c.aborted ? { ...ABORTED } : legacyMeasure(o, setOf(c.main, c.side)));
      return typeof chunk?.then === 'function' ? chunk.then(done) : done(chunk);
    },
  };
}
