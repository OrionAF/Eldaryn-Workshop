// search/objectives.js (F2a): optimiser targets and objectives.
//
// A TARGET is what the build fights (plain JSON, so it crosses the worker boundary and is saved in a run):
//   {kind: 'dummy', seconds?: 60}                     dps only
//   {kind: 'chapter', chapter: 1..22, level: 1..10}   chapters above 11 are the hard ones (enemies.js)
//   {kind: 'dungeon', id: 'dungeon_1', step: 1..8}    classic dungeon step, 3 mobs
//   {kind: 'oblivion', floor: n}                      forces the Oblivion realm; power comes from the fighter
//   {kind: 'worldBoss', affinity?: 'NONE'|'FORTIFIED'|'ENRAGED'}
//   {kind: 'custom', mob: MobSpec, seconds?: 60}      a user-entered mob
// An OBJECTIVE is what "better" means: {kind: 'dps'|'ttk-median'|'ttk-p90'|'survival', seconds?: 60}.
// Which pairs make sense is `objectiveKindsFor(targetKind)`; makeObjective throws on the others.
//
// Every objective turns a Fighter into a Measure:
//   {score, tie, value, lo, hi, n, aborted, scoreSamples?, extra}
// `score` is higher-is-better in every objective (a time is negated, a lost fight is worse than any win);
// `value` is the headline number in the objective's own unit with a 95 % interval; `scoreSamples` (with
// keepSamples) are per-fight scores on the common random numbers, ready for metrics.pairedDelta.
import { mulberry32, hashSeed } from '../engine/rng.js';
import { dpsVsDummy, ttkVs, survival, meanCI, stableStringify, wilson } from '../engine/metrics.js';
import { preparePveFighter, simulatePve, trainingDummy, FIGHT_CAP_MS } from '../engine/pve/fight.js';
import { chapterMobs, dungeonMobs, oblivionFloorMob, worldBossMob } from '../engine/pve/enemies.js';
import { WORLD_BOSS_AFFINITIES } from '../game/worldBoss.js';

export const OBJECTIVE_KINDS = ['dps', 'ttk-median', 'ttk-p90', 'survival'];
export const TARGET_KINDS = ['dummy', 'chapter', 'dungeon', 'oblivion', 'worldBoss', 'custom'];

const COMPAT = {
  dummy: ['dps'],
  chapter: ['ttk-median', 'ttk-p90', 'survival'],
  dungeon: ['ttk-median', 'ttk-p90', 'survival'],
  oblivion: ['ttk-median', 'ttk-p90', 'survival'],
  worldBoss: ['dps', 'survival'],
  custom: ['dps', 'ttk-median', 'ttk-p90', 'survival'],
};

/** Objective kinds that can score a target kind (the UI's picker uses this). */
export const objectiveKindsFor = (targetKind) => [...(COMPAT[targetKind] ?? [])];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const posInt = (v) => Number.isInteger(v) && v >= 1;

/**
 * @returns {{kind: string, spec: Object, label: string, key: string, realm: 'base'|'oblivion'|null,
 *   enemy: Object|Object[], maxMs: number|undefined, seconds: number, opts: Object}}
 *   `opts` is passed to simulatePve through the metrics; the fields are listed in engine/pve/fight.js.
 */
export function resolveTarget(raw = { kind: 'dummy' }) {
  const kind = raw?.kind;
  if (!TARGET_KINDS.includes(kind)) throw new Error(`unknown target kind '${kind}'`);
  const t = { kind, spec: null, label: '', realm: null, enemy: null, maxMs: undefined, seconds: 60, opts: {} };
  if (kind === 'dummy') {
    t.seconds = isNum(raw.seconds) && raw.seconds > 0 ? raw.seconds : 60;
    t.spec = { kind, seconds: t.seconds };
    t.enemy = trainingDummy();
    t.label = `Training dummy, ${t.seconds} s`;
  } else if (kind === 'chapter') {
    const mobs = posInt(raw.chapter) && posInt(raw.level) ? chapterMobs(raw.chapter, raw.level) : null;
    if (!mobs) throw new Error(`chapter ${raw.chapter} level ${raw.level} does not exist`);
    t.spec = { kind, chapter: raw.chapter, level: raw.level };
    t.enemy = mobs;
    // The campaign is the one fight the client runs itself, with its live-loop rules (combat-pve.md §1).
    t.opts = { opening: 'half', liveSpellResist: true };
    t.label = `${raw.chapter > 11 ? 'Hard chapter' : 'Chapter'} ${raw.chapter}, level ${raw.level}`;
  } else if (kind === 'dungeon') {
    const mobs = posInt(raw.step) ? dungeonMobs(raw.id, raw.step) : null;
    if (!mobs) throw new Error(`dungeon '${raw.id}' step ${raw.step} does not exist`);
    t.spec = { kind, id: raw.id, step: raw.step };
    t.enemy = mobs;
    t.label = `Dungeon ${raw.id}, step ${raw.step}`;
  } else if (kind === 'oblivion') {
    const mob = posInt(raw.floor) ? oblivionFloorMob(raw.floor) : null;
    if (!mob) throw new Error(`Oblivion floor ${raw.floor} does not exist`);
    t.spec = { kind, floor: raw.floor };
    t.enemy = mob;
    t.realm = 'oblivion';
    t.label = `Oblivion floor ${raw.floor}`;
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
    t.label = `Custom mob (${Math.round(m.hp)} HP)`;
  }
  t.key = stableStringify(t.spec);
  return t;
}

// ---------------------------------------------------------------------------------------------
// tier 0: closed-form screens. Heuristics that only order candidates for pruning; they are never shown
// as results. The expected-damage form is combat-pve.md §7; the spell/minion weight is ASSUMED.

/** Weight of spell damage and minion attack in the screen. ASSUMED (screen only, not a game fact). */
export const SCREEN_SPELL_WEIGHT = 0.35;

/**
 * Expected auto-attack damage per second against a defender (combat-pve.md §7), times a crude spell and
 * minion factor. Mitigation inputs are the enemy's `damageReduction`, `blockChance` (percent) and
 * `penetration` (percent of Attack).
 */
export function closedFormDps(stats, enemy = {}) {
  const c = Math.min(1, Math.max(0, (stats.totalCritChance ?? 0) / 100));
  const m = stats.totalCritDamage ?? 1;
  const h = Math.max(0, (stats.totalDoubleHit ?? 0) / 100);
  const R = 1 - (enemy.damageReduction ?? 0) / 100;
  const b = Math.min(1, Math.max(0, (enemy.blockChance ?? 0) / 100));
  const p = (enemy.penetration ?? 0) / 100;
  const atk = stats.totalAttack ?? 0;
  const perSwing = (1 - b) * R * atk * (1 + c * (m - 1) + h) + b * p * R * atk * (1 + c * (m - 1));
  const speed = stats.totalAttackSpeed > 0 ? stats.totalAttackSpeed : 0;
  const swings = speed > 0 ? 1000 / Math.round(1000 / speed) : 0;
  const extra = 1 + (((stats.totalSpellDamage ?? 0) + (stats.totalMinionAttack ?? 0)) / 100) * SCREEN_SPELL_WEIGHT;
  return perSwing * swings * extra;
}

/** Effective HP against ordinary hits: Damage Reduction, and Block plus Miss. Screen only. */
export function ehpProxy(stats) {
  const dr = Math.min(0.9, Math.max(0, (stats.totalDamageReduction ?? 0) / 100));
  const avoid = Math.min(0.95, Math.max(0, ((stats.totalBlockChance ?? 0) + (stats.totalMissChance ?? 0)) / 100));
  return (stats.totalHp ?? 0) / (1 - dr) / (1 - avoid);
}

// ---------------------------------------------------------------------------------------------
// measures

const LOSS_FACTOR = 2; // a lost fight scores -cap * LOSS_FACTOR in the per-fight score space

/** Distribution-free 95 % interval of quantile q over times where `Infinity` marks a loss (sorted copy). */
function quantileInterval(times, q) {
  const n = times.length;
  if (n === 0) return { lo: null, hi: null };
  const s = [...times].sort((a, b) => a - b);
  const half = 1.96 * Math.sqrt(n * q * (1 - q));
  const j = Math.max(0, Math.floor(n * q - half) - 1);
  const k = Math.min(n - 1, Math.ceil(n * q + half) - 1);
  const f = (x) => (Number.isFinite(x) ? x : null);
  return { lo: f(s[j]), hi: f(s[k]) };
}

function optsFor(target, fighter) {
  return target.kind === 'oblivion'
    ? { ...target.opts, oblivion: { power: fighter.stats?.totalOblivionPower ?? 0 } }
    : target.opts;
}

/** Damage per second over a fixed window against a mob (no metric for this in engine/metrics.js). */
function damageWindow(fighter, target, { n, seed, keepSamples, signal }) {
  const prepared = preparePveFighter(fighter);
  const opts = optsFor(target, fighter);
  const out = [];
  let aborted = false;
  for (let i = 0; i < n; i++) {
    if (signal?.aborted) { aborted = true; break; }
    const r = simulatePve({ fighter: prepared, enemy: target.enemy, maxMs: target.maxMs, rng: mulberry32(hashSeed(seed, i)), ...opts });
    out.push(r.damageDealt / target.seconds);
  }
  const r = meanCI(out);
  return { mean: r.mean, lo: r.lo, hi: r.hi, n: r.n, aborted, samples: keepSamples ? out : undefined };
}

/**
 * @param {{kind: string, seconds?: number}} raw
 * @param {ReturnType<typeof resolveTarget>} target
 */
export function makeObjective(raw = { kind: 'dps' }, target = resolveTarget({ kind: 'dummy' })) {
  const kind = raw?.kind;
  if (!OBJECTIVE_KINDS.includes(kind)) throw new Error(`unknown objective kind '${kind}'`);
  if (!COMPAT[target.kind].includes(kind)) throw new Error(`objective '${kind}' cannot score a '${target.kind}' target`);
  const seconds = isNum(raw.seconds) && raw.seconds > 0 ? raw.seconds : 60;
  const enemyView = Array.isArray(target.enemy) ? target.enemy[0] : target.enemy;
  const cap = target.maxMs ?? FIGHT_CAP_MS;

  const base = { kind, key: stableStringify({ kind, seconds: kind === 'survival' ? seconds : null }), spec: { kind } };

  if (kind === 'dps') {
    return {
      ...base, label: 'Damage per second', unit: 'dps', higherIsBetter: true,
      tier0: (stats) => closedFormDps(stats, enemyView),
      measure(fighter, { n, seed, keepSamples = false, signal }) {
        const r = target.kind === 'dummy'
          ? dpsVsDummy(fighter, { seconds: target.seconds, n, seed, keepSamples, cache: false, signal })
          : damageWindow(fighter, target, { n, seed, keepSamples, signal });
        return {
          score: r.mean ?? 0, tie: 0, value: r.mean, lo: r.lo, hi: r.hi, n: r.n, aborted: !!r.aborted,
          ...(keepSamples ? { scoreSamples: r.samples } : {}),
        };
      },
    };
  }

  if (kind === 'survival') {
    return {
      ...base, spec: { kind, seconds }, label: `Survival chance (${seconds} s)`, unit: 'p', higherIsBetter: true,
      tier0: (stats) => ehpProxy(stats),
      measure(fighter, { n, seed, keepSamples = false, signal }) {
        const r = survival(fighter, target.enemy, { seconds, n, seed, opts: optsFor(target, fighter), keepSamples, cache: false, signal });
        return {
          // p ties are common (many builds never die); the effective-HP proxy orders those, below any real p step.
          score: r.p ?? 0, tie: Math.log10(1 + ehpProxy(fighter.stats)), value: r.p, lo: r.lo, hi: r.hi, n: r.n,
          aborted: !!r.aborted, ...(keepSamples ? { scoreSamples: r.samples } : {}),
        };
      },
    };
  }

  // ttk-median / ttk-p90
  const q = kind === 'ttk-median' ? 0.5 : 0.9;
  return {
    ...base, label: kind === 'ttk-median' ? 'Median time to kill' : 'P90 time to kill', unit: 'ms', higherIsBetter: false,
    tier0: (stats) => closedFormDps(stats, enemyView),
    measure(fighter, { n, seed, keepSamples = false, signal }) {
      const r = ttkVs(fighter, target.enemy, { n, seed, maxMs: target.maxMs, opts: optsFor(target, fighter), keepSamples: true, cache: false, signal });
      // A quantile of the win times only exists when enough fights are won; below that, rank by win rate.
      const need = q;
      const reached = r.n > 0 && r.p >= need;
      const value = reached ? (q === 0.5 ? r.median : r.p90) : null;
      const score = reached ? -value : -cap * (LOSS_FACTOR - (r.p ?? 0));
      const times = (r.samples ?? []).map((x) => (x == null ? Infinity : x));
      const ci = reached ? quantileInterval(times, q) : { lo: null, hi: null };
      const w = wilson(r.wins, r.n);
      return {
        score, tie: 0, value, lo: ci.lo, hi: ci.hi, n: r.n, aborted: !!r.aborted,
        extra: { winRate: r.p, winLo: w.lo, winHi: w.hi, meanMs: r.mean },
        ...(keepSamples ? { scoreSamples: (r.samples ?? []).map((x) => (x == null ? -cap * LOSS_FACTOR : -x)) } : {}),
      };
    },
  };
}
