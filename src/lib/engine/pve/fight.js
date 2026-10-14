// PVE fight driver: the client's shared fight loop (`simulateFight`), the Oblivion strain state it is
// fed, the World Boss hit-back, and `simulatePve`, the wrapper the metrics call with a Fighter.
// Rules and the per-tick order: Game/combat-pve.md §2 (steps 1-11), §9, §10, §11, §13, §14, §16.
// What differs per fight mode (tick, shield mitigation, mob sequencing, caps) is the `PVE_MODES` table;
// which of its values come from the client and which are assumed is combat-pve.md §2, §13, §14.
// Draw order is behaviour (rebuild-plan §6). One tick draws, in order: the spell pass (one draw per
// spell crit roll), the debuff tick (one per crit-capable DoT tick), then processCombatTick's own draws
// (see tick.js header). Nothing here calls Math.random.
//
// Two engine paths exist in the client (combat-pve.md §10.2). This driver is the SHARED one
// (`simulateFight`): the spell pass sees `spellResist + damageReduction` as the target resist, the
// timers start at 0 and the tick is `dtMs` (the live progress loop uses 100 ms; the shared copy takes it
// as an argument). Three switches give the live progress loop's differences: `ctx.liveSpellResist` (the
// resist is `mob.spellResist` only), `opening: 'half'` (the mob's swing timer starts at half its
// interval) and `ctx.liveLoop` (the Chrono Flux transform fires at the top of the next tick, §10).
import { processSpellsTick, isTransformActive, hasPendingTransform, triggerTransformSpell, transformFireCount,
  activeBuffThornsPercent, isSpellBuffActive, initSpellRuntimes } from '../core/spells.js';
import { applyBuffsToEntity, hasActiveBuffs, getBuffedMaxHp } from '../core/buffs.js';
import { initDebuffState, applyDebuff, processDebuffsTick, slowedAttackSpeed } from '../core/debuffs.js';
import { applySunderToTarget, applyBulwarkDr, applyElusiveBuff, createStackCombat } from '../core/stacks.js';
import { CHRONO_FLUX, clampChronoFlux, chronoFluxFromEvents } from '../core/chronoFlux.js';
import {
  createHealBudget, refillHealBudget, spendHealBudget, shieldRefillAmount,
} from '../core/shield.js';
import {
  advanceMinionRespawn, elapseMinionRespawn, resummonIfDead, openingSummonWindowMs, openingSwingTimerStart,
  minionSummonMeta, soulLinkHeal, killMinion, isMinionAlive, createMinion,
} from '../core/minions.js';
import { createPlayerEntity, createMobEntity } from '../core/entity.js';
import {
  buildCombatSpells, getEquippedShieldConfig, getEquippedSummonConfig, getEquippedFormConfig,
} from '../core/spellConfig.js';
import { glyphCombatMods } from '../core/glyphMods.js';
import { processCombatTick, routeSpellHealToMinion } from './tick.js';
import { EngineInputError, assertFiniteEntity, assertPositive } from '../validate.js';
import { PVE_PROGRESS_CONSTANTS } from '../../game/combatPve.js';
import { RAID_CONSTANTS } from '../../game/fortress.js';
import { WORLD_BOSS_CONSTANTS } from '../../game/worldBoss.js';

/** Fight cap of the shared engine: 20 min (combat-pve.md §14, L1087922). */
export const FIGHT_CAP_MS = 1_200_000;
/** Tick of the live progress loop and of the world boss (combat-pve.md §2). */
export const DEFAULT_DT_MS = 100;
/** `SHIELD_MITIGATION` of the campaign and dungeon constants (combat-pve.md §13). */
export const PVE_SHIELD_MITIGATION = PVE_PROGRESS_CONSTANTS.shieldMitigation;
// DUNGEON_CONSTANTS (L1062719) are not in the synced catalogue, so their two combat values sit here
const DUNGEON_TICK_MS = 10;
const DUNGEON_SHIELD_MITIGATION = 0.5;
/** simulateDungeonStep's wait before every mob, the first included (L1671080-1671084). */
export const INTER_MOB_GAP_MS = 500;

// ---------------------------------------------------------------------------------------------
// Fight modes
// ---------------------------------------------------------------------------------------------

const note = (key, text) => Object.freeze({ key, text });
/** Labels for the modelling choices a mode makes, for the UI to show next to its results. */
export const PVE_ASSUMPTIONS = Object.freeze({
  serverFight: note('server-fight', "Server-run fight: simulated with the client's shared engine; whether the server runs it is unresolved."),
  campaignCap: note('campaign-cap', 'The campaign loop has no time limit; a fight past 20 minutes is reported as timed out.'),
  raidShield: note('raid-shield', 'Raid shield mitigation 0.5 assumed (the dungeon value): the raid constants carry none.'),
  oblivionConstants: note('oblivion-constants', 'Oblivion floors assume the dungeon tick (10 ms), shield mitigation (0.5) and 500 ms start gap: the floor config carries none.'),
  oblivionOutputCut: note('oblivion-output-cut', 'The instability output cut is off unless switched on: the client fight never applies it, and where the server does is unresolved.'),
  worldBossModel: note('world-boss-model', 'World Boss hit-back, ramp and rebound are modelled from the affinity record; the fight itself is server-run.'),
  customShield: note('custom-shield', 'Shield mitigation 0.5 assumed (the campaign and dungeon value).'),
});

const A = PVE_ASSUMPTIONS;
const pveMode = (o) => Object.freeze({
  perFightCapMs: FIGHT_CAP_MS, interMobGapMs: 0, liveLoop: false, ...o, assumptions: Object.freeze(o.assumptions),
});

/**
 * Per-mode engine settings (combat-pve.md §2, §13, §14). `dtMs` the tick; `shieldMitigation` what the
 * mode's caller stamps on the player (World Boss: the affinity record's value, read at run time);
 * `interMobGapMs` the wait before each mob, the minion respawn aged by the same amount; `perFightCapMs`
 * each mob's own cap when the caller gives no `maxMs` window; `liveLoop` the campaign loop's own rules
 * (opening 'half', mob-only spell resist, next-tick transform); `assumptions` the labels to show.
 */
export const PVE_MODES = Object.freeze({
  campaign: pveMode({
    dtMs: PVE_PROGRESS_CONSTANTS.tickIntervalMs, shieldMitigation: PVE_PROGRESS_CONSTANTS.shieldMitigation,
    liveLoop: true, assumptions: [A.campaignCap],
  }),
  dungeon: pveMode({
    dtMs: DUNGEON_TICK_MS, shieldMitigation: DUNGEON_SHIELD_MITIGATION, interMobGapMs: INTER_MOB_GAP_MS,
    assumptions: [A.serverFight],
  }),
  raid: pveMode({
    dtMs: RAID_CONSTANTS.TICK_INTERVAL_MS, shieldMitigation: DUNGEON_SHIELD_MITIGATION, interMobGapMs: INTER_MOB_GAP_MS,
    assumptions: [A.serverFight, A.raidShield],
  }),
  oblivion: pveMode({
    dtMs: DUNGEON_TICK_MS, shieldMitigation: DUNGEON_SHIELD_MITIGATION, interMobGapMs: INTER_MOB_GAP_MS,
    assumptions: [A.serverFight, A.oblivionConstants, A.oblivionOutputCut],
  }),
  worldBoss: pveMode({
    dtMs: WORLD_BOSS_CONSTANTS.tickIntervalMs, shieldMitigation: 0, assumptions: [A.serverFight, A.worldBossModel],
  }),
  custom: pveMode({ dtMs: DEFAULT_DT_MS, shieldMitigation: PVE_SHIELD_MITIGATION, assumptions: [A.customShield] }),
  dummy: pveMode({ dtMs: DEFAULT_DT_MS, shieldMitigation: PVE_SHIELD_MITIGATION, assumptions: [] }),
});

/**
 * The mode of a PVE run: `o.mode`, else the first mob's stamped `mode`, else what the spec itself says
 * (an `affinity` record is a World Boss, an `instability` an Oblivion floor), else 'custom'.
 * @param {{mode?: string}} o
 * @param {Object} [first]  the first MobSpec
 * @returns {string} a PVE_MODES key
 */
export function pveModeOf(o, first) {
  const id = o?.mode ?? first?.mode
    ?? (first?.affinity ? 'worldBoss' : first?.instability != null ? 'oblivion' : 'custom');
  if (!Object.hasOwn(PVE_MODES, id)) throw new EngineInputError(`unknown PVE mode '${id}'`, { kind: 'mode', key: 'mode', value: id });
  return id;
}

// ---------------------------------------------------------------------------------------------
// Oblivion strain
// ---------------------------------------------------------------------------------------------

// OBLIVION_DUNGEON constants, L1706694 (pve-content.md §Oblivion Dungeon)
const OBL = Object.freeze({
  pulseMs: 500,
  trueDamagePctPerPoint: 0.06,
  maxTrueDamagePctPerPulse: 12,
  rampPerSecond: 0.04,
  rampMaxMult: 2.5,
  biteMaxPct: 100,
  biteHalfPoint: 12,
  biteHealing: 0.98,
  biteRegen: 0.99,
  biteRegenHalfPoint: 6,
  outputCutMaxPct: 97,
  outputCutHalfPoint: 6,
  sustainCapPctPerSec: 1.5,
  mobAttackHpPct: 4,
  mobAttackHpCapMult: 4,
  mobAttackPerPoint: 0,
  riftDrFloor: 35,
  riftBlockCap: 15,
  riftMissCap: 10,
  riftBlindCap: 8,
});

// port of biteCurve (module 5851, L1706770-1706820): max * x / (x + half), 0 for x <= 0
const biteCurve = (x, half, max = OBL.biteMaxPct) => (x > 0 ? (max * x) / (x + half) : 0);
// port of biteMult (L1706822-1706846): clamp(1 - bite * k / 100, 0, 1)
const biteMult = (bite, k) => Math.max(0, Math.min(1, 1 - (bite * k) / 100));

// port of getInstabilityCombatState L1706880-1707000
/**
 * The Oblivion options `simulateFight` reads, built from the net strain. `effective` is
 * `oblivionEffectiveInstability(instability, power)`; `instability` is the floor's raw instability
 * (the sustain cap and the shield-overflow block are on whenever it rounds above 0).
 * `playerDamageMult` (getInstabilityOutputMult), `mobAttack*` and `defenceBand` ride along as the
 * client builds them but the shared fight loop never reads them. `simulatePve` applies
 * `playerDamageMult` only when asked (`applyOutputCut`, pve-content.md §11) and leaves the rest unused.
 * @param {number} effective
 * @param {number} instability
 */
export function oblivionCombatState(effective, instability) {
  const x = Math.max(0, effective);
  const active = Math.round(instability) > 0;
  return {
    pulseMs: OBL.pulseMs,
    trueDamagePercentPerPulse: Math.min(OBL.maxTrueDamagePctPerPulse, OBL.trueDamagePctPerPoint * x),
    rampPerSecond: OBL.rampPerSecond,
    rampMaxMult: OBL.rampMaxMult,
    healingMult: biteMult(biteCurve(x, OBL.biteHalfPoint), OBL.biteHealing),
    regenMult: biteMult(biteCurve(x, OBL.biteRegenHalfPoint), OBL.biteRegen),
    playerDamageMult: Math.max(0, 1 - biteCurve(x, OBL.outputCutHalfPoint, OBL.outputCutMaxPct) / 100),
    healCapPctPerSec: active ? OBL.sustainCapPctPerSec : 0,
    blocksShieldOverflow: active,
    defenceBand: active
      ? { drFloor: OBL.riftDrFloor, blockCap: OBL.riftBlockCap, missCap: OBL.riftMissCap, blindCap: OBL.riftBlindCap }
      : null,
    mobAttackMult: 1 + x * OBL.mobAttackPerPoint,
    mobAttackHpPercent: active ? OBL.mobAttackHpPct : 0,
    mobAttackHpCapMult: OBL.mobAttackHpCapMult,
  };
}

// ---------------------------------------------------------------------------------------------
// simulateFight
// ---------------------------------------------------------------------------------------------

/**
 * @typedef {Object} FightContext
 * @property {number} [dtMs=100]
 * @property {number} [startMs=0]       timestamp of the first tick minus dtMs
 * @property {number} [maxMs=1200000]   the fight ends when `elapsed >= maxMs` (a timeout is not a win)
 * @property {'zero'|'half'|{attackerTimer:number, defenderTimer:number, regenTimer:number}} [opening='zero']
 *   'zero' = the shared engine (all timers 0); 'half' = the live loop (mob swings after half its interval)
 * @property {Array<Object>|null} [spells]      initSpellRuntimes output (mutated)
 * @property {Array<Object>|null} [debuffs]     enemy debuff list (mutated); fresh when null
 * @property {{flux:number, flameConduit:number, earthenConduit:number, darkConduit:number}|null} [chrono]
 * @property {ReturnType<typeof createStackCombat>|null} [stacks]
 * @property {number} [thornsPercent=0]   Iron Bastion glyph thorns, added while that buff is active
 * @property {Object|null} [oblivion]     oblivionCombatState output
 * @property {Object|null} [minion]       Necromancer minion (mutated)
 * @property {boolean} [log=true]         false = no event array (the events still drive the stacks)
 * @property {boolean} [liveSpellResist=false]  spell resist = enemy.spellResist only (live loop)
 * @property {((elapsedMs:number) => Object|null)|null} [enemyAt]  per-tick enemy field overrides
 * @property {((event:Object, enemy:Object) => number)|null} [reboundFor]  extra enemy damage per event
 * @property {boolean} [liveLoop=false]  the live progress loop's transform: it fires at the top of the
 *   next tick, before the spell pass, and its heal joins the clamped spell heal (L1074747-1074773,
 *   L1074900-1074909), so a lethal tick ends the fight first
 * @property {number} [outputMult=1]  not the client's: the app's optional Oblivion output cut, applied to
 *   every damage the player side lands (swings, minion, spells, DoT ticks, thorns, rebound)
 */

/**
 * @typedef {Object} FightResult
 * @property {Array<Object>} ticks        event log (empty when `log` is false)
 * @property {number} endTime             timestamp of the last tick
 * @property {boolean} attackerWon        the enemy died
 * @property {number} hp                  player HP at the end
 * @property {number} shieldHp
 * @property {number} enemyHp
 * @property {number} damageDealt         enemy HP lost (swings, spells, DoTs, minion, thorns)
 * @property {number} damageTaken         incoming swing damage (shield-effective) plus instability damage
 */

// port of simulateFight L1087661-1089480. The client mutates `player.hp` / `player.shieldHp`; this
// returns them instead and leaves its arguments alone (apart from the objects named in FightContext).
/**
 * @param {Object} player  createPlayerEntity output (+ shieldMitigation, shieldMax, shieldHp, ...)
 * @param {Object} enemy   createMobEntity output
 * @param {FightContext} ctx
 * @param {() => number} rng
 * @returns {FightResult}
 */
export function simulateFight(player, enemy, ctx, rng) {
  const {
    dtMs = DEFAULT_DT_MS, startMs = 0, maxMs = FIGHT_CAP_MS, opening = 'zero', spells = null, chrono = null,
    stacks: stackCombat = null, thornsPercent = 0, oblivion = null, minion = null, log = true,
    liveSpellResist = false, enemyAt = null, reboundFor = null, liveLoop = false, outputMult = 1,
  } = ctx ?? {};
  // the output cut on a landed amount (a positive number)
  const cut = outputMult === 1 ? (d) => d : (d) => Math.round(d * outputMult);
  const debuffs = ctx?.debuffs ?? initDebuffState();
  const ticks = [];
  const emit = log ? (ev) => ticks.push(ev) : null;

  const chronoOn = chrono != null && (chrono.flameConduit > 0 || chrono.earthenConduit > 0 || chrono.darkConduit > 0);
  const stacksOn = stackCombat != null && stackCombat.active;
  const oblivionOn = oblivion != null && (oblivion.trueDamagePercentPerPulse > 0 || oblivion.healingMult < 1 ||
    oblivion.regenMult < 1 || oblivion.healCapPctPerSec > 0 || !!oblivion.blocksShieldOverflow);
  const healingMult = oblivionOn ? oblivion.healingMult : 1;
  const healBudget = oblivionOn && oblivion.healCapPctPerSec > 0
    ? createHealBudget(player.maxHp, oblivion.healCapPctPerSec) : null;
  const blocksShieldOverflow = oblivionOn && !!oblivion.blocksShieldOverflow;

  let hp = player.hp;
  let enemyHp = enemy.hp;
  let shield = player.shieldHp ?? 0;
  let enemyShield = enemy.shieldHp ?? 0;
  const enemyHp0 = enemyHp;
  let ts = startMs;
  let timers = { attackerTimer: 0, defenderTimer: 0, regenTimer: 0 };
  if (opening === 'half') {
    if (enemy.attackSpeed > 0) timers.defenderTimer = Math.round(Math.round(1000 / enemy.attackSpeed) / 2);
  } else if (opening && typeof opening === 'object') {
    timers = { ...opening };
  }

  let blinded = false;
  let paralyzedMs = 0;
  let silencedMs = 0;
  let staggerStacks = 0;
  let fearedMs = 0;
  let pulseAccum = 0;
  let pulseCount = 0;
  let damageTaken = 0;
  // finishMinionTick state (closure slots 5-7 of the client): damage dealt this tick, the first event
  // index of the tick, and whether the minion was alive at the start of the tick
  let tickDealt = 0;
  let tickFrom = 0;
  let minionAliveAtStart = false;

  // port of finishMinionTick L1087924-1088000
  const finishMinionTick = () => {
    if (!minion) return;
    const heal = soulLinkHeal(minion, tickDealt);
    if (heal > 0 && emit) emit({ timestamp: ts, type: 'minion_heal', damage: heal, attackerHp: hp, defenderHp: enemyHp });
    if (hp <= 0 && killMinion(minion) && emit) {
      emit({ timestamp: ts, type: 'minion_dead', damage: 0, attackerHp: hp, defenderHp: enemyHp });
    }
    if (emit && (minionAliveAtStart || minion.alive)) {
      for (let i = tickFrom; i < ticks.length; i++) ticks[i].minionHp = minion.hp;
    }
  };

  const result = (attackerWon, over = {}) => ({
    ticks,
    endTime: ts,
    attackerWon,
    hp: over.hp ?? hp,
    shieldHp: over.shieldHp ?? shield,
    enemyHp,
    damageDealt: Math.max(0, enemyHp0 - enemyHp),
    damageTaken,
  });

  if (!(hp > 0) || !(enemyHp > 0)) return result(false);

  // --- opening: a pending minion respawn is summoned before the first tick (L1087780-1087856)
  if (minion && hp > 0 && resummonIfDead(minion)) {
    const windowMs = openingSummonWindowMs([minion]);
    if (emit) {
      emit({
        timestamp: startMs, type: 'minion_summoned', damage: 0, attackerHp: hp, defenderHp: enemyHp,
        minionHp: minion.hp, ...minionSummonMeta(minion, startMs + windowMs),
      });
    }
    ts = startMs + windowMs;
    timers = {
      ...timers,
      attackerTimer: openingSwingTimerStart(Math.round(1000 / player.attackSpeed), windowMs, timers.attackerTimer),
      defenderTimer: openingSwingTimerStart(Math.round(1000 / enemy.attackSpeed), windowMs, timers.defenderTimer),
    };
    minion.timer = openingSwingTimerStart(Math.round(1000 / minion.attackSpeed), windowMs, minion.timer);
  }

  // per-tick views shared with spellsStep (declared here because that helper sits outside the loop)
  let enemyView = enemy;
  let playerView = player;
  let stackHpPct = 0;
  let buffHpPct = 0;
  let buffedMaxHp = player.maxHp;
  let totalHpPct = 0;
  let transformFired = false;
  let transformHeal = 0;

  while (hp > 0 && enemyHp > 0 && ts - startMs < maxMs) {
    ts += dtMs;

    // 1. minion respawn (L1088096-1088119)
    if (minion) {
      tickFrom = ticks.length;
      tickDealt = 0;
      if (advanceMinionRespawn(minion, dtMs) && emit) {
        emit({
          timestamp: ts, type: 'minion_summoned', damage: 0, attackerHp: hp, defenderHp: enemyHp,
          ...minionSummonMeta(minion),
        });
      }
      minionAliveAtStart = minion.alive;
    }
    // 3. heal budget refill (L1088127; runs before the instability pulse in the code)
    if (healBudget) refillHealBudget(healBudget, dtMs);

    // 2. Oblivion instability pulse (L1088142-1088208): true damage, ramping with the pulse count
    if (oblivionOn) {
      pulseAccum += dtMs;
      if (pulseAccum >= oblivion.pulseMs) {
        pulseAccum -= oblivion.pulseMs;
        const ramp = Math.min(oblivion.rampMaxMult, 1 + ((pulseCount * oblivion.pulseMs) / 1000) * oblivion.rampPerSecond);
        pulseCount += 1;
        const dmg = oblivion.trueDamagePercentPerPulse > 0
          ? Math.max(1, Math.round((player.maxHp * oblivion.trueDamagePercentPerPulse * ramp) / 100)) : 0;
        if (dmg > 0) {
          hp = Math.max(0, hp - dmg);
          damageTaken += dmg;
          if (emit) emit({ timestamp: ts, type: 'attacker_instability', damage: dmg, attackerHp: hp, defenderHp: enemyHp });
          if (hp <= 0) {
            if (emit) emit({ timestamp: ts, type: 'attacker_dead', damage: 0, attackerHp: 0, defenderHp: enemyHp });
            finishMinionTick();
            return result(false, { hp: 0, shieldHp: 0 });
          }
        }
      }
    }

    // 4. spell pass context: Bulwark's HP share and Sunder's cut of the enemy's defences (L1088209-1088279)
    stackHpPct = stacksOn ? stackCombat.selfModifiers().hpPercent : 0;
    enemyView = enemy;
    if (stacksOn) {
      const tm = stackCombat.targetModifiers();
      if (tm.drReductionPercent > 0 || tm.blindReductionPercent > 0 || tm.blockReductionPercent > 0 ||
        tm.missReductionPercent > 0 || tm.hpRegenReductionPercent > 0) {
        const s = applySunderToTarget(
          enemy.damageReduction, enemy.blindChance, enemy.blockChance, enemy.missChance, enemy.hpRegen, tm);
        enemyView = {
          ...enemy, damageReduction: s.damageReduction, blindChance: s.blindChance, blockChance: s.blockChance,
          missChance: s.missChance, hpRegen: s.hpRegen,
        };
      }
    }

    playerView = player;
    buffHpPct = 0;
    buffedMaxHp = player.maxHp;
    totalHpPct = stackHpPct;

    // live loop: a bar filled last tick fires the transform now, before the spell pass (L1074747-1074773)
    transformFired = false;
    transformHeal = 0;
    if (liveLoop && chronoOn && spells && chrono.flux >= CHRONO_FLUX.MAX) {
      const tr = triggerTransformSpell(spells, ts, hp, player.maxHp, player);
      if (tr.triggered) {
        transformFired = true;
        transformHeal = tr.ownerHpDelta;
        chrono.flux = 0;
        if (emit) {
          for (const ev of tr.events) {
            emit({ timestamp: ts, type: ev.type, damage: ev.value, attackerHp: hp, defenderHp: enemyHp, spell: ev.spell, chronoFlux: 0 });
          }
        }
      }
    }

    if (spells) {
      const sr = spellsStep();
      if (sr) return sr;
    }

    // 5. processDebuffsTick on the enemy (L1088736)
    if (debuffs.length > 0) {
      const d = processDebuffsTick(debuffs, dtMs, ts, rng);
      if (d.targetHpDelta < 0) {
        const before = enemyHp;
        enemyHp = Math.max(0, enemyHp - cut(-d.targetHpDelta));
        tickDealt += before - enemyHp;
      }
      if (emit) {
        for (const ev of d.events) {
          emit({
            timestamp: ev.timestamp,
            type: ev.type === 'debuff_tick' ? 'spell_debuff_tick' : 'spell_debuff_expired',
            damage: ev.value, attackerHp: hp, defenderHp: enemyHp, spell: ev.source,
            debuffStacks: ev.stacks, debuffMaxStacks: ev.maxStacks, debuffPermanent: ev.permanent,
            damagePerTick: ev.damagePerTick, ...(ev.isCrit ? { isCrit: true } : {}),
          });
        }
      }
      if (enemyHp <= 0) {
        if (emit) emit({ timestamp: ts, type: 'defender_dead', damage: 0, attackerHp: hp, defenderHp: 0 });
        finishMinionTick();
        return result(true);
      }
    }

    // 6. recompute self buffs: Bulwark DR / HP, Elusive, Oblivion bite, Slow on the enemy (L1088825-1088950)
    let view = playerView;
    if (stacksOn) {
      const selfMods = stackCombat.selfModifiers();
      const elusive = stackCombat.elusiveSelfModifiers();
      if (selfMods.drPercent > 0) {
        view = { ...view, damageReduction: applyBulwarkDr(view.damageReduction, selfMods) };
      }
      if (selfMods.hpPercent > 0) {
        buffedMaxHp = getBuffedMaxHp(player.maxHp, buffHpPct + selfMods.hpPercent);
        if (hp > buffedMaxHp) hp = buffedMaxHp;
      }
      if (elusive.attackPercent > 0 || elusive.critChancePercent > 0 || elusive.lifestealPercent > 0 ||
        elusive.attackSpeedPercent > 0) {
        const e = applyElusiveBuff(view.attack, view.critChance, view.lifesteal, view.attackSpeed, elusive);
        view = { ...view, attack: e.attack, critChance: e.critChance, lifesteal: e.lifesteal, attackSpeed: e.attackSpeed };
      }
    }
    if (oblivionOn) {
      view = { ...view, lifesteal: view.lifesteal * healingMult, hpRegen: view.hpRegen * oblivion.regenMult };
    }
    let enemyNow = enemyView;
    if (enemyAt) {
      const over = enemyAt(ts - startMs);
      if (over) enemyNow = { ...enemyView, ...over };
    }
    if (debuffs.length > 0) {
      const slowed = slowedAttackSpeed(enemyNow.attackSpeed, debuffs);
      if (slowed !== enemyNow.attackSpeed) enemyNow = { ...enemyNow, attackSpeed: slowed };
    }

    // 7. processCombatTick (L1088954)
    const t = processCombatTick(view, enemyNow, hp, enemyHp, timers, dtMs, ts, {
      attackerMaxHp: buffedMaxHp,
      defenderBlinded: blinded,
      defenderParalyzedMs: paralyzedMs,
      defenderSilencedMs: silencedMs,
      defenderStaggerStacks: staggerStacks,
      defenderFearedMs: fearedMs,
      attackerShieldHp: shield,
      defenderShieldHp: enemyShield,
      healBudget,
      blocksShieldOverflow,
      minion,
      attackerOutputMult: outputMult,
    }, rng);
    tickDealt += t.attackerDamageDealt;
    hp = t.attackerHp;
    enemyHp = t.defenderHp;
    timers = t.timers;
    blinded = t.defenderBlinded;
    paralyzedMs = t.defenderParalyzedMs;
    silencedMs = t.defenderSilencedMs;
    staggerStacks = t.defenderStaggerStacks;
    fearedMs = t.defenderFearedMs;
    shield = t.attackerShieldHp;
    enemyShield = t.defenderShieldHp;
    const events = t.events;
    for (const ev of events) {
      if (ev.type === 'defender_hit' || ev.type === 'attacker_dead' || ev.type === 'attacker_block' ||
        ev.type === 'attacker_miss') damageTaken += ev.damage;
    }
    if (emit) {
      if (player.shieldMax > 0) for (const ev of events) ev.attackerShieldHp = shield;
      if (enemy.shieldMax > 0) for (const ev of events) ev.defenderShieldHp = enemyShield;
    }

    // 8. Chrono Flux and the transform it fires (L1089035-1089180). The live loop charges the bar here
    // but fires it at the top of the next tick, and keeps the bar empty on the tick it fired
    // (L1076680-1076700).
    if (chronoOn) {
      const active = spells ? isTransformActive(spells) : false;
      if (!active && !transformFired) {
        const fires = spells ? transformFireCount(spells) : 0;
        chrono.flux = clampChronoFlux(chrono.flux + chronoFluxFromEvents(
          events, chrono.flameConduit, chrono.earthenConduit, chrono.darkConduit, fires));
      }
      if (!liveLoop && chrono.flux >= CHRONO_FLUX.MAX && spells && hasPendingTransform(spells)) {
        const tr = triggerTransformSpell(spells, ts, hp, player.maxHp, player);
        if (tr.triggered) {
          chrono.flux = 0;
          if (tr.ownerHpDelta > 0) {
            const want = healingMult < 1 ? Math.floor(tr.ownerHpDelta * healingMult) : tr.ownerHpDelta;
            hp += spendHealBudget(healBudget, want);
          }
          if (emit) {
            for (const ev of tr.events) {
              emit({
                timestamp: ts, type: ev.type, damage: ev.value, attackerHp: hp, defenderHp: enemyHp,
                spell: ev.spell, chronoFlux: chrono.flux,
              });
            }
          }
        }
      }
      if (emit) for (const ev of events) ev.chronoFlux = chrono.flux;
    }
    if (emit) for (const ev of events) ticks.push(ev);

    // 9. stack runtimes consume this tick's events (L1089199-1089300)
    let thorns = 0;
    let stackSnap = null;
    if (stacksOn) {
      for (const ev of events) {
        switch (ev.type) {
          case 'attacker_hit':
          case 'attacker_crit':
            stackCombat.onHitLanded();
            break;
          case 'defender_hit':
            thorns += stackCombat.hitTakenReflect(ev.damage);
            break;
          case 'attacker_dead':
            stackCombat.onHitTaken();
            break;
          case 'attacker_block':
            thorns += stackCombat.blockReflect(ev.damage);
            break;
          case 'attacker_miss':
          case 'defender_blind':
            stackCombat.onEvaded();
            break;
          default:
            break;
        }
      }
      stackCombat.tick(dtMs);
      stackSnap = stackCombat.snapshot();
      if (emit) {
        for (const ev of events) {
          ev.bulwarkStacks = stackSnap.bulwarkStacks;
          ev.sunderStacks = stackSnap.sunderStacks;
        }
      }
    }
    // 10. thorns reflect on mob-hit events (L1089306-1089397)
    if (spells) {
      let pct = activeBuffThornsPercent(spells);
      if (thornsPercent > 0 && isSpellBuffActive(spells, 'IRON_BASTION')) pct += thornsPercent;
      if (pct > 0) {
        for (const ev of events) if (ev.type === 'defender_hit') thorns += Math.round((ev.damage * pct) / 100);
      }
    }
    if (reboundFor) for (const ev of events) thorns += reboundFor(ev, enemyNow);
    thorns = cut(thorns);
    if (thorns > 0 && enemyHp > 0 && hp > 0) {
      const before = enemyHp;
      enemyHp = Math.max(0, enemyHp - thorns);
      tickDealt += before - enemyHp;
      if (emit) {
        emit({
          timestamp: ts, type: 'thorns_reflect', damage: thorns, attackerHp: hp, defenderHp: enemyHp,
          bulwarkStacks: stackSnap?.bulwarkStacks ?? 0, sunderStacks: stackSnap?.sunderStacks ?? 0,
        });
        if (enemyHp <= 0) {
          emit({
            timestamp: ts, type: 'defender_dead', damage: 0, attackerHp: hp, defenderHp: 0,
            bulwarkStacks: stackSnap?.bulwarkStacks ?? 0, sunderStacks: stackSnap?.sunderStacks ?? 0,
          });
        }
      }
    }
    finishMinionTick();

    // 11. end check (L1089416-1089457)
    if (enemyHp <= 0) return result(true);
    if (hp <= 0) return result(false, { hp: 0, shieldHp: 0 });
  }
  return result(false);

  // 4. the spell pass and everything it applies (L1088292-1088735). Returns a FightResult when the
  // enemy dies to a spell (the swing is pre-empted), else null. Reads and writes the loop's state.
  function spellsStep() {
    const res = processSpellsTick(spells, {
      maxHp: player.maxHp,
      dtMs,
      timestamp: ts,
      attack: player.attack,
      healReductionPercent: 0,
      hp,
      enemyHp,
      enemyMaxHp: enemy.maxHp,
      offensiveConditions: false,
      selfConditionsMet: false,
      spellDamage: player.spellDamage,
      targetSpellResist: liveSpellResist ? enemyView.spellResist : enemyView.spellResist + enemyView.damageReduction,
      spellCritChance: player.spellCritChance,
      critDamage: player.critDamage,
      spellVamp: player.spellVamp,
      silencedMs: 0,
      healingMult: 1,
      healBaseMaxHp: 0,
      minionAlive: isMinionAlive(minion),
    }, rng);
    const minionEvents = routeSpellHealToMinion(minion, res, player.maxHp);
    // live loop: the transform's heal joins the spell heal and its clamp (L1074900-1074909)
    if (transformHeal > 0) res.ownerHpDelta += transformHeal;
    const bm = res.buffModifiers;
    playerView = hasActiveBuffs(bm) ? applyBuffsToEntity(player, bm) : player;
    buffHpPct = bm.hpPercent;
    totalHpPct = bm.hpPercent + stackHpPct;
    buffedMaxHp = getBuffedMaxHp(player.maxHp, totalHpPct);

    if (res.ownerHpDelta > 0) {
      const prev = hp;
      const want = healingMult < 1 ? Math.floor(res.ownerHpDelta * healingMult) : res.ownerHpDelta;
      const granted = spendHealBudget(healBudget, want);
      hp = Math.min(buffedMaxHp, hp + granted);
      const refillEv = healingMult < 1
        ? {
          ownerHpDelta: granted,
          ownerVampHeal: Math.floor(res.ownerVampHeal * healingMult),
          ownerShieldRefill: Math.floor((res.ownerShieldRefill ?? 0) * healingMult),
        }
        : res;
      const raw = blocksShieldOverflow
        ? (refillEv.ownerShieldRefill ?? 0)
        : shieldRefillAmount(refillEv, hp - prev, player.shieldVampAlwaysRefills);
      const refill = spendHealBudget(healBudget, raw);
      if (refill > 0 && player.shieldMax > 0 && shield < player.shieldMax) {
        shield = Math.min(player.shieldMax, shield + refill);
      }
    }
    if (totalHpPct <= 0 && hp > player.maxHp) hp = player.maxHp;

    if (res.targetHpDelta < 0) {
      const before = enemyHp;
      enemyHp = Math.max(0, enemyHp - cut(-res.targetHpDelta));
      tickDealt += before - enemyHp;
    }
    if (res.targetParalyzeMs && enemyHp > 0) {
      paralyzedMs = Math.max(paralyzedMs, res.targetParalyzeMs);
      if (emit) {
        emit({
          timestamp: ts, type: 'defender_paralyzed', damage: 0, attackerHp: hp, defenderHp: enemyHp,
          paralyzeMs: res.targetParalyzeMs,
        });
      }
    }
    if (res.targetSilenceMs && enemyHp > 0) {
      silencedMs = Math.max(silencedMs, res.targetSilenceMs);
      if (emit) emit({ timestamp: ts, type: 'defender_silenced', damage: 0, attackerHp: hp, defenderHp: enemyHp });
    }
    if (res.targetFearMs && enemyHp > 0) {
      fearedMs = Math.max(fearedMs, res.targetFearMs);
      if (emit) {
        emit({
          timestamp: ts, type: 'defender_feared', damage: 0, attackerHp: hp, defenderHp: enemyHp, fearMs: res.targetFearMs,
        });
      }
    }
    if (res.targetBlinded && enemyHp > 0) {
      if (emit) emit({ timestamp: ts, type: 'defender_blinded', damage: 0, attackerHp: hp, defenderHp: enemyHp });
      blinded = true;
    }
    if (res.newDebuffs) {
      for (const spec of res.newDebuffs) {
        const applied = applyDebuff(debuffs, spec, ts);
        if (emit) {
          emit({
            timestamp: ts,
            type: applied.type === 'debuff_applied' ? 'spell_debuff_applied' : 'spell_debuff_stack',
            damage: 0, attackerHp: hp, defenderHp: enemyHp, spell: applied.source, debuffStacks: applied.stacks,
            debuffMaxStacks: applied.maxStacks, debuffPermanent: applied.permanent, damagePerTick: applied.damagePerTick,
          });
        }
      }
    }
    if (emit) {
      for (const ev of res.events) {
        emit({
          timestamp: ev.timestamp, type: ev.type, damage: ev.value, attackerHp: hp, defenderHp: enemyHp,
          spell: ev.spell, ...(ev.isCrit ? { isCrit: true } : {}),
          ...(res.ownerMomentumStacks !== undefined ? { momentumStacks: res.ownerMomentumStacks } : {}),
        });
      }
      for (const ev of minionEvents) {
        emit({
          timestamp: ev.timestamp, type: ev.type, damage: ev.healed, attackerHp: hp, defenderHp: enemyHp,
          spell: ev.spell, ...(ev.minionMaxHp !== undefined ? { minionMaxHp: ev.minionMaxHp } : {}),
        });
      }
    }
    if (enemyHp <= 0) {
      if (emit) emit({ timestamp: ts, type: 'defender_dead', damage: 0, attackerHp: hp, defenderHp: 0 });
      finishMinionTick();
      return result(true);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// World boss
// ---------------------------------------------------------------------------------------------

/**
 * Hit-back of the World Boss, from the affinity record that `worldBossMob` carries. The fight itself is
 * [SERVER] (combat-pve.md §16: ramp formulas and rebound are [UNRESOLVED]), so these rules are modelling
 * choices, not game facts:
 *  - the boss hits for `hitDamagePctOfMaxHp` % of the player's max HP, at `baseAttackSpeed`;
 *  - from `frenzyStartMs` its damage grows by `damageRampPerSec` (a fraction per second, so 0.03 = +3 %
 *    of the base hit per second) and its attack speed by `attackSpeedRampPerSec`, up to `maxAttackSpeed`;
 *  - `avoidedReboundPct` % of every hit the player blocks or dodges is dealt back (the would-be hit,
 *    before the player's DR);
 *  - `penetrationPiercesSpellResist` needs no extra rule: Penetration already pierces a Block roll in
 *    processCombatTick, and the spell resist is the mob's `spellResist`;
 *  - the player's shield mitigation is the record's `shieldMitigation` (0), set by `simulatePve`.
 * @param {Object} affinity  world-boss.json affinity record
 * @param {number} playerMaxHp
 * @returns {{enemyAt: (elapsedMs:number) => Object|null, reboundFor: ((ev:Object, enemy:Object) => number)|null}|null}
 */
export function worldBossHooks(affinity, playerMaxHp) {
  if (!affinity || !(affinity.hitDamagePctOfMaxHp > 0)) return null;
  const base = (playerMaxHp * affinity.hitDamagePctOfMaxHp) / 100;
  const enemyAt = (elapsedMs) => {
    const frenzy = Math.max(0, elapsedMs - (affinity.frenzyStartMs ?? 0)) / 1000;
    const dmgMult = 1 + (affinity.damageRampPerSec ?? 0) * frenzy;
    const speed = Math.min(
      affinity.maxAttackSpeed > 0 ? affinity.maxAttackSpeed : Infinity,
      affinity.baseAttackSpeed + (affinity.attackSpeedRampPerSec ?? 0) * frenzy,
    );
    return { attack: Math.round(base * dmgMult), attackSpeed: speed };
  };
  const pct = affinity.avoidedReboundPct ?? 0;
  const reboundFor = pct > 0
    ? (ev, enemy) => (ev.type === 'attacker_block' || ev.type === 'attacker_miss' ? Math.round((enemy.attack * pct) / 100) : 0)
    : null;
  return { enemyAt, reboundFor };
}

// ---------------------------------------------------------------------------------------------
// Fighter -> engine inputs
// ---------------------------------------------------------------------------------------------

/**
 * The sigil slice `spellConfig` and `sigilPassive` read, from a Fighter. An Ancient counts as an
 * equipped generic sigil; a Druid's slots go to the `druid*` fields.
 * @param {import('../types.js').Fighter} fighter
 */
export function sigilStateOf(fighter) {
  const generic = (fighter.sigils ?? []).map((s) => s.species);
  const ancient = fighter.ancient ?? null;
  const equipped = ancient ? [...generic, ancient.species] : generic;
  const utility = fighter.utility ?? null;
  const owned = [...(fighter.sigils ?? []), ...(utility ? [utility] : []), ...(ancient ? [ancient] : [])]
    .map((s) => ({ species: s.species, level: s.level, activationCondition: fighter.conditions?.[s.species] }));
  const druid = fighter.class === 'MYSTIC' && fighter.spec === 'MYSTIC_DRUID';
  return {
    ownedSigils: owned,
    equippedSpecies: druid ? [] : equipped,
    druidEquippedSpecies: druid ? equipped : [],
    utilitySlotSpecies: druid ? null : utility?.species ?? null,
    druidUtilitySlotSpecies: druid ? utility?.species ?? null : null,
    altarTier: fighter.altarTier ?? 1,
  };
}

/** The player entity fields the PVE engine reads (tick, spell pass, buffs, transforms), all numbers. */
export const PVE_PLAYER_KEYS = Object.freeze([
  'maxHp', 'attack', 'attackSpeed', 'doubleHit', 'critChance', 'critDamage', 'lifesteal', 'hpRegen',
  'damageReduction', 'blockChance', 'missChance', 'blindChance', 'paralyzeChance', 'penetration',
  'disruptionChance', 'spellDamage', 'spellResist', 'spellCritChance', 'spellVamp',
]);
/** The mob entity fields the PVE engine reads. */
const PVE_MOB_KEYS = Object.freeze([
  'maxHp', 'attack', 'attackSpeed', 'critChance', 'critDamage', 'lifesteal', 'hpRegen', 'damageReduction',
  'blockChance', 'missChance', 'blindChance', 'penetration', 'spellResist',
]);
// the sheet keys createMinion reads (classes.md §7)
const MINION_STAT_KEYS = Object.freeze([
  'totalMinionAttack', 'totalMinionHealth', 'totalMinionAttackSpeed', 'totalMinionCritChance',
  'totalMinionLifesteal', 'totalSoulLink',
]);

/**
 * Everything about a Fighter that does not change between fights, resolved once into `inputs`: a plain
 * object holding exactly what the fight reads (the player entity fields, spell configs after glyphs, form
 * and spec, shield, summon and the minion's sheet keys, stack config, conduits, thorns; conditions sit in
 * the spell configs). `fresh()` reads only `inputs` and returns the mutable per-fight state (player
 * entity, spell runtimes, a not-yet-summoned minion, stack combat, Chrono Flux bar). The minion is
 * summoned by the first fight's opening, with its cast window (combat-pve.md §12).
 * @param {import('../types.js').Fighter} fighter
 * @returns {{fighter: Object, formKind: string|null, inputs: Object, fresh: () => Object}}
 */
export function preparePveFighter(fighter) {
  const stats = fighter?.stats;
  if (stats == null || typeof stats !== 'object') throw new EngineInputError('fighter.stats is missing', { kind: 'fighter', key: 'stats' });
  const cls = fighter.class;
  const spec = fighter.spec ?? null;
  const state = sigilStateOf(fighter);
  const { mods, combat } = glyphCombatMods(fighter.glyphMods ?? [], cls, spec);
  const formCfg = getEquippedFormConfig(state, cls, spec);
  const formKind = formCfg?.form ?? null;
  const entity = createPlayerEntity(stats);
  assertPositive('player', entity, ['maxHp', 'attack', 'attackSpeed']);
  assertFiniteEntity('player', entity, PVE_PLAYER_KEYS);
  const player = { disruptionEffect: entity.disruptionEffect };
  for (const k of PVE_PLAYER_KEYS) player[k] = entity[k];
  const summon = getEquippedSummonConfig(state);
  const minionStats = {};
  if (summon) for (const k of MINION_STAT_KEYS) minionStats[k] = stats[k] ?? 0;
  assertFiniteEntity('player', minionStats, Object.keys(minionStats));
  const conduits = {
    flame: stats.totalFlameConduit ?? 0, earthen: stats.totalEarthenConduit ?? 0, dark: stats.totalDarkConduit ?? 0,
  };
  assertFiniteEntity('conduits', conduits, ['flame', 'earthen', 'dark']);
  const inputs = {
    player,
    spells: buildCombatSpells(state, cls, spec, formKind, mods),
    shield: getEquippedShieldConfig(state, spec, mods),
    summon,
    minionStats,
    stack: {
      equipped: state.druidEquippedSpecies.length > 0 ? state.druidEquippedSpecies : state.equippedSpecies,
      glyph: combat.stack,
      ctx: { playerClass: cls, activeSpec: spec, form: formKind },
    },
    conduits,
    thornsPercent: combat.ironBastionThornsPercent,
  };
  return {
    fighter,
    formKind,
    inputs,
    fresh() {
      const { shield, conduits: c } = inputs;
      const p = { ...inputs.player, hp: inputs.player.maxHp, shieldHp: 0, shieldMax: 0 };
      if (shield.hpPercent > 0) {
        p.shieldMax = Math.floor((p.maxHp * shield.hpPercent) / 100);
        p.shieldHp = p.shieldMax;
      }
      p.shieldVampAlwaysRefills = shield.vampAlwaysRefills;
      p.shieldRegenAlwaysRefills = shield.regenAlwaysRefills;
      const sc = createStackCombat(inputs.stack.equipped, true, inputs.stack.glyph, inputs.stack.ctx);
      return {
        player: p,
        spells: inputs.spells.length > 0 ? initSpellRuntimes(inputs.spells) : null,
        minion: createMinion(inputs.summon, p, inputs.minionStats),
        stacks: sc.active ? sc : null,
        chrono: c.flame > 0 || c.earthen > 0 || c.dark > 0
          ? { flux: 0, flameConduit: c.flame, earthenConduit: c.earthen, darkConduit: c.dark } : null,
        thornsPercent: inputs.thornsPercent,
      };
    },
  };
}

/**
 * Enemy entity from a MobSpec: createMobEntity plus the optional crit fields and any numeric
 * `stats` entry that names an entity field (spellResist, missChance, ...).
 * @param {import('../types.js').MobSpec} mob
 */
export function mobEntityOf(mob) {
  const e = createMobEntity(mob);
  if (mob.critChance != null) e.critChance = mob.critChance;
  if (mob.critDamage != null) e.critDamage = mob.critDamage;
  if (mob.missChance != null) e.missChance = mob.missChance;
  for (const [k, v] of Object.entries(mob.stats ?? {})) {
    if (typeof v === 'number' && Object.hasOwn(e, k)) e[k] = v;
  }
  return e;
}

/** A target that never hits back and does not die inside any fight length. */
export const trainingDummy = (hp = 1e15) => ({ id: 'dummy', hp, attack: 0, attackSpeed: 0 });

/**
 * @typedef {Object} PveOptions
 * @property {import('../types.js').Fighter|{fighter: Object, fresh: Function}} fighter  a Fighter, or
 *   a `preparePveFighter` result (reuse it across the fights of a metric)
 * @property {import('../types.js').MobSpec|import('../types.js').MobSpec[]} enemy  one mob, or mobs fought
 *   in order with HP, spells, stacks and the minion carried over (a campaign level or dungeon step)
 * @property {string} [mode]  a PVE_MODES key; default `pveModeOf`
 * @property {number} [maxMs]  one shared window over the whole sequence (dps / survival windows, World
 *   Boss, custom). Without it every mob gets its own cap: its `fightDurationMs`, else the mode's
 * @property {number} [dtMs]  overrides the mode's tick (tests)
 * @property {'zero'|'half'} [opening]  overrides the mode's opening (tests)
 * @property {boolean} [liveSpellResist]  overrides the mode's spell resist rule (tests)
 * @property {Object|{power?: number}|null} [oblivion]  an `oblivionCombatState`, or `{power}` to build it
 *   from the enemy's `instability` (Oblivion floor mobs)
 * @property {boolean} [applyOutputCut=false]  apply the Oblivion `playerDamageMult` to all player-side
 *   damage (an assumption, pve-content.md §11; the client fight never applies it)
 * @property {() => number} rng
 * @property {boolean} [log=false]
 */

/**
 * @typedef {Object} PveRunResult
 * @property {boolean} won            every mob died
 * @property {number} timeMs          timestamp the run ended (gaps and summon windows included)
 * @property {number} damageDealt
 * @property {number} damageTaken
 * @property {number} hpLeft
 * @property {number} enemyHpLeft
 * @property {number} mobsDefeated
 * @property {boolean} timedOut       a cap or the window ended the run with the player alive
 * @property {string} mode            the PVE_MODES key used
 * @property {Array<Object>} [log]
 */

// the client's shared fight, run per mode (simulateDungeonStep L1671071-1671135 for the dungeon family,
// the live progress loop L1077281-1077640 for the campaign), wrapped for the metrics (rebuild-plan §2.3)
/**
 * One PVE fight (or a sequence of mobs) between a Fighter and a MobSpec. World Boss mobs (those carrying
 * an `affinity`) get their hit-back from `worldBossHooks`.
 * @param {PveOptions} o
 * @returns {PveRunResult}
 */
export function simulatePve(o) {
  const mobs = Array.isArray(o.enemy) ? o.enemy : [o.enemy];
  if (mobs.length === 0) throw new EngineInputError('the enemy list is empty', { kind: 'enemy' });
  const enemies = mobs.map((mob, i) => {
    const kind = mobs.length > 1 ? `mob ${i + 1}` : 'mob';
    if (mob == null || typeof mob !== 'object') throw new EngineInputError(`${kind} is missing`, { kind });
    const e = mobEntityOf(mob);
    assertPositive(kind, e, ['maxHp']);
    assertFiniteEntity(kind, e, PVE_MOB_KEYS);
    return e;
  });
  const modeId = pveModeOf(o, mobs[0]);
  const mode = PVE_MODES[modeId];
  const { rng, log = false } = o;
  const dtMs = o.dtMs ?? mode.dtMs;
  const opening = o.opening ?? (mode.liveLoop ? 'half' : 'zero');
  const liveSpellResist = o.liveSpellResist ?? mode.liveLoop;
  const gapMs = mode.interMobGapMs;
  if (!o.fighter) throw new EngineInputError('the fighter is missing', { kind: 'fighter' });
  const prepared = o.fighter.fresh ? o.fighter : preparePveFighter(o.fighter);

  let obl = null;
  const first = mobs[0];
  if (o.oblivion) {
    obl = o.oblivion.pulseMs != null
      ? o.oblivion
      : oblivionCombatState(
        Math.max(0, Math.round(first.instability ?? 0) - Math.round(o.oblivion.power ?? 0)), first.instability ?? 0);
  }
  const outputMult = obl && o.applyOutputCut === true ? obl.playerDamageMult ?? 1 : 1;
  const f = prepared.fresh();
  // the mode's caller sets the mitigation (combat-pve.md §13); the World Boss reads its affinity record
  f.player.shieldMitigation = modeId === 'worldBoss'
    ? first.affinity?.shieldMitigation ?? mode.shieldMitigation
    : mode.shieldMitigation;

  const windowMs = o.maxMs;
  let player = f.player;
  let elapsed = 0;
  let damageDealt = 0;
  let damageTaken = 0;
  let defeated = 0;
  let enemyHpLeft = 0;
  const logOut = log ? [] : undefined;
  let lost = false;
  let timedOut = false;

  for (let i = 0; i < mobs.length; i++) {
    const mob = mobs[i];
    const enemy = enemies[i];
    if (lost || timedOut) {
      enemyHpLeft += enemy.hp;
      continue;
    }
    // the dungeon family waits before every mob and ages a pending minion respawn by the same amount;
    // a living minion is left as it is in every mode (L1671080-1671084; live loop L1077281-1077640)
    const startMs = elapsed + gapMs;
    if (gapMs > 0 && f.minion) elapseMinionRespawn(f.minion, gapMs);
    if (i > 0) f.stacks?.resetTarget();
    const maxMs = windowMs != null ? windowMs - startMs : mob.fightDurationMs ?? mode.perFightCapMs;
    if (!(maxMs > 0)) {
      elapsed = windowMs;
      timedOut = true;
      enemyHpLeft += enemy.hp;
      continue;
    }
    const wb = mob.affinity ? worldBossHooks(mob.affinity, player.maxHp) : null;
    const r = simulateFight(player, enemy, {
      dtMs, startMs, maxMs, opening, spells: f.spells, chrono: f.chrono, stacks: f.stacks,
      thornsPercent: f.thornsPercent, oblivion: obl, minion: f.minion, log, liveSpellResist,
      liveLoop: mode.liveLoop, outputMult, enemyAt: wb?.enemyAt ?? null, reboundFor: wb?.reboundFor ?? null,
    }, rng);
    elapsed = r.endTime;
    damageDealt += r.damageDealt;
    damageTaken += r.damageTaken;
    enemyHpLeft += r.enemyHp;
    if (logOut) for (const ev of r.ticks) logOut.push(ev);
    player = { ...player, hp: r.hp, shieldHp: r.shieldHp };
    if (r.attackerWon) defeated += 1;
    else if (r.hp <= 0) lost = true;
    else timedOut = true;
  }

  const out = {
    won: defeated === mobs.length,
    timeMs: elapsed,
    damageDealt,
    damageTaken,
    hpLeft: player.hp,
    enemyHpLeft,
    mobsDefeated: defeated,
    timedOut,
    mode: modeId,
  };
  if (logOut) out.log = logOut;
  return out;
}
