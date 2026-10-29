// PVE combat tick: regen pulse, player swing, minion swing and enemy swing, in that order.
// Rules and the per-swing resolution order: Game/combat-pve.md §4-§8, §12, §13.
// Draw order is behaviour (rebuild-plan §6); the draws of one call are, in order:
//   player swing:  negate (iff block+miss > 0) -> crit -> double hit (iff doubleHit > 0)
//                  [negated: penetration crit (iff pen > 0, enemy miss 0, crit > 0)]
//                  -> blind -> paralyze -> disruption (each only when its gate holds)
//   minion swing:  crit (iff minion crit > 0)
//   enemy swing:   (status branches: none) | minion target: crit (always)
//                  | player target: negate (iff block+miss > 0) -> crit (always)
//                  [negated: penetration crit (iff enemy crit > 0)]
// That order holds for a plain rng. A lane rng (engine/rng.js laneRng) splits the draws by actor
// ('player', 'minion', 'enemy') and purpose ('avoid', 'crit', 'double', 'blind', 'paralyze',
// 'disrupt'), so the order within each lane is the order above.
// Silence has no consumer in the PVE engine: it is stored, counted down and returned, but nothing in
// processCombatTick or the shared fight loop reads it (the spell pass is fed silencedMs 0).
import { rollStanceDaze, dazedMissChance, rollShieldBash, tickDazedMs } from '../core/stances.js';
import {
  applyDamageReduction,
  rollAttackDamage,
  rollPenetrationCritMult,
  rollDisruption,
  PARALYZE_DURATION_MS,
  STAGGER_STUN_MS,
  FEAR_DURATION_MS,
} from '../core/rolls.js';
import { absorbWithShield, regenShieldRefillAmount, spendHealBudget } from '../core/shield.js';
import { lane } from '../rng.js';
import {
  minionSwing,
  mitigateMinionHit,
  healMinion,
  healMinionLifesteal,
  damageMinion,
  endMinionEmpower,
  endMinionFrenzy,
  endMinionBastion,
  rollMinionReap,
  REAP_STUN_SOURCE,
  minionDeathMeta,
} from '../core/minions.js';

/** Regen pulse interval (module closure constant, combat-pve.md §7). */
export const REGEN_INTERVAL_MS = 100;
/** Pulses per second: a pulse is `maxHp * hpRegen / 100 / 10`. */
export const REGEN_PULSES_PER_SEC = 10;

/**
 * @typedef {Object} TickTimers
 * @property {number} attackerTimer
 * @property {number} defenderTimer
 * @property {number} regenTimer
 */

/**
 * Optional state of processCombatTick (the client's positional arguments 7-17).
 * @typedef {Object} TickOptions
 * @property {number|null} [attackerMaxHp]  clamp for regen/lifesteal; null/undefined = player.maxHp
 * @property {boolean} [defenderBlinded=false]
 * @property {number} [defenderDazedMs=0]
 * @property {number} [defenderParalyzedMs=0]
 * @property {number} [defenderSilencedMs=0]
 * @property {number} [defenderStaggerStacks=0]
 * @property {number} [defenderFearedMs=0]
 * @property {number} [attackerShieldHp=0]
 * @property {number} [defenderShieldHp=0]
 * @property {{remaining:number, perMs:number, max:number}|null} [healBudget=null]  Oblivion heal cap
 * @property {boolean} [blocksShieldOverflow=false]  Oblivion: regen overflow does not refill the shield
 * @property {Object|null} [minion=null]  Necromancer minion (core/minions.js)
 * @property {number} [attackerOutputMult=1]  not the client's: the app's optional Oblivion output cut,
 *   applied to the player's and the minion's landed damage (pve-content.md §11), times the World Boss
 *   wrath cut while it holds
 * @property {number} [attackerReflectMult]  the cut on reflected damage (minion thorns); defaults to
 *   attackerOutputMult. The World Boss wrath cut leaves reflects alone (combat-pve.md §16)
 */

/**
 * @typedef {Object} TickResult
 * @property {number} attackerHp
 * @property {number} defenderHp
 * @property {TickTimers} timers
 * @property {Array<Object>} events  {timestamp, type, damage, attackerHp, defenderHp, ...extra}
 * @property {boolean} defenderBlinded
 * @property {number} defenderDazedMs
 * @property {number} defenderParalyzedMs
 * @property {number} defenderSilencedMs
 * @property {number} defenderStaggerStacks
 * @property {number} defenderFearedMs
 * @property {number} attackerShieldHp
 * @property {number} defenderShieldHp
 * @property {number} attackerDamageDealt  player swing damage only, pre-shield; minion hits excluded
 */

/**
 * `max(1, round(d * (1 - dr/100)))` whenever dr > 0. The penetration and enemy-swing paths inline this
 * without the `d > 0` guard that applyDamageReduction has (L1086793-1086807, L1087004-1087018,
 * L1087129-1087143), so a 0 damage becomes 1 there.
 */
function mitigateInline(d, dr) {
  return dr > 0 ? Math.max(1, Math.round(d * (1 - dr / 100))) : d;
}

// The helpers below are module functions rather than per-tick closures (no allocation per tick).

/** The app's optional output cut on a landed amount (1 = off). */
const cutBy = (d, mult) => (mult === 1 ? d : Math.round(d * mult));

/** The player's lifesteal on `damage`, clamped to `maxHp` and the Oblivion heal budget; the new HP. */
function lifestealHeal(player, maxHp, healBudget, hpNow, damage) {
  if (!(player.lifesteal > 0 && hpNow < maxHp)) return hpNow;
  const want = Math.min(Math.floor((damage * player.lifesteal) / 100), maxHp - hpNow);
  const granted = spendHealBudget(healBudget, want);
  return granted > 0 ? Math.min(maxHp, hpNow + granted) : hpNow;
}

/** The enemy's lifesteal on `damage`, clamped to its max HP; the new HP. */
function enemyLifesteal(enemy, hpNow, damage) {
  if (!(enemy.lifesteal > 0 && hpNow < enemy.maxHp)) return hpNow;
  const h = Math.floor((damage * enemy.lifesteal) / 100);
  return h > 0 ? Math.min(enemy.maxHp, hpNow + h) : hpNow;
}

/** The TickResult (see processCombatTick). */
function tickResult(atkHp, defHp, attackerTimer, defenderTimer, regenTimer, events, blinded, paralyzedMs, silencedMs,
  staggerStacks, feared, atkShield, defShield, dealt, dazedMs) {
  return {
    attackerHp: atkHp,
    defenderHp: defHp,
    timers: { attackerTimer, defenderTimer, regenTimer },
    events,
    defenderDazedMs: dazedMs,
    defenderBlinded: blinded,
    defenderParalyzedMs: paralyzedMs,
    defenderSilencedMs: silencedMs,
    defenderStaggerStacks: staggerStacks,
    defenderFearedMs: feared,
    attackerShieldHp: atkShield,
    defenderShieldHp: defShield,
    attackerDamageDealt: dealt,
  };
}

// port of processCombatTick L1086167-1087434
/**
 * One combat tick. `player` is the attacker entity, `enemy` the defender entity; HP is passed and
 * returned explicitly (the entities' own `hp` fields are not read). Mutates only `opts.minion` and
 * `opts.healBudget`; the returned object carries every other piece of new state.
 * @param {import('../core/entity.js').Entity & {shieldMitigation?: number, shieldRegenAlwaysRefills?: boolean}} player
 * @param {import('../core/entity.js').Entity} enemy
 * @param {number} attackerHp
 * @param {number} defenderHp
 * @param {TickTimers} timers
 * @param {number} dtMs
 * @param {number} timestamp
 * @param {TickOptions} opts
 * @param {() => number} rng
 * @returns {TickResult}
 */
export function processCombatTick(player, enemy, attackerHp, defenderHp, timers, dtMs, timestamp, opts, rng) {
  const {
    attackerMaxHp,
    defenderDazedMs = 0,
    defenderBlinded = false,
    defenderParalyzedMs = 0,
    defenderSilencedMs = 0,
    defenderStaggerStacks = 0,
    defenderFearedMs = 0,
    attackerShieldHp = 0,
    defenderShieldHp = 0,
    healBudget = null,
    blocksShieldOverflow = false,
    minion = null,
    attackerOutputMult = 1,
    attackerReflectMult = attackerOutputMult,
  } = opts ?? {};
  const maxHp = attackerMaxHp == null ? player.maxHp : attackerMaxHp;

  let dazedMs = tickDazedMs(defenderDazedMs, dtMs);
  let paralyzedMs = Math.max(0, defenderParalyzedMs - dtMs);
  let silencedMs = Math.max(0, defenderSilencedMs - dtMs);
  let feared = Math.max(0, defenderFearedMs - dtMs);
  let staggerStacks = defenderStaggerStacks;
  let blinded = defenderBlinded;

  const attackerTimerAcc = timers.attackerTimer + dtMs;
  const defenderTimerAcc = timers.defenderTimer + dtMs;
  const regenTimerAcc = timers.regenTimer + dtMs;
  const events = [];
  const playerInterval = Math.round(1000 / player.attackSpeed);
  const enemyInterval = Math.round(1000 / enemy.attackSpeed);

  // --- regen pulse (L1086337-1086420): amount from player.maxHp, clamp from attackerMaxHp
  const regenTimer = regenTimerAcc >= REGEN_INTERVAL_MS ? regenTimerAcc - REGEN_INTERVAL_MS : regenTimerAcc;
  let atkHp = attackerHp;
  let atkShield = attackerShieldHp;
  if (regenTimerAcc >= REGEN_INTERVAL_MS && player.hpRegen > 0) {
    const pulse = Math.max(1, Math.round((player.maxHp * player.hpRegen) / 100 / REGEN_PULSES_PER_SEC));
    const applied = attackerHp < maxHp ? Math.min(maxHp - attackerHp, pulse) : 0;
    const granted = spendHealBudget(healBudget, applied);
    if (granted > 0) {
      atkHp = attackerHp + granted;
      events.push({ timestamp, type: 'attacker_regen', damage: 0, attackerHp: atkHp, defenderHp });
    }
    const refill = blocksShieldOverflow
      ? 0
      : spendHealBudget(healBudget, regenShieldRefillAmount(pulse, applied, player.shieldRegenAlwaysRefills));
    if (refill > 0 && player.shieldMax > 0 && attackerShieldHp < player.shieldMax) {
      atkShield = Math.min(player.shieldMax, attackerShieldHp + refill);
    }
  }

  // --- player swing (L1086422-1086884)
  let defHp = defenderHp;
  let defShield = defenderShieldHp;
  let dealt = 0;
  let attackerTimer = attackerTimerAcc;



  if (attackerTimerAcc >= playerInterval) {
    attackerTimer = attackerTimerAcc - playerInterval;
    const P = lane(rng, 'player');
    const miss = dazedMissChance(enemy.missChance, dazedMs, player);
    const negate = enemy.blockChance + miss;
    const negated = negate > 0 ? lane(P, 'avoid')() * 100 < negate : false;
    if (!negated) {
      const roll = rollAttackDamage(player, P);
      const d1 = cutBy(applyDamageReduction(roll.damage, enemy.damageReduction), attackerOutputMult);
      const d2 = cutBy(applyDamageReduction(roll.doubleHitDamage, enemy.damageReduction), attackerOutputMult);
      const s1 = absorbWithShield(defShield, d1);
      defShield = s1.shieldHp;
      defHp = Math.max(0, defenderHp - s1.hpDamage);
      dealt = 0 + d1;
      atkHp = lifestealHeal(player, maxHp, healBudget, atkHp, d1);
      events.push({
        timestamp,
        type: roll.isCrit ? 'attacker_crit' : 'attacker_hit',
        damage: d1,
        attackerHp: atkHp,
        defenderHp: defHp,
      });
      if (roll.isDoubleHit && defHp > 0) {
        const s2 = absorbWithShield(defShield, d2);
        defShield = s2.shieldHp;
        defHp = Math.max(0, defHp - s2.hpDamage);
        dealt += d2;
        atkHp = lifestealHeal(player, maxHp, healBudget, atkHp, d2);
        events.push({ timestamp, type: 'attacker_hit', damage: d2, attackerHp: atkHp, defenderHp: defHp, doubleHit: true });
      }
      if (player.blindChance > 0 && !blinded && defHp > 0 && lane(P, 'blind')() * 100 < player.blindChance) {
        events.push({ timestamp, type: 'defender_blinded', damage: 0, attackerHp: atkHp, defenderHp: defHp });
        blinded = true;
      }
      if (player.paralyzeChance > 0 && paralyzedMs <= 0 && defHp > 0 && lane(P, 'paralyze')() * 100 < player.paralyzeChance) {
        paralyzedMs = PARALYZE_DURATION_MS;
        events.push({ timestamp, type: 'defender_paralyzed', damage: 0, attackerHp: atkHp, defenderHp: defHp });
      }
      if (player.disruptionChance > 0 && defHp > 0) {
        const rd = rollDisruption(player, silencedMs, staggerStacks, feared, P);
        if (rd?.procced) {
          silencedMs = rd.silencedMs;
          staggerStacks = rd.staggerStacks;
          feared = rd.fearedMs;
          if (rd.procced === 'SILENCE') {
            events.push({ timestamp, type: 'defender_silenced', damage: 0, attackerHp: atkHp, defenderHp: defHp });
          } else if (rd.procced === 'STAGGER') {
            events.push({
              timestamp, type: 'defender_staggered', damage: 0, attackerHp: atkHp, defenderHp: defHp,
              staggerStacks: rd.staggerStacks,
            });
            if (rd.staggerStunned) {
              paralyzedMs = Math.max(paralyzedMs, STAGGER_STUN_MS);
              events.push({
                timestamp, type: 'defender_paralyzed', damage: 0, attackerHp: atkHp, defenderHp: defHp,
                paralyzeMs: STAGGER_STUN_MS,
              });
            }
          } else {
            events.push({
              timestamp, type: 'defender_feared', damage: 0, attackerHp: atkHp, defenderHp: defHp,
              fearMs: FEAR_DURATION_MS,
            });
          }
        }
      }
    } else {
      // penetration path (L1086762-1086884): only when the defender's Miss is exactly 0
      let shown = 0;
      if (player.penetration > 0 && miss === 0) {
        const base = Math.round((player.attack * player.penetration) / 100);
        const mult = rollPenetrationCritMult(player, P);
        const d = cutBy(mitigateInline(Math.round(base * mult), enemy.damageReduction), attackerOutputMult);
        const s = absorbWithShield(defShield, d);
        defShield = s.shieldHp;
        defHp = Math.max(0, defenderHp - s.hpDamage);
        dealt = 0 + d;
        shown = d;
        atkHp = lifestealHeal(player, maxHp, healBudget, atkHp, d);
      }
      events.push({
        timestamp,
        type: miss > 0 ? 'defender_miss' : 'defender_block',
        damage: shown,
        attackerHp: atkHp,
        defenderHp: defHp,
      });
    }
    if (defHp > 0) {
      const daze = rollStanceDaze(player, dazedMs, lane(P, 'daze'));
      if (daze.procced) {
        dazedMs = daze.dazedMs;
        events.push({ timestamp, type: 'defender_dazed', damage: 0, attackerHp: atkHp, defenderHp: defHp, dazeMs: daze.durationMs });
      }
    }
    // the kill check belongs to the swing branch (L1086896); a no-swing tick goes straight to the minion
    if (defHp <= 0) {
      events.push({ timestamp, type: 'defender_dead', damage: 0, attackerHp: atkHp, defenderHp: 0 });
      return tickResult(atkHp, 0, attackerTimer, defenderTimerAcc, regenTimer, events, blinded,
        paralyzedMs, silencedMs, staggerStacks, feared, atkShield, defShield, dealt, dazedMs);
    }
  }

  // --- minion swing (L1086910-1086950): after the player, before the enemy
  if (minion && minion.alive && defHp > 0) {
    const minionLane = lane(rng, 'minion');
    const sw = minionSwing(minion, dtMs, minionLane);
    if (sw) {
      const dmg = cutBy(mitigateMinionHit(sw.damage, enemy.damageReduction), attackerOutputMult);
      const s = absorbWithShield(defShield, dmg);
      defShield = s.shieldHp;
      defHp = Math.max(0, defHp - s.hpDamage);
      healMinionLifesteal(minion, dmg);
      events.push({
        timestamp,
        type: sw.isCrit ? 'minion_crit' : 'minion_hit',
        damage: dmg,
        attackerHp: atkHp,
        defenderHp: defHp,
      });
      // Reap (Reaper's Call Dominion 4-5; 2.8.2 L1096840-1096870): the stun lands on a living target
      const reap = defHp > 0 ? rollMinionReap(minion, lane(minionLane, 'reap')) : 0;
      if (reap > 0) {
        paralyzedMs = Math.max(paralyzedMs, reap);
        events.push({
          timestamp, type: 'defender_paralyzed', damage: 0, attackerHp: atkHp, defenderHp: defHp,
          paralyzeMs: reap, stunSource: REAP_STUN_SOURCE,
        });
      }
      if (defHp <= 0) {
        events.push({ timestamp, type: 'defender_dead', damage: 0, attackerHp: atkHp, defenderHp: 0 });
        return tickResult(atkHp, 0, attackerTimer, defenderTimerAcc, regenTimer, events, blinded,
          paralyzedMs, silencedMs, staggerStacks, feared, atkShield, defShield, dealt, dazedMs);
      }
    }
  }

  // --- enemy swing (L1086957-1087430)
  let defenderTimer = defenderTimerAcc;
  if (defenderTimerAcc >= enemyInterval) {
    defenderTimer = defenderTimerAcc - enemyInterval;
    const E = lane(rng, 'enemy');
    if (paralyzedMs > 0) {
      events.push({ timestamp, type: 'defender_paralyze', damage: 0, attackerHp: atkHp, defenderHp: defHp });
    } else if (feared > 0) {
      events.push({ timestamp, type: 'defender_fear', damage: 0, attackerHp: atkHp, defenderHp: defHp });
    } else if (blinded) {
      events.push({ timestamp, type: 'defender_blind', damage: 0, attackerHp: atkHp, defenderHp: defHp });
      blinded = false;
    } else if (minion && minion.alive) {
      // the enemy hits the minion (L1087238-1087328); the crit draw happens even at 0% crit
      const isCrit = lane(E, 'crit')() * 100 < enemy.critChance;
      const raw = isCrit ? Math.round(enemy.attack * enemy.critDamage) : enemy.attack;
      const r = damageMinion(minion, raw, { swing: true, penetration: enemy.penetration }, lane(E, 'minion-block'));
      defHp = enemyLifesteal(enemy, defHp, r.dealt);
      events.push({
        timestamp, type: 'minion_damaged', damage: r.dealt, attackerHp: atkHp, defenderHp: defHp,
        ...(r.blocked ? { minionBlocked: true } : {}),
        ...(isCrit ? { isCrit: true } : {}),
      });
      if (r.died) {
        events.push({
          timestamp, type: 'minion_dead', damage: 0, attackerHp: atkHp, defenderHp: defHp,
          ...minionDeathMeta(minion),
        });
      }
      if (r.thorns > 0 && defHp > 0) {
        const reflected = Math.min(defHp, cutBy(r.thorns, attackerReflectMult));
        defHp -= reflected;
        dealt += reflected;
        events.push({ timestamp, type: 'minion_thorns', damage: reflected, attackerHp: atkHp, defenderHp: defHp });
        if (defHp <= 0) events.push({ timestamp, type: 'defender_dead', damage: 0, attackerHp: atkHp, defenderHp: 0 });
      }
    } else {
      const negate = player.blockChance + player.missChance;
      const negated = negate > 0 ? lane(E, 'avoid')() * 100 < negate : false;
      const mitigation = player.shieldMitigation == null ? 0 : player.shieldMitigation;
      if (!negated) {
        const isCrit = lane(E, 'crit')() * 100 < enemy.critChance;
        const raw = isCrit ? Math.round(enemy.attack * enemy.critDamage) : enemy.attack;
        const d = mitigateInline(raw, player.damageReduction);
        const s = absorbWithShield(atkShield, d, mitigation);
        atkShield = s.shieldHp;
        const newHp = Math.max(0, atkHp - s.hpDamage);
        const shown = Math.round(s.effectiveDamage);
        defHp = enemyLifesteal(enemy, defHp, shown);
        events.push({
          timestamp,
          type: newHp <= 0 ? 'attacker_dead' : 'defender_hit',
          damage: shown,
          attackerHp: newHp,
          defenderHp: defHp,
        });
        atkHp = newHp;
      } else {
        // penetration path (L1087100-1087236): only when the player's Miss is exactly 0
        let shown = 0;
        let newHp = atkHp;
        if (enemy.penetration > 0 && player.missChance === 0) {
          const base = Math.round((enemy.attack * enemy.penetration) / 100);
          const mult = rollPenetrationCritMult(enemy, E);
          const d = mitigateInline(Math.round(base * mult), player.damageReduction);
          const s = absorbWithShield(atkShield, d, mitigation);
          atkShield = s.shieldHp;
          newHp = Math.max(0, atkHp - s.hpDamage);
          shown = Math.round(s.effectiveDamage);
          defHp = enemyLifesteal(enemy, defHp, shown);
        }
        events.push({
          timestamp,
          type: player.missChance > 0 ? 'attacker_miss' : 'attacker_block',
          damage: shown,
          attackerHp: newHp,
          defenderHp: defHp,
        });
        atkHp = newHp;
        if (player.missChance === 0 && atkHp > 0) {
          const stun = rollShieldBash(player, lane(E, 'bash'));
          if (stun > 0) {
            paralyzedMs = Math.max(paralyzedMs, stun);
            events.push({ timestamp, type: 'defender_paralyzed', damage: 0, attackerHp: atkHp, defenderHp: defHp, paralyzeMs: stun, stunSource: 'SHIELD_BASH', shieldBash: true });
          }
        }
      }
      if (atkHp <= 0) {
        atkHp = 0;
        return tickResult(atkHp, defHp, attackerTimer, defenderTimer, regenTimer, events, blinded,
          paralyzedMs, silencedMs, staggerStacks, feared, atkShield, defShield, dealt, dazedMs);
      }
    }
  }
  return tickResult(atkHp, defHp, attackerTimer, defenderTimer, regenTimer, events, blinded,
    paralyzedMs, silencedMs, staggerStacks, feared, atkShield, defShield, dealt, dazedMs);
}

/**
 * One swing of a raid mob that is not the player's target (combat-pve.md §21: on the server every living
 * raid mob swings at once). The enemy swing above without the target's control states: blind, paralyze,
 * fear and a Shield Bash stun belong to the target alone. Mutates `mob` (`hp`, from its lifesteal).
 * @param {Object} player  the player view of this tick
 * @param {{entity: Object, hp: number}} mob
 * @param {number} atkHp
 * @param {number} atkShield
 * @param {Object|null} minion
 * @param {number} timestamp
 * @param {() => number} E  the mob's own rng lane
 * @returns {{atkHp: number, atkShield: number, taken: number, events: Object[]}}
 */
export function bystanderSwing(player, mob, atkHp, atkShield, minion, timestamp, E) {
  const enemy = mob.entity;
  const events = [];
  if (minion && minion.alive) {
    const isCrit = lane(E, 'crit')() * 100 < enemy.critChance;
    const raw = isCrit ? Math.round(enemy.attack * enemy.critDamage) : enemy.attack;
    const r = damageMinion(minion, raw, { swing: true, penetration: enemy.penetration }, lane(E, 'minion-block'));
    mob.hp = enemyLifesteal(enemy, mob.hp, r.dealt);
    events.push({
      timestamp, type: 'minion_damaged', damage: r.dealt, attackerHp: atkHp, defenderHp: mob.hp,
      ...(r.blocked ? { minionBlocked: true } : {}), ...(isCrit ? { isCrit: true } : {}),
    });
    if (r.died) events.push({ timestamp, type: 'minion_dead', damage: 0, attackerHp: atkHp, defenderHp: mob.hp, ...minionDeathMeta(minion) });
    return { atkHp, atkShield, taken: 0, events };
  }
  const negate = player.blockChance + player.missChance;
  const negated = negate > 0 ? lane(E, 'avoid')() * 100 < negate : false;
  const mitigation = player.shieldMitigation == null ? 0 : player.shieldMitigation;
  let d = 0;
  if (!negated) {
    const isCrit = lane(E, 'crit')() * 100 < enemy.critChance;
    d = mitigateInline(isCrit ? Math.round(enemy.attack * enemy.critDamage) : enemy.attack, player.damageReduction);
  } else if (enemy.penetration > 0 && player.missChance === 0) {
    const base = Math.round((enemy.attack * enemy.penetration) / 100);
    d = mitigateInline(Math.round(base * rollPenetrationCritMult(enemy, E)), player.damageReduction);
  }
  let shown = 0;
  let hp = atkHp;
  let shield = atkShield;
  if (d > 0) {
    const s = absorbWithShield(shield, d, mitigation);
    shield = s.shieldHp;
    hp = Math.max(0, hp - s.hpDamage);
    shown = Math.round(s.effectiveDamage);
    mob.hp = enemyLifesteal(enemy, mob.hp, shown);
  }
  const type = !negated ? (hp <= 0 ? 'attacker_dead' : 'defender_hit')
    : player.missChance > 0 ? 'attacker_miss' : 'attacker_block';
  events.push({ timestamp, type, damage: shown, attackerHp: hp, defenderHp: mob.hp });
  if (negated && hp <= 0) events.push({ timestamp, type: 'attacker_dead', damage: 0, attackerHp: 0, defenderHp: mob.hp });
  return { atkHp: hp, atkShield: shield, taken: shown, events };
}

// port of routeSpellHealToMinion L1095017-1095364
/**
 * Routes the minion-directed part of a spell pass result onto the minion and returns the minion events
 * (`minion_heal`, `minion_buff`, `minion_buff_end`). Mutates `minion` and, when the minion is alive,
 * `ev` (`ownerHpDelta -= ownerMinionHeal`, `ownerMinionHeal = 0`, minion-heal events removed from
 * `ev.events`). Also copies `ev.buffModifiers.soulLink` into `minion.soulLinkBonus`.
 * A heal value is scaled by the minion's max HP over the owner's: `max(1, floor(v * minion.maxHp / ownerMaxHp))`.
 * Order: heals, empower end, frenzy end, spell-tick minion heals, empower start, frenzy start.
 * @param {Object|null} minion
 * @param {Object} ev  processSpellsTick result
 * @param {number} ownerMaxHp
 * @returns {Array<Object>}
 */
export function routeSpellHealToMinion(minion, ev, ownerMaxHp) {
  if (!minion) return [];
  const soulLink = ev.buffModifiers?.soulLink ?? 0;
  if (soulLink !== (minion.soulLinkBonus ?? 0)) minion.soulLinkBonus = soulLink;
  const emp = ev.ownerMinionEmpower;
  if (!ev.ownerMinionHeal && !emp) return [];
  const out = [];
  const share = (v) => (ownerMaxHp > 0 ? Math.max(1, Math.floor((v * minion.maxHp) / ownerMaxHp)) : v);
  if (emp && minion.alive) {
    for (const h of emp.heals) {
      const healed = healMinion(minion, share(h.value));
      if (healed > 0) out.push({ type: 'minion_heal', timestamp: h.timestamp, healed, spell: h.spell });
    }
  }
  if (emp?.end && minion.alive && endMinionEmpower(minion)) {
    out.push({
      type: 'minion_buff_end', timestamp: emp.end.timestamp, healed: 0, spell: emp.end.spell,
      minionMaxHp: minion.maxHp,
    });
  }
  if (emp?.frenzyEnd && minion.alive && endMinionFrenzy(minion)) {
    out.push({
      type: 'minion_buff_end', timestamp: emp.frenzyEnd.timestamp, healed: 0, spell: emp.frenzyEnd.spell,
      minionMaxHp: minion.maxHp,
    });
  }
  if (emp?.bastionEnd && minion.alive && endMinionBastion(minion)) {
    out.push({
      type: 'minion_buff_end', timestamp: emp.bastionEnd.timestamp, healed: 0, spell: emp.bastionEnd.spell,
      minionMaxHp: minion.maxHp,
    });
  }
  if (ev.ownerMinionHeal && minion.alive) {
    const kept = [];
    for (const e of ev.events) {
      if (!e.minionHeal) {
        kept.push(e);
        continue;
      }
      const healed = healMinion(minion, share(e.value));
      if (healed > 0) out.push({ type: 'minion_heal', timestamp: e.timestamp, healed, spell: e.spell });
    }
    ev.ownerHpDelta = ev.ownerHpDelta - ev.ownerMinionHeal;
    ev.ownerMinionHeal = 0;
    ev.events = kept;
  }
  if (emp?.start && minion.alive) {
    endMinionEmpower(minion);
    const bonus = Math.max(0, Math.floor((minion.maxHp * emp.start.maxHpPercent) / 100));
    minion.maxHp += bonus;
    minion.hp += bonus;
    minion.empowerBonusHp = bonus;
    minion.empowerSpell = emp.start.spell;
    out.push({
      type: 'minion_buff', timestamp: emp.start.timestamp, healed: bonus, spell: emp.start.spell,
      minionMaxHp: minion.maxHp,
    });
  }
  if (emp?.frenzyStart && minion.alive) {
    const f = emp.frenzyStart;
    minion.frenzy = { attackPercent: f.attackPercent, attackSpeedPercent: f.attackSpeedPercent, lifesteal: f.lifesteal };
    minion.frenzySpell = f.spell;
    out.push({ type: 'minion_buff', timestamp: f.timestamp, healed: 0, spell: f.spell, minionMaxHp: minion.maxHp });
  }
  if (emp?.bastionStart && minion.alive) { // 2.8.2 L1106620-1106679
    const b = emp.bastionStart;
    minion.bastion = { damageReduction: b.damageReduction, blockChance: b.blockChance, ...(b.thornsPercent > 0 ? { thornsPercent: b.thornsPercent } : {}) };
    minion.bastionSpell = b.spell;
    out.push({ type: 'minion_buff', timestamp: b.timestamp, healed: 0, spell: b.spell, minionMaxHp: minion.maxHp });
  }
  return out;
}
