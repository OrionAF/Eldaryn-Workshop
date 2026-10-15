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
//   {kind: 'fortressBoss', group: 'TOP'|'BOTTOM'|'CORE', stars?: 1..5 (TOP, BOTTOM), aliveDefenders?: 0+, server?: whole number|null (default the character's), shieldPercent?: 0..60, kills?: 0+}
//                                                     the clan-war Fortress boss, 60 s, dps only; the rest sets the credit multipliers
//   {kind: 'custom', mob: MobSpec, seconds?: 60}      a user-entered mob
//   {kind: 'pvp', opponentIds: string[], seats}       saved opponents (pvpObjective.js); needs `{character}`
// An OBJECTIVE is what "better" means: {kind: 'dps'|'survival', seconds?} (survival: custom mobs only) or
// {kind: 'win-chance'} (the highest chance to clear the step before dying or the time cap),
// {kind: 'win-rate', target?: 0.01..1} (the fewest changes that clear it at least that often; default 0.95) or
// {kind: 'push', target?: 0.1..1} (the deepest rung of the target's ladder cleared at that rate; search/push.js runs it).
import { fightRng } from '../engine/rng.js';
import {
  stableStringify, meanInterval, wilsonInterval, pairedT, pairedProportion, binomialUpper,
} from '../engine/metrics.js';
import { preparePveFighter, simulatePve, trainingDummy, PVE_MODES } from '../engine/pve/fight.js';
import { chapterMobs, dungeonMobs, raidMobs, oblivionFloorMob, worldBossMob } from '../engine/pve/enemies.js';
import { raidById } from '../game/fortress.js';
import { CLASSIC_DUNGEONS } from '../game/pveContent.js';
import { WORLD_BOSS_AFFINITIES } from '../game/worldBoss.js';
import { FORTRESS_STARS, clanCapForServer } from '../game/fortress.js';
import {
  fortressBossMob, fortressBossMultipliers, FORTRESS_BOSS_GROUPS, MAX_SHIELD_PERCENT,
} from '../engine/pve/fortressBoss.js';
import { formatFlat } from '../format.js';
import { setOf } from './sampler.js';
import { resolvePvpTarget, makePvpObjective, PVP_TARGET_KIND, PVP_OBJECTIVE_KIND } from './pvpObjective.js';

// The PVE kinds. The PVP pair is kept apart: it is only valid together and needs the character's opponents.
export const OBJECTIVE_KINDS = ['dps', 'survival', 'win-chance', 'win-rate', 'push'];

/** The two win-rate goals (simulation.md §Win rate): 'win-chance' maximises the clear rate, 'win-rate' reaches a target. */
export const isWinRateKind = (kind) => kind === 'win-chance' || kind === 'win-rate';
export const TARGET_KINDS = ['dummy', 'chapter', 'dungeon', 'raid', 'oblivion', 'worldBoss', 'fortressBoss', 'custom'];

// The first kind is the target's default (the Optimiser picks it): the highest chance to win for content you clear.
const COMPAT = {
  dummy: ['dps'],
  chapter: ['win-chance', 'win-rate', 'push'],
  dungeon: ['win-chance', 'win-rate', 'push'],
  raid: ['win-chance', 'win-rate', 'push'],
  oblivion: ['win-chance', 'win-rate', 'push'],
  worldBoss: ['dps'],
  fortressBoss: ['dps'],
  custom: ['dps', 'win-chance', 'win-rate', 'survival'],
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

/**
 * Whether a saved goal (target kind + objective kind) can no longer be run: kill time was retired for
 * every target, and survival stays only for custom mobs (simulation.md §Objectives). Saved runs that carry
 * such a goal stay viewable; only re-running them is off.
 */
export function goalRetired(targetKind, objectiveKind) {
  return !(COMPAT[targetKind] ?? []).includes(objectiveKind);
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
const nonNegInt = (v) => Number.isInteger(v) && v >= 0;

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
  } else if (kind === 'fortressBoss') {
    const group = raw.group;
    if (!FORTRESS_BOSS_GROUPS.includes(group)) throw new Error(`unknown Fortress boss group '${group}'`);
    const core = group === 'CORE';
    if (core && raw.stars != null) throw new Error('the Core Fortress has no stars');
    const stars = core ? null : raw.stars ?? FORTRESS_STARS.default;
    if (!core && !(Number.isInteger(stars) && stars >= 1 && stars <= FORTRESS_STARS.max)) {
      throw new Error(`Fortress stars must be a whole number from 1 to ${FORTRESS_STARS.max}, got ${stars}`);
    }
    const aliveDefenders = raw.aliveDefenders ?? 0;
    const server = raw.server !== undefined ? raw.server : character?.server ?? null;
    // a saved spec's explicit `maxClanSize` stays an explicit cap (it overrides the server's)
    const maxClanSize = raw.maxClanSize ?? null;
    const shieldPercent = raw.shieldPercent ?? null;
    const kills = raw.kills ?? 0;
    if (!nonNegInt(aliveDefenders)) throw new Error(`alive defenders must be a whole number from 0, got ${aliveDefenders}`);
    if (server !== null && !nonNegInt(server)) throw new Error(`server must be a whole number or null, got ${server}`);
    if (maxClanSize !== null && !posInt(maxClanSize)) throw new Error(`max clan size must be a whole number from 1, got ${maxClanSize}`);
    if (shieldPercent !== null && !(isNum(shieldPercent) && shieldPercent >= 0 && shieldPercent <= MAX_SHIELD_PERCENT)) {
      throw new Error(`shield percent must be from 0 to ${MAX_SHIELD_PERCENT}, got ${shieldPercent}`);
    }
    const clanCap = maxClanSize ?? clanCapForServer(server);
    if (!nonNegInt(kills)) throw new Error(`kills must be a whole number from 0, got ${kills}`);
    const mob = fortressBossMob(group);
    t.spec = { kind, group, ...(core ? {} : { stars }), aliveDefenders, server, ...(maxClanSize !== null ? { maxClanSize } : {}), ...(shieldPercent !== null ? { shieldPercent } : {}), kills };
    t.fortress = { ...fortressBossMultipliers({ group, stars, aliveDefenders, clanCap, shieldPercent, kills }), clanCap };
    t.enemy = mob;
    t.maxMs = mob.fightDurationMs;
    t.seconds = mob.fightDurationMs / 1000;
    t.label = `Fortress boss (${group}${core ? '' : `, ${stars} star${stars === 1 ? '' : 's'}`})`;
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
      out.push(outcome(r, prepared));
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

// ---------------------------------------------------------------------------------------------
// Win rate (simulation.md §Win rate): clear the whole step before dying or the time cap. One fight
// scores 1 + (HP left / max HP) when won, else the share of the step's enemy HP removed (< 1), so the
// win bit is `score >= 1` and the same vector carries the safety margin.

/** The default and the allowed range of a win-rate target. */
export const WIN_RATE_TARGET = Object.freeze({ default: 0.95, min: 0.01, max: 1 });

/** A win-rate objective's target rate: the default when absent; throws outside [0.01, 1]. */
export function winRateTarget(v) {
  if (v == null) return WIN_RATE_TARGET.default;
  if (!isNum(v) || v < WIN_RATE_TARGET.min || v > WIN_RATE_TARGET.max) {
    throw new Error(`win-rate target must be between ${WIN_RATE_TARGET.min} and ${WIN_RATE_TARGET.max}, got ${v}`);
  }
  return v;
}

/** The default and the allowed range of a Push target (simulation.md §Push): it keeps the 10% floor. */
export const PUSH_TARGET = Object.freeze({ default: WIN_RATE_TARGET.default, min: 0.1, max: 1 });

/** A Push objective's target rate: the default when absent; throws outside [0.1, 1]. */
export function pushTarget(v) {
  if (v == null) return PUSH_TARGET.default;
  if (!isNum(v) || v < PUSH_TARGET.min || v > PUSH_TARGET.max) {
    throw new Error(`push target must be between ${PUSH_TARGET.min} and ${PUSH_TARGET.max}, got ${v}`);
  }
  return v;
}

const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
// A loss never reaches 1, whatever the rounding of a nearly cleared step.
const LOSS_CEILING = 1 - 1e-9;

/** One fight's win-rate score (exported for tests). `maxHp` is the player's. */
export function winRateFightScore(r, maxHp) {
  if (r.won) return 1 + clamp01(r.hpLeft / maxHp);
  const total = r.damageDealt + r.enemyHpLeft;
  return Math.min(LOSS_CEILING, total > 0 ? clamp01(r.damageDealt / total) : 0);
}

const winBit = (v) => (v >= 1 ? 1 : 0);

/**
 * Whether an Estimate of a win rate meets the target: true when its lower bound is at least
 * target − δ (inside the indifference zone counts as reached), false when its upper bound is below
 * the target, else null (not resolved).
 */
export function meetsTarget(e, target, delta = 0) {
  if (!e || e.lo == null || e.hi == null) return null;
  if (e.lo >= target - delta) return true;
  if (e.hi < target) return false;
  return null;
}

/**
 * The paired contrast of the capped win rate g = min(p_X, τ) − min(p_Y, τ) (simulation.md §Win rate); the
 * highest-chance goal (`max`) uses τ = 1, so g is the plain rate difference. The rate interval intersects
 * four intervals at a joint alpha · 3/4 (Bonferroni): Tango on p_X − p_Y at alpha / 4, a Wilson interval
 * per build at alpha / 8, and an exact one-sided bound on each discordant rate at alpha / 8 (p_X − p_Y is
 * at most P(X wins and Y loses), and at least −P(Y wins and X loses)), which is what lets two builds that
 * rarely or never win be shown equal on the rate after about ln(8 / alpha) / δ fights. Because min(·, τ)
 * is monotone and 1-Lipschitz, g lies between 0 and p_X − p_Y, and g > 0 needs p_Y < τ; the bounds below
 * follow. The progress score (paired t at alpha / 4) is attached as `then` when both builds are
 * confidently below the target (target goal) or neither won a fight (`max`): the comparator reads it only
 * once the rate is `equivalent`. `thenPending` marks a contrast whose margin may still attach at a later
 * look (the futility rule keeps such an arm open); under `max` wins only accumulate, so it never does.
 */
function cappedWinRateContrast(tau, x, y, alpha, max = false) {
  const xs = x.main[0];
  const ys = y.main[0];
  const n = Math.min(xs.length, ys.length);
  const bx = xs.slice(0, n).map(winBit);
  const by = ys.slice(0, n).map(winBit);
  let b = 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (bx[i] > by[i]) b++;
    else if (bx[i] < by[i]) c++;
  }
  const t = pairedProportion(bx, by, { alpha: alpha / 4 });
  const uB = binomialUpper(b, n, alpha / 8);
  const uC = binomialUpper(c, n, alpha / 8);
  const wx = wilsonInterval(sumOf(bx), n, { alpha: alpha / 8 });
  const wy = wilsonInterval(sumOf(by), n, { alpha: alpha / 8 });
  const cap = (p) => Math.min(p, tau);
  const delta = cap(wx.est) - cap(wy.est);
  const pairedLo = t.lo > 0 ? (wy.hi < tau ? Math.min(t.lo, tau - wy.hi) : 0) : t.lo;
  const pairedHi = t.hi < 0 ? (wx.hi < tau ? Math.max(t.hi, wx.hi - tau) : 0) : t.hi;
  let lo = Math.max(pairedLo, cap(wx.lo) - cap(wy.hi), -uC);
  let hi = Math.min(pairedHi, cap(wx.hi) - cap(wy.lo), uB);
  // the intervals disagree (each holds at its own level): fall back to the weaker bounds
  if (lo > hi) [lo, hi] = [Math.min(lo, hi), Math.max(lo, hi)];
  const both = max ? sumOf(bx) + sumOf(by) === 0 : Math.max(wx.hi, wy.hi) < tau;
  const then = both
    ? { ...pairedT(xs.slice(0, n), ys.slice(0, n), { alpha: alpha / 4 }), method: 'paired-t', basis: 'margin', higherIsBetter: true, ref: meanInterval(ys.slice(0, n)).est }
    : null;
  const rate = { delta: t.delta, lo: Math.max(t.lo, -uC), hi: Math.min(t.hi, uB) };
  return {
    delta, lo, hi, p: t.p, sd: t.sd, method: 'capped-tango', basis: 'win-rate', higherIsBetter: true,
    ref: cap(wy.est), winRate: rate.lo > rate.hi ? { delta: t.delta, lo: t.lo, hi: t.hi } : rate, then,
    // the margin may still attach at a later look: neither build is yet confidently at the target
    thenPending: !max && !both && Math.max(wx.lo, wy.lo) < tau,
  };
}

/**
 * Lexicographic score: the capped win rate first (one fight moves it by 1/n ≥ 1/131 072, so ×1e6
 * outweighs any margin in [0, 2]), then the mean margin.
 */
const SCORE_SCALE = 1e6;


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

  if (kind === 'push') {
    // Push (simulation.md §Push) scores each rung with the win-rate objective; this echo names the goal
    const w = makeObjective({ kind: 'win-rate', target: pushTarget(raw.target) }, target);
    return {
      ...w, kind, key: stableStringify({ kind, target: w.target }), spec: { kind, target: w.target },
      label: `Push: deepest step at ${Math.round(w.target * 1000) / 10}%`,
    };
  }

  if (isWinRateKind(kind)) {
    // 'win-chance' is the same objective with the cap at 1 (every rate counts) and no target
    const max = kind === 'win-chance';
    const tau = max ? 1 : winRateTarget(raw.target);
    const rateOf = (s) => sumOf(s.main[0].map(winBit)) / Math.max(1, s.n);
    return withLegacy({
      ...common, key: stableStringify(max ? { kind } : { kind, target: tau }), spec: max ? { kind } : { kind, target: tau },
      label: max ? 'Highest chance to win' : `Win rate (target ${Math.round(tau * 1000) / 10}%)`, unit: 'p', higherIsBetter: true,
      statistic: 'proportion', q: null, deltaKind: 'absolute', window: target.seconds || null,
      target: max ? null : tau, goal: max ? 'max' : 'target',
      sample: pveSampler(target, { enemy: target.enemy, maxMs: target.maxMs }, (r, prepared) => winRateFightScore(r, prepared.inputs.player.maxHp)),
      /** The per-fight point a remainder is measured in: the win bit (win-rate points). */
      pointOf: winBit,
      estimate(s, { alpha = 0.05 } = {}) {
        const m = meanInterval(s.main[0], { alpha });
        return {
          value: proportionEstimate(s.main[0].map(winBit), alpha),
          aux: { margin: { est: m.est, lo: m.lo, hi: m.hi, n: s.n, level: level(alpha), alphaAdj: alpha, method: 't' }, target: max ? null : tau },
        };
      },
      contrast: (x, y, { alpha = 0.05 } = {}) => cappedWinRateContrast(tau, x, y, alpha, max),
      /** The capped win rate alone (ranking: rows equal on it are ordered by fewest changes). */
      primary: (s) => Math.min(rateOf(s), tau),
      score: (s) => Math.min(rateOf(s), tau) * SCORE_SCALE + (meanInterval(s.main[0]).est ?? 0),
    });
  }
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
