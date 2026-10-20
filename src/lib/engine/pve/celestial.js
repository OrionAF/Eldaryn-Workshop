import { rollStanceDaze, rollShieldBash, tickDazedMs } from '../core/stances.js';
// Celestial Trial (NORMAL and HARD): a party of 1-2 fighters against the Empyrean Gatekeeper and its
// Halo Breach adds. The fight is server-run and no client simulator exists, so this loop is built from
// the client's config (Game/pve-content.md §6) and the rules read from the 2026-10-15 server logs
// (Game/combat-pve.md §20, which also lists the per-tick order and every open item). Shared pieces are
// the PVE engine's own: spell pass, debuffs, buffs, stack sigils, Chrono Flux. Everything that differs
// from the dungeon loop lives here, so no other mode changes.
//
// Randomness: every draw goes through a `rolls` object (crit, double, blind, paralyze, avoid, add
// phase), built from the injected rng unless the caller passes its own (the replay check reveals the
// server's outcomes through it). Spell and DoT crit draws stay in the spell pass. No Math.random.
import { processSpellsTick, triggerTransformSpell, hasPendingTransform, isTransformActive, transformFireCount,
  activeBuffThornsPercent, isSpellBuffActive, computeActiveBuffModifiers } from '../core/spells.js';
import { applyBuffsToEntity, hasActiveBuffs, getBuffedMaxHp } from '../core/buffs.js';
import { initDebuffState, applyDebuff, processDebuffsTick, weakenedAttack } from '../core/debuffs.js';
import { applyBulwarkDr, applyElusiveBuff, createStackCombat } from '../core/stacks.js';
import { CHRONO_FLUX, clampChronoFlux, chronoFluxGainDivisor } from '../core/chronoFlux.js';
import { applyCombatCeiling, ceilingFor } from '../core/caps.js';
import { PARALYZE_DURATION_MS } from '../core/rolls.js';
import { lane } from '../rng.js';
import { preparePveFighter } from './fight.js';
import { EngineInputError } from '../validate.js';
import { celestialDifficulty, CELESTIAL_CONSTANTS, CELESTIAL_TACTICS } from '../../game/celestial.js';

/** Tick of the server fight and the clock's first timestamp (combat-pve.md §20.1). */
export const CELESTIAL_TICK_MS = 10;
export const CELESTIAL_START_MS = 500;
/** Add swing cadence after the first swing, and the first swing's random phase range (10..1000 ms). */
export const ADD_SWING_MS = 1000;
const REGEN_GRID_MS = 100;
const C_BLOCK = ceilingFor('BLOCK_CHANCE');
const C_MISS = ceilingFor('MISS_CHANCE');
const C_DR = ceilingFor('DAMAGE_REDUCTION');

/** Reference-only Mythic Fury scaling; this does not enable Mythic fights (pve-content.md addendum). */
export function celestialFuryPowerMultiplier(power, difficulty = 'MYTHIC') {
  const cfg = celestialDifficulty(difficulty)?.spells?.GATEKEEPERS_BURDEN;
  if (!(cfg?.furyOblivionSqrtCoefficient > 0)) return 1;
  return 1 + cfg.furyOblivionSqrtCoefficient * Math.sqrt(Math.max(0, power));
}

export function celestialHolderFuryShare(evaded, difficulty = 'MYTHIC') {
  return evaded ? celestialDifficulty(difficulty)?.spells?.GATEKEEPERS_BURDEN?.controlHolderFuryShare ?? 1 : 1;
}

const note = (key, text) => Object.freeze({ key, text });
/** Labels for the modelling choices of the Celestial mode (combat-pve.md §20). */
export const CELESTIAL_ASSUMPTIONS = Object.freeze({
  serverFight: note('celestial-server', 'Server-run fight: rules read from five server logs (2026-10-15); not the client\'s code.'),
  addPhase: note('celestial-add-phase', 'Each add\'s first swing comes 10-1000 ms after it spawns (uniform random draw, fitted to the logs).'),
  stackPlayer: note('celestial-stack-player', 'Stack sigils (Bulwark, Elusive, Sunder, Siegebreaker) and thorns run for one player only, by default the one who started the run (fitted to the logs).'),
  overloadEnd: note('celestial-overload-end', 'Overload is assumed to end when the living adds fall below the threshold (never seen in a log).'),
  overloadJudgment: note('celestial-overload-judgment', 'Judgment Strike is assumed to take the Overload multiplier too (never seen in a log; the cautious reading).'),
  timeLimit: note('celestial-time-limit', 'The time limit is counted from 0, so the fight has 500 ms less than the limit (the cautious reading).'),
  retarget: note('celestial-retarget', 'With the tank dead every enemy, Judgment Strike included, hits the first living player.'),
  maxAlive: note('celestial-max-alive', 'No add spawns while the cap of living adds is reached (never reached in a log).'),
  furyStacking: note('celestial-fury-stacking', 'Block Fury and the per-add attack bonus multiply (no difficulty has both).'),
  enemyTactics: note('celestial-enemy-tactics', 'The boss and the adds attack the tank (the logged tactics); the "adds target everyone" tactic is not modelled.'),
  stances: note('celestial-stances', 'Warrior stances use the shared combat rules here. Their timing in Celestial has not been checked against a server log. Shield Bash requires zero Miss Chance because the combined avoid roll labels other avoids as misses.'),
  attackDown: note('celestial-attack-down', 'Attack Down uses the shared party debuff rules against the boss and Judgment Strike. This Celestial timing has not been checked against a server log.'),
  minions: note('celestial-minions', 'Summoned minions are not simulated in Celestial. Necromancer summon builds need server evidence before their Celestial results can be treated as reliable.'),
});

// ---------------------------------------------------------------------------------------------
// Boss and add stats
// ---------------------------------------------------------------------------------------------

// port of getCelestialBossStats L1156882-1157030 (rateFor, compound): the band of a level is the last
// one with fromLevel <= level; HP and attack multipliers compound from referenceLevel + 1 to level
/**
 * @param {number} level  the party's scaling level
 * @param {'NORMAL'|'HARD'} difficulty
 * @returns {{hp: number, attack: number, attackSpeed: number, spellResist: number}}
 */
export function celestialBossStats(level, difficulty) {
  const diff = celestialDifficulty(difficulty);
  if (!diff) throw new EngineInputError(`unknown Celestial difficulty '${difficulty}'`, { kind: 'celestial', key: 'difficulty', value: difficulty });
  const sc = diff.bossScaling;
  const ref = sc.referenceLevel ?? CELESTIAL_CONSTANTS.REFERENCE_LEVEL;
  const rateFor = (l) => {
    let band;
    for (const b of sc.levelBands) {
      if (!(b.fromLevel <= l)) break;
      band = b;
    }
    return band;
  };
  let hp = 1;
  let atk = 1;
  for (let l = ref + 1; l <= level; l++) {
    const b = rateFor(l);
    if (b) {
      hp *= 1 + b.hpGrowthPerLevel;
      atk *= 1 + b.attackGrowthPerLevel;
    }
  }
  return {
    hp: Math.round(sc.baseHp * hp * diff.bossStatMultiplier),
    attack: Math.round(sc.baseAttack * atk * diff.bossStatMultiplier),
    attackSpeed: sc.attackSpeed,
    spellResist: diff.bossSpellResist,
  };
}

// port of getCelestialAddStats L1158519-1158571
/** Halo Stalker stats: round(boss HP * addHpFraction), round(boss attack * addAttackFraction). */
export function celestialAddStats(level, difficulty) {
  const boss = celestialBossStats(level, difficulty);
  const hb = celestialDifficulty(difficulty).spells.HALO_BREACH;
  return {
    hp: Math.round(boss.hp * hb.addHpFraction),
    attack: Math.round(boss.attack * hb.addAttackFraction),
    attackSpeed: hb.addAttackSpeed,
    spellResist: boss.spellResist,
  };
}

// ---------------------------------------------------------------------------------------------
// Rolls
// ---------------------------------------------------------------------------------------------

/**
 * The draws of a Celestial fight, from the injected rng (one lane per actor and purpose). A replay
 * passes its own object with the same methods.
 * @param {() => number} rng
 */
export function celestialRolls(rng) {
  const chance = (name, pct) => pct > 0 && lane(rng, name)() * 100 < pct;
  return {
    crit: (p, pct) => chance(`p${p}:crit`, pct),
    double: (p, pct) => chance(`p${p}:double`, pct),
    blind: (p, pct) => chance(`p${p}:blind`, pct),
    paralyze: (p, pct) => chance(`p${p}:paralyze`, pct),
    /** The target avoids a boss (`addId` -1) or add swing. */
    avoid: (p, pct) => chance(`p${p}:avoid`, pct),
    /** ms from an add's spawn to its first swing: 10..1000 on the 10 ms grid. */
    addPhase: () => CELESTIAL_TICK_MS * (1 + Math.floor(lane(rng, 'add:phase')() * (ADD_SWING_MS / CELESTIAL_TICK_MS))),
  };
}

// ---------------------------------------------------------------------------------------------
// Party
// ---------------------------------------------------------------------------------------------

/**
 * A party member, prepared once and reused across fights: a Fighter or a `preparePveFighter` result.
 * @param {Object} f
 */
export const prepareCelestialMember = (f) => (f?.fresh ? f : preparePveFighter(f));

/** The default tank: the first member whose spec is a tank spec, else the last member. */
export function defaultTankIndex(fighters) {
  const i = fighters.findIndex((f) => /_TANK$/.test((f.fighter ?? f)?.spec ?? ''));
  return i >= 0 ? i : fighters.length - 1;
}

/**
 * @typedef {Object} CelestialTactics
 * @property {'HOLD'|'BOSS'|'SPAWN'} [focus='HOLD']  HOLD: hit the oldest add while more than
 *   `holdCount` live, else the boss; BOSS: always the boss; SPAWN: the oldest add whenever one lives
 * @property {number} [holdCount]  clamped to [1, min(maxAlive, addsThreshold)] (getCelestialMaxHoldCount)
 * The enemy side of the client's tactics (`bossFocusesTank`, `addsTarget`) is fixed at the logged
 * values (boss and adds on the tank).
 */

/**
 * @typedef {Object} CelestialOptions
 * @property {Array<Object>} party  1-2 Fighters (or prepareCelestialMember results), in party order
 * @property {'NORMAL'|'HARD'} difficulty
 * @property {number} [level]  scaling level; default the party's highest `fighter.level`
 * @property {number} [tankIndex]  default defaultTankIndex
 * @property {number} [stackPlayerIndex=0]  the one member whose stack sigils and thorns run
 * @property {CelestialTactics} [tactics]  default the difficulty's finder default
 * @property {() => number} [rng]
 * @property {Object} [rolls]  overrides celestialRolls(rng)
 * @property {boolean} [log=false]  keep the event log (server tick shape)
 * @property {{overloadEnd?: 'belowThreshold'|'never', overloadJudgment?: boolean}} [rules]
 * @property {(ts: number, state: Object) => void} [afterTick]  replay hook: may overwrite state
 */

/** Holds that `getCelestialMaxHoldCount` allows (L1159404-1159450). */
export function celestialMaxHoldCount(difficulty) {
  const s = celestialDifficulty(difficulty).spells;
  const maxAlive = s.HALO_BREACH.maxAlive;
  return Math.max(1, Math.min(maxAlive, s.CELESTIAL_OVERLOAD.enabled ? s.CELESTIAL_OVERLOAD.addsThreshold : maxAlive));
}

function resolveTactics(tactics, difficulty) {
  const def = CELESTIAL_TACTICS.CELESTIAL_FINDER_DEFAULT_TACTICS[difficulty];
  const focus = tactics?.focus ?? def.focus;
  if (!['HOLD', 'BOSS', 'SPAWN'].includes(focus)) {
    throw new EngineInputError(`unknown Celestial focus '${focus}'`, { kind: 'celestial', key: 'focus', value: focus });
  }
  const raw = tactics?.holdCount ?? def.holdCount;
  const holdCount = Math.max(1, Math.min(celestialMaxHoldCount(difficulty), Math.round(raw)));
  return { focus, holdCount };
}

// ---------------------------------------------------------------------------------------------
// The fight
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {Object} CelestialResult
 * @property {boolean} won
 * @property {boolean} timedOut
 * @property {number} timeMs  timestamp of the last tick (the server's totalDuration)
 * @property {number} bossHpLeft
 * @property {number} bossMaxHp
 * @property {number[]} playerMaxHps  the sheets' max HP
 * @property {number[]} hpLeft  per member at the end (0 when dead)
 * @property {Array<number|null>} deathMs  per member
 * @property {number} tankIndex
 * @property {number} level
 * @property {number} addsSpawned
 * @property {number} addsKilled
 * @property {number|null} overloadMs  first Overload start
 * @property {'celestial'} mode
 * @property {Array<Object>} [log]
 */

/**
 * One Celestial Trial fight.
 * @param {CelestialOptions} o
 * @returns {CelestialResult}
 */
export function simulateCelestial(o) {
  const difficulty = o.difficulty;
  const diff = celestialDifficulty(difficulty);
  if (!diff || difficulty === 'MYTHIC') {
    throw new EngineInputError(`Celestial difficulty '${difficulty}' is not simulated`, { kind: 'celestial', key: 'difficulty', value: difficulty });
  }
  const party = (o.party ?? []).map(prepareCelestialMember);
  if (party.length < 1 || party.length > CELESTIAL_CONSTANTS.GROUP_SIZE) {
    throw new EngineInputError('a Celestial party has 1 or 2 members', { kind: 'celestial', key: 'party' });
  }
  const level = o.level ?? Math.max(...party.map((m) => m.fighter.level ?? 0));
  if (!(level >= 1)) throw new EngineInputError('the Celestial scaling level is missing', { kind: 'celestial', key: 'level' });
  const tankIndex = o.tankIndex ?? defaultTankIndex(party);
  const stackPlayer = o.stackPlayerIndex ?? 0;
  const tactics = resolveTactics(o.tactics, difficulty);
  if (typeof o.rng !== 'function' && !o.rolls) throw new EngineInputError('the rng is missing', { kind: 'celestial', key: 'rng' });
  const rolls = o.rolls ?? celestialRolls(o.rng);
  // a replay without an rng: spell and DoT crit draws (none at 0 % crit) never succeed
  const rng = o.rng ?? (() => 0.999999);
  const log = o.log === true;
  const overloadEndsBelow = (o.rules?.overloadEnd ?? 'belowThreshold') === 'belowThreshold';
  const overloadJudgment = o.rules?.overloadJudgment ?? true;
  const { afterTick = null } = o;

  const S = diff.spells;
  const HB = S.HALO_BREACH;
  const BU = S.GATEKEEPERS_BURDEN.enabled ? S.GATEKEEPERS_BURDEN : null;
  const JS = S.JUDGMENT_STRIKE.enabled ? S.JUDGMENT_STRIKE : null;
  const OV = S.CELESTIAL_OVERLOAD.enabled ? S.CELESTIAL_OVERLOAD : null;
  const per = (k) => (BU ? BU[k] ?? 0 : 0);
  // Difficulty coefficients are fixed during a fight; keep their lookups out of the tick loop.
  // See combat-pve.md §20.3 and simulation.md §Exact kernel performance.
  const maxBlockStacks = per('maxBlockStacks');
  const blockFuryDecayPerSec = per('blockFuryDecayPerSec');
  const healingReductionPerAdd = per('healingReductionPerAdd');
  const hpPerAdd = per('hpPerAdd');
  const attackPerAdd = per('attackPerAdd');
  const attackPerBlockStack = per('attackPerBlockStack');
  const blockChancePerAdd = per('blockChancePerAdd');
  const damageReductionPerAdd = per('damageReductionPerAdd');
  const damageTakenPerAdd = per('damageTakenPerAdd');
  const hpRegenPerAdd = per('hpRegenPerAdd');
  const furyOn = maxBlockStacks > 0;
  const furyDecay = (blockFuryDecayPerSec * CELESTIAL_TICK_MS) / 1000;
  const bossStats = celestialBossStats(level, difficulty);
  const addStats = celestialAddStats(level, difficulty);
  const bossInterval = Math.round(1000 / bossStats.attackSpeed);
  const ovlMult = OV ? 1 + OV.attackBuffMultiplier : 1;
  const timeLimit = diff.timeLimitMs;

  // --- members
  const M = party.map((prep, i) => {
    const f = prep.fresh();
    const stacks = i === stackPlayer && f.stacks ? f.stacks : null;
    return {
      i,
      player: f.player,
      sheetHp: f.player.maxHp,
      hp: f.player.maxHp,
      dead: false,
      deathMs: null,
      timer: 0,
      spells: f.spells,
      transforms: f.spells ? f.spells.filter((rt) => rt.config.spell.spellType === 'TRANSFORM') : null,
      debuffs: initDebuffState(),
      stacks,
      thornsPercent: stacks ? f.thornsPercent : 0,
      chrono: f.chrono,
      // this tick's Chrono Flux events: own landed hits, hits taken, own avoids
      fluxHits: 0,
      fluxTaken: 0,
      fluxAvoided: 0,
      bm: null,
      view: f.player,
      buffHpPct: 0,
    };
  });

  // --- shared state
  let ts = CELESTIAL_START_MS;
  let bossHp = bossStats.hp;
  let bossTimer = 0;
  const bossAttackDown = initDebuffState();
  let bossBlinded = false;
  let bossDazedMs = 0;
  let paralyzedMs = 0;
  let judgmentTimer = 0;
  let fury = 0;
  let overload = false;
  let overloadMs = null;
  let nextSpawn = CELESTIAL_START_MS + HB.intervalMs;
  let addSeq = 0;
  let addsKilled = 0;
  const adds = []; // living adds, oldest first: {id, hp, nextSwingMs}
  const ticks = [];
  let tickFrom = 0;

  const n = () => adds.length;
  const healMult = () => Math.max(0, 1 - healingReductionPerAdd * n());
  const baseMax = (m) => Math.round(m.sheetHp * (1 - hpPerAdd * n()));
  const stackHpPct = (m) => (m.stacks ? m.stacks.selfModifiers().hpPercent : 0);
  const capOf = (m, stackPct = stackHpPct(m)) => getBuffedMaxHp(baseMax(m), m.buffHpPct + stackPct);
  const attackMult = () => (1 + attackPerAdd * n()) * (1 + attackPerBlockStack * fury);
  const hpsNow = () => M.map((m) => m.hp);
  const emit = (ev) => {
    if (!log) return ev;
    const out = { timestamp: ts, ...ev, bossHpAfter: bossHp, playerHpsAfter: hpsNow() };
    if (furyOn && ev.type !== 'add_spawn') out.blockFuryStacks = Math.round(fury);
    ticks.push(out);
    return out;
  };
  const target = () => {
    if (!M[tankIndex].dead) return M[tankIndex];
    return M.find((m) => !m.dead) ?? null;
  };

  // the view a member swings, casts and defends with: buffs, then the stack player's Elusive stacks
  const refreshView = (m) => {
    let v = m.bm && hasActiveBuffs(m.bm) ? applyBuffsToEntity(m.player, m.bm) : m.player;
    if (m.stacks) {
      const e = m.stacks.elusiveSelfModifiers();
      if (e.attackPercent > 0 || e.critChancePercent > 0 || e.lifestealPercent > 0 || e.attackSpeedPercent > 0) {
        const x = applyElusiveBuff(v.attack, v.critChance, v.lifesteal, v.attackSpeed, e);
        v = { ...v, attack: x.attack, critChance: x.critChance, lifesteal: x.lifesteal, attackSpeed: x.attackSpeed };
      }
    }
    m.view = v;
  };

  const burdenUpdate = () => {
    for (const m of M) {
      if (!m.dead) m.hp = Math.min(m.hp, baseMax(m));
      emit({ type: 'burden_update', damage: 0, playerIndex: m.i, addId: -1, burdenStacks: n() });
    }
  };

  const lifesteal = (m, dmg) => {
    const ls = m.view.lifesteal;
    if (!(ls > 0) || m.dead) return;
    const cap = capOf(m);
    if (!(m.hp < cap)) return;
    const heal = Math.floor(((dmg * ls) / 100) * healMult());
    if (heal > 0) m.hp = Math.min(cap, m.hp + heal);
  };

  const result = (won, timedOut) => {
    const out = {
      won, timedOut, timeMs: ts, bossHpLeft: bossHp, bossMaxHp: bossStats.hp,
      playerMaxHps: M.map((m) => m.sheetHp), hpLeft: M.map((m) => (m.dead ? 0 : Math.max(0, m.hp))), deathMs: M.map((m) => m.deathMs), tankIndex, level,
      addsSpawned: addSeq, addsKilled, overloadMs, mode: 'celestial',
    };
    if (log) out.log = ticks;
    return out;
  };

  const killAdd = (a, by) => {
    adds.splice(adds.indexOf(a), 1);
    addsKilled += 1;
    emit({ type: 'add_death', damage: 0, playerIndex: by, addId: a.id, addHpAfter: 0 });
    burdenUpdate();
    if (overload && overloadEndsBelow && n() < OV.addsThreshold) {
      overload = false;
      emit({ type: 'overload_end', damage: 0, playerIndex: -1, addId: -1 });
    }
  };

  // end-of-tick fields: the stack player's counters and every Chrono Flux bar (combat-pve.md §20.1)
  const stampTick = () => {
    if (!log) return;
    const snap = M[stackPlayer]?.stacks ? M[stackPlayer].stacks.snapshot() : { bulwarkStacks: 0, sunderStacks: 0 };
    const flux = M.map((m) => (m.chrono ? m.chrono.flux : 0));
    for (let k = tickFrom; k < ticks.length; k++) {
      ticks[k].bulwarkStacks = snap.bulwarkStacks;
      ticks[k].sunderStacks = snap.sunderStacks;
      ticks[k].chronoFlux = flux;
    }
  };

  // --- opening (500 ms): the Burden starts at 0 adds
  for (const m of M) refreshView(m);
  burdenUpdate();
  tickFrom = ticks.length;

  // the spell pass input, refilled per member and tick
  const spellInput = {
    maxHp: 0, dtMs: CELESTIAL_TICK_MS, timestamp: 0, attack: 0, healReductionPercent: 0, hp: 0, enemyHp: 0,
    enemyMaxHp: bossStats.hp, offensiveConditions: false, selfConditionsMet: false, spellDamage: 0,
    targetSpellResist: bossStats.spellResist, spellCritChance: 0, critDamage: 1.5, spellVamp: 0, silencedMs: 0,
    healingMult: 1, healBaseMaxHp: 0, minionAlive: false,
  };

  const bossDead = () => {
    emit({ type: 'boss_death', damage: 0, playerIndex: -1, addId: -1 });
    stampTick();
    return result(true, false);
  };

  // enemy-phase state: the stack player's Bulwark at the phase start, the once-per-tick bonus-HP
  // clamp, and the tick's summed thorns
  const sp = M[stackPlayer] ?? null;
  let snapMods = null;
  let clamped = false;
  let thorns = 0;
  // one swing against the current target; `kind` 'boss' | 'judgment' | add
  const swingAt = (A, kind, add) => {
    if (!add) A = weakenedAttack(A, bossAttackDown);
    const t = target();
    if (!t) return;
    const isSp = t === sp && t.stacks != null;
    if (!clamped) {
      clamped = true;
      const cap = getBuffedMaxHp(baseMax(t), t.buffHpPct + (isSp && snapMods ? snapMods.hpPercent : 0));
      if (t.hp > cap) t.hp = cap;
    }
    const addId = add ? add.id : -1;
    if (add?.paralyzedMs > 0) {
      emit({ type: 'add_paralyze', damage: 0, playerIndex: t.i, addId });
      return;
    }
    if (kind !== 'judgment') {
      const v = t.view;
      const avoid = (applyCombatCeiling(v.blockChance, C_BLOCK) + applyCombatCeiling(v.missChance, C_MISS))
        * (1 - blockChancePerAdd * n());
      if (avoid > 0 && rolls.avoid(t.i, avoid, ts, addId)) {
        if (t.i === tankIndex && furyOn) fury = Math.min(maxBlockStacks, fury + 1);
        emit({ type: add ? 'add_block' : 'player_block', damage: 0, playerIndex: t.i, addId });
        if (isSp) {
          thorns += t.stacks.blockReflect(0);
          t.stacks.onEvaded();
        }
        if (v.missChance === 0 && t.hp > 0) {
          const stun = rollShieldBash(v, lane(rng, `p${t.i}:bash`));
          if (stun > 0) {
            if (add) add.paralyzedMs = Math.max(add.paralyzedMs ?? 0, stun);
            else paralyzedMs = Math.max(paralyzedMs, stun);
            emit({ type: add ? 'add_paralyzed' : 'boss_paralyzed', damage: 0, playerIndex: t.i, addId, paralyzeMs: stun, stunSource: 'SHIELD_BASH', shieldBash: true });
          }
        }
        t.fluxAvoided += 1;
        return;
      }
    }
    const drBase = applyCombatCeiling(t.view.damageReduction, C_DR);
    const dr = (isSp && snapMods ? applyBulwarkDr(drBase, snapMods) : drBase) * (1 - damageReductionPerAdd * n());
    const m = kind === 'judgment' ? JS.attackMultiplier : 1;
    const ovl = overload && (kind === 'boss' || (kind === 'judgment' && overloadJudgment)) ? ovlMult : 1;
    const dmg = Math.round(A * m * (1 - dr / 100) * (1 + damageTakenPerAdd * n()) * ovl);
    t.hp -= dmg;
    t.fluxTaken += 1;
    if (kind !== 'judgment' && isSp) {
      thorns += t.stacks.hitTakenReflect(dmg);
      if (t.thornsPercent > 0 && t.spells && isSpellBuffActive(t.spells, 'IRON_BASTION')) {
        thorns += Math.round((dmg * t.thornsPercent) / 100);
      }
      if (t.spells) {
        const pct = activeBuffThornsPercent(t.spells);
        if (pct > 0) thorns += Math.round((dmg * pct) / 100);
      }
    }
    if (t.hp <= 0) {
      t.hp = 0;
      t.dead = true;
      t.deathMs = ts;
      emit({ type: 'player_death', damage: dmg, playerIndex: t.i, addId });
      return;
    }
    emit({ type: kind === 'boss' ? 'boss_attack' : kind === 'judgment' ? 'judgment_strike' : 'add_attack', damage: dmg, playerIndex: t.i, addId });
  };

  while (ts < timeLimit) {
    ts += CELESTIAL_TICK_MS;
    tickFrom = ticks.length;

    // 0. clocks: Block Fury decay, boss paralysis, Judgment timer (frozen while paralyzed)
    if (furyOn) fury = Math.max(0, fury - furyDecay);
    paralyzedMs = Math.max(0, paralyzedMs - CELESTIAL_TICK_MS);
    for (const add of adds) {
      add.paralyzedMs = Math.max(0, (add.paralyzedMs ?? 0) - CELESTIAL_TICK_MS);
      add.dazedMs = tickDazedMs(add.dazedMs, CELESTIAL_TICK_MS);
    }
    bossDazedMs = tickDazedMs(bossDazedMs, CELESTIAL_TICK_MS);
    if (JS && paralyzedMs <= 0) judgmentTimer += CELESTIAL_TICK_MS;

    // 1. Halo Breach
    if (ts >= nextSpawn) {
      nextSpawn += HB.intervalMs;
      if (n() < HB.maxAlive) {
        addSeq += 1;
        adds.push({ id: addSeq, hp: addStats.hp, nextSwingMs: ts + rolls.addPhase(addSeq, ts) });
        emit({ type: 'add_spawn', damage: 0, playerIndex: -1, addId: addSeq, addMaxHp: addStats.hp, addHpAfter: addStats.hp });
        burdenUpdate();
        if (OV && !overload && n() >= OV.addsThreshold) {
          overload = true;
          if (overloadMs == null) overloadMs = ts;
          emit({ type: 'overload_start', damage: 0, playerIndex: -1, addId: -1 });
        }
      }
    }

    // 2. each member in party order: regen pulse, spell pass, auto-attack
    for (const m of M) {
      if (m.dead) continue;
      // 2a. regen: sheet max HP, Burden-drained, while below the cap
      if (ts % REGEN_GRID_MS === 0 && m.player.hpRegen > 0) {
        const cap = capOf(m);
        if (m.hp < cap) {
          const pulse = Math.round(((m.sheetHp * m.player.hpRegen) / 100 / 10) * (1 - hpRegenPerAdd * n()));
          m.hp = Math.min(cap, m.hp + pulse);
          emit({ type: 'player_regen', damage: 0, playerIndex: m.i, addId: -1 });
        }
      }
      // 2b. spell pass: spells and DoTs always land on the boss
      if (m.spells) {
        const mult = attackMult();
        spellInput.maxHp = baseMax(m);
        spellInput.timestamp = ts;
        spellInput.attack = Math.round(m.player.attack * mult);
        spellInput.hp = m.hp;
        spellInput.enemyHp = bossHp;
        spellInput.spellDamage = m.player.spellDamage;
        spellInput.spellCritChance = m.player.spellCritChance;
        spellInput.critDamage = m.player.critDamage;
        spellInput.spellVamp = m.player.spellVamp;
        spellInput.healingMult = healMult();
        const res = processSpellsTick(m.spells, spellInput, rng);
        m.bm = res.buffModifiers;
        m.buffHpPct = m.bm.hpPercent;
        const totalHpPct = m.buffHpPct + stackHpPct(m);
        if (res.ownerHpDelta > 0) m.hp = Math.min(capOf(m), m.hp + res.ownerHpDelta * healMult());
        if (totalHpPct <= 0 && m.hp > baseMax(m)) m.hp = baseMax(m);
        if (res.targetHpDelta < 0) bossHp = Math.max(0, bossHp + res.targetHpDelta);
        if (res.targetParalyzeMs && bossHp > 0) paralyzedMs = Math.max(paralyzedMs, res.targetParalyzeMs);
        if (res.targetBlinded && bossHp > 0) bossBlinded = true;
        const applied = [];
        if (res.newDebuffs) for (const spec of res.newDebuffs) {
          applied.push(spec.type === 'ATTACK_DOWN'
            ? applyDebuff(bossAttackDown, spec, ts, { partySlot: m.i })
            : applyDebuff(m.debuffs, spec, ts));
        }
        if (log) {
          for (const a of applied) {
            emit({
              type: a.type === 'debuff_applied' ? 'spell_debuff_applied' : 'spell_debuff_stack', damage: 0,
              playerIndex: m.i, addId: -1, spell: a.source, debuffStacks: a.stacks, debuffMaxStacks: a.maxStacks,
              debuffPermanent: a.permanent, damagePerTick: a.damagePerTick,
            });
          }
          for (const ev of res.events) {
            emit({ type: ev.type, damage: ev.value, playerIndex: m.i, addId: -1, spell: ev.spell, ...(ev.isCrit ? { isCrit: true } : {}) });
          }
        }
        refreshView(m);
        if (bossHp <= 0) return bossDead();
      } else {
        refreshView(m);
      }
      // 2c. auto-attack
      const interval = Math.round(1000 / m.view.attackSpeed);
      m.timer += CELESTIAL_TICK_MS;
      if (m.timer < interval) continue;
      m.timer -= interval;
      const v = m.view;
      const A = Math.round(v.attack * attackMult());
      const crit = rolls.crit(m.i, v.critChance, ts);
      const first = crit ? Math.round(A * v.critDamage) : A;
      const add = tactics.focus === 'BOSS' ? null
        : tactics.focus === 'SPAWN' ? adds[0] ?? null
          : n() > tactics.holdCount ? adds[0] : null;
      if (add) {
        add.hp = Math.max(0, add.hp - first);
        emit({ type: crit ? 'player_crit_add' : 'player_attack_add', damage: first, playerIndex: m.i, addId: add.id, isCrit: crit, addHpAfter: add.hp });
        lifesteal(m, first);
        m.fluxHits += 1;
        if (add.hp <= 0) killAdd(add, m.i);
        else {
          const daze = rollStanceDaze(v, add.dazedMs ?? 0, lane(rng, `p${m.i}:daze`));
          if (daze.procced) {
            add.dazedMs = daze.dazedMs;
            emit({ type: 'add_dazed', damage: 0, playerIndex: m.i, addId: add.id, dazeMs: daze.durationMs });
          }
        }
        continue;
      }
      const dbl = rolls.double(m.i, v.doubleHit, ts);
      bossHp = Math.max(0, bossHp - first);
      emit({ type: crit ? 'player_crit' : 'player_attack', damage: first, playerIndex: m.i, addId: -1, isCrit: crit });
      lifesteal(m, first);
      m.fluxHits += 1;
      if (m.stacks) m.stacks.onHitLanded();
      if (dbl && bossHp > 0) {
        bossHp = Math.max(0, bossHp - A);
        emit({ type: 'player_attack', damage: A, playerIndex: m.i, addId: -1, doubleHit: true });
        lifesteal(m, A);
        m.fluxHits += 1;
        if (m.stacks) m.stacks.onHitLanded();
      }
      if (bossHp <= 0) return bossDead();
      if (v.blindChance > 0 && !bossBlinded && rolls.blind(m.i, v.blindChance, ts)) {
        bossBlinded = true;
        emit({ type: 'boss_blinded', damage: 0, playerIndex: m.i, addId: -1 });
      }
      if (v.paralyzeChance > 0 && paralyzedMs <= 0 && rolls.paralyze(m.i, v.paralyzeChance, ts)) {
        paralyzedMs = PARALYZE_DURATION_MS;
        emit({ type: 'boss_paralyzed', damage: 0, playerIndex: m.i, addId: -1 });
      }
      const daze = rollStanceDaze(v, bossDazedMs, lane(rng, `p${m.i}:daze`));
      if (daze.procced) {
        bossDazedMs = daze.dazedMs;
        emit({ type: 'boss_dazed', damage: 0, playerIndex: m.i, addId: -1, dazeMs: daze.durationMs });
      }
    }

    // 3. DoTs on the boss, per owner
    if (bossAttackDown.length > 0) {
      const d = processDebuffsTick(bossAttackDown, CELESTIAL_TICK_MS, ts, rng);
      if (log) for (const ev of d.events) emit({
        type: 'spell_debuff_expired', damage: 0, addId: -1, spell: ev.source,
        debuffStacks: ev.stacks, debuffMaxStacks: ev.maxStacks, debuffPermanent: ev.permanent, damagePerTick: 0,
      });
    }
    for (const m of M) {
      if (m.debuffs.length === 0) continue;
      const d = processDebuffsTick(m.debuffs, CELESTIAL_TICK_MS, ts, rng);
      if (d.targetHpDelta < 0) bossHp = Math.max(0, bossHp + d.targetHpDelta);
      if (log) {
        for (const ev of d.events) {
          emit({
            type: ev.type === 'debuff_tick' ? 'spell_debuff_tick' : 'spell_debuff_expired', damage: ev.value,
            playerIndex: m.i, addId: -1, spell: ev.source, debuffStacks: ev.stacks, debuffMaxStacks: ev.maxStacks,
            debuffPermanent: ev.permanent, damagePerTick: ev.damagePerTick, ...(ev.isCrit ? { isCrit: true } : {}),
          });
        }
      }
      if (bossHp <= 0) return bossDead();
    }

    // 4. enemy phase: boss swing, Judgment Strike, add swings, then one combined thorns reflect
    snapMods = sp?.stacks ? sp.stacks.selfModifiers() : null;
    clamped = false;
    thorns = 0;
    bossTimer += CELESTIAL_TICK_MS;
    if (bossTimer >= bossInterval) {
      bossTimer -= bossInterval;
      const t = target();
      if (t && paralyzedMs > 0) {
        emit({ type: 'boss_paralyze', damage: 0, playerIndex: t.i, addId: -1 });
      } else if (t && bossBlinded) {
        bossBlinded = false;
        emit({ type: 'boss_blind', damage: 0, playerIndex: t.i, addId: -1 });
      } else {
        swingAt(bossStats.attack, 'boss', null);
      }
    }
    if (JS && judgmentTimer >= JS.intervalMs) {
      judgmentTimer -= JS.intervalMs;
      swingAt(bossStats.attack, 'judgment', null);
    }
    for (const a of adds) {
      if (ts < a.nextSwingMs) continue;
      a.nextSwingMs += ADD_SWING_MS;
      swingAt(addStats.attack, 'add', a);
    }
    if (thorns > 0 && bossHp > 0 && sp && !sp.dead) {
      bossHp = Math.max(0, bossHp - thorns);
      emit({ type: 'thorns_reflect', damage: thorns, playerIndex: sp.i, addId: -1 });
      if (bossHp <= 0) return bossDead();
    }

    // 5. end of tick: Chrono Flux per member (no gain while a transform runs; fires when full), stacks
    for (const m of M) {
      const c = m.chrono;
      if (!c) continue;
      const { fluxHits: hits, fluxTaken: taken, fluxAvoided: blocked } = m;
      m.fluxHits = 0;
      m.fluxTaken = 0;
      m.fluxAvoided = 0;
      if (m.dead) continue;
      const active = m.transforms ? isTransformActive(m.transforms) : false;
      if (!active) {
        const f = c.flameConduit + c.darkConduit;
        const e = c.earthenConduit + c.darkConduit;
        const gain = hits * f * CHRONO_FLUX.FLAME_HIT + taken * e * CHRONO_FLUX.EARTHEN_HIT + blocked * e * CHRONO_FLUX.EARTHEN_BLOCKED;
        const fires = m.transforms ? transformFireCount(m.transforms) : 0;
        c.flux = clampChronoFlux(c.flux + gain / chronoFluxGainDivisor(fires));
      }
      if (c.flux >= CHRONO_FLUX.MAX && m.spells && hasPendingTransform(m.spells)) {
        const tr = triggerTransformSpell(m.spells, ts, m.hp, baseMax(m), m.player);
        if (tr.triggered) {
          c.flux = 0;
          // the transform's effects count from the next tick on (its HP share heals nothing here)
          m.bm = computeActiveBuffModifiers(m.spells);
          m.buffHpPct = m.bm.hpPercent;
          refreshView(m);
          for (const ev of tr.events) emit({ type: ev.type, damage: 0, playerIndex: m.i, addId: -1, spell: ev.spell });
        }
      }
    }
    if (sp?.stacks) sp.stacks.tick(CELESTIAL_TICK_MS);
    stampTick();
    if (afterTick) afterTick(ts, { members: M, adds, get bossHp() { return bossHp; }, set bossHp(v) { bossHp = v; } });

    if (M.every((m) => m.dead)) return result(false, false);
  }
  return result(false, true);
}
