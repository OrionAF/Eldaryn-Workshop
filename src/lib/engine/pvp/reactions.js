// PVP duel reactions: stack application, thorns reflection, shields and minion bookkeeping.
// Port of the closures declared inside simulateArenaPvP (L1454739-1455733). The client captures its
// registers (entities, minions, events, timestamp, stack bundles ...) in closure slots; here they are
// fields of one explicit duel-state object, so the closures become a factory over that object.
// The 14-argument mapping of simulateArenaPvP (L1454718-1456045) is documented on createDuelState.
//
// Event semantics are the client's: for miss/block events the event type names the EVADING
// side, and blind events name the BLINDED swinger (see reactToAttack, Game/combat-pvp.md §9), and damage-carrying events are sorted into "attacker dealt" / "defender
// dealt" by the two type sets below (soul-link input).
import { ARENA_CONSTANTS } from '../../game/combatPvp.js';
import { createPlayerEntity } from '../core/entity.js';
import { absorbWithShield } from '../core/shield.js';
import { lane } from '../rng.js';
import { critDownChance } from '../core/debuffs.js';
import { applyBulwarkDr, applyElusiveBuff, applySunderToTarget, createStackCombat } from '../core/stacks.js';
import {
  createMinion, killMinion, minionDeathMeta, minionSwing, mitigateMinionHit, healMinionLifesteal, soulLinkHeal,
} from '../core/minions.js';

/**
 * @typedef {Object} DuelState
 * The captured registers of simulateArenaPvP, by name.
 * @property {Object} attacker               closure slot 2: entity from createPlayerEntity(a0)
 * @property {Object} defender               closure slot 3: entity from createPlayerEntity(a1)
 * @property {Object|null} attackerMinion    slot 4
 * @property {Object|null} defenderMinion    slot 5
 * @property {Array<Object>} events          slot 1: the shared event log (mutated in place)
 * @property {number} timestamp              slot 11: ms; the main loop assigns it before each tick
 * @property {number} tickMs                 slot 0: ARENA_CONSTANTS.TICK_INTERVAL_MS
 * @property {() => number} rng              randomness for minion crits
 * @property {Object} attackerStack          slot 6: createStackCombat bundle
 * @property {Object} defenderStack          slot 7
 * @property {boolean} stacksActive          slot 8: either bundle is active (gates stack application)
 * @property {number} attackerIronBastionPercent   slot 9: Iron Bastion thorns percent (0 = none)
 * @property {number} defenderIronBastionPercent   slot 10
 * @property {Array<Object>|null} attackerSpellRuntimes   slot 12: initSpellRuntimes(...) or null
 * @property {Array<Object>|null} defenderSpellRuntimes   slot 13
 * @property {boolean} hasMinions            either side has a minion
 * @property {boolean} hasShields            either side has shieldMax > 0
 */

/**
 * @typedef {Object} ReactionDeps
 * Functions that live in modules this file does not import (spells.js, pvp/attack.js); the
 * resolver wires them in.
 * @property {(runtimes: Array<Object>, species: string) => boolean} isSpellBuffActive
 * @property {(runtimes: Array<Object>) => number} activeBuffThornsPercent
 * @property {(rating: number) => number} pvpRatingToFraction
 */

const IRON_BASTION = 'IRON_BASTION';

/** Event types whose `damage` the attacker side dealt (finishMinionTick set, closure slot 14). */
export const ATTACKER_DAMAGE_EVENTS = new Set([
  'attacker_hit', 'attacker_crit', 'defender_block', 'defender_miss', 'attacker_spell_damage',
  'attacker_spell_dot_tick', 'attacker_spell_debuff_tick', 'attacker_thorns_reflect', 'defender_minion_damaged',
]);

/** Event types whose `damage` the defender side dealt (closure slot 15). */
export const DEFENDER_DAMAGE_EVENTS = new Set([
  'defender_hit', 'defender_crit', 'attacker_block', 'attacker_miss', 'defender_spell_damage',
  'defender_spell_dot_tick', 'defender_spell_debuff_tick', 'defender_thorns_reflect', 'attacker_minion_damaged',
]);

// port of shieldBaseFor L1455714-1455733
/**
 * Base for the shield-percent: raw max HP, times PVP_SHIELD_BASE_MULTIPLIER when the entity's
 * max HP is buffed above its raw max HP (the PVP x8 buff).
 */
export function shieldBaseFor(entity) {
  return entity.maxHp > entity.rawMaxHp
    ? entity.rawMaxHp * ARENA_CONSTANTS.PVP_SHIELD_BASE_MULTIPLIER
    : entity.rawMaxHp;
}

// port of the shield setup inside simulateArenaPvP L1455734-1455812
/**
 * Fills the shield fields of one entity. cfg = {hpPercent, vampAlwaysRefills?, regenAlwaysRefills?} or
 * nullish. shieldMax = floor(shieldBase * hpPercent / 100) when hpPercent > 0, else 0; shieldHp starts full.
 */
export function initEntityShield(entity, cfg) {
  entity.shieldMax = cfg && cfg.hpPercent > 0 ? Math.floor((shieldBaseFor(entity) * cfg.hpPercent) / 100) : 0;
  entity.shieldHp = entity.shieldMax;
  entity.shieldVampAlwaysRefills = cfg == null ? undefined : cfg.vampAlwaysRefills;
  entity.shieldRegenAlwaysRefills = cfg == null ? undefined : cfg.regenAlwaysRefills;
}

// port of simulateArenaPvP setup L1454718-1455812 (arguments a0-a13, positional in the client)
/**
 * Builds the duel state from the client's 14 positional arguments, named:
 *   a0 attackerStats, a1 defenderStats (ComputedStats-shaped)      a2/a3 spells (the caller builds the
 *   spell runtimes: `spells?.length ? initSpellRuntimes(spells) : null`)
 *   a4/a5 equipped sigils for stacks     a6/a7 glyph combat {stack, ironBastionThornsPercent}
 *   a8/a9 shield config                  a10/a11 stack context {playerClass, activeSpec, form}
 *   a12/a13 summon config for createMinion
 * The debuff states, the opening summon window and the swing timers (L1455813 onward) belong to the
 * resolver loop and are not created here.
 * @param {Object} a
 * @param {() => number} a.rng
 * @returns {DuelState}
 */
export function createDuelState(a) {
  const attacker = createPlayerEntity(a.attackerStats);
  const defender = createPlayerEntity(a.defenderStats);
  const attackerMinion = createMinion(a.attackerSummon ?? null, attacker, a.attackerStats);
  const defenderMinion = createMinion(a.defenderSummon ?? null, defender, a.defenderStats);
  initEntityShield(attacker, a.attackerShield);
  initEntityShield(defender, a.defenderShield);
  const attackerStack = createStackCombat(a.attackerEquipped, true, a.attackerGlyphCombat?.stack, a.attackerStackCtx);
  const defenderStack = createStackCombat(a.defenderEquipped, true, a.defenderGlyphCombat?.stack, a.defenderStackCtx);
  return {
    attacker,
    defender,
    attackerMinion,
    defenderMinion,
    events: [],
    timestamp: 0,
    tickMs: ARENA_CONSTANTS.TICK_INTERVAL_MS,
    rng: a.rng,
    attackerStack,
    defenderStack,
    stacksActive: attackerStack.active || defenderStack.active,
    attackerIronBastionPercent: a.attackerGlyphCombat?.ironBastionThornsPercent ?? 0,
    defenderIronBastionPercent: a.defenderGlyphCombat?.ironBastionThornsPercent ?? 0,
    attackerSpellRuntimes: a.attackerSpellRuntimes ?? null,
    defenderSpellRuntimes: a.defenderSpellRuntimes ?? null,
    hasMinions: attackerMinion != null || defenderMinion != null,
    hasShields: attacker.shieldMax > 0 || defender.shieldMax > 0,
  };
}

const NOOP = () => {};

/**
 * The ten closures over one duel state.
 * @param {DuelState} s
 * @param {ReactionDeps} deps
 */
export function createReactions(s, deps) {
  const hpAfter = () => ({
    attackerHpAfter: Math.max(0, s.attacker.hp),
    defenderHpAfter: Math.max(0, s.defender.hp),
  });

  // port of applyStackToTarget L1454739-1454814
  /**
   * Temporarily applies the target's own Bulwark DR and the foe's Sunder to `target`'s damageReduction,
   * blindChance, blockChance and missChance. Returns an undo function restoring the four fields.
   * No-op (and a no-op undo) when neither stack bundle is active.
   */
  function applyStackToTarget(target, ownStack, foeStack) {
    if (!s.stacksActive) return NOOP;
    const saved = {
      damageReduction: target.damageReduction,
      blindChance: target.blindChance,
      blockChance: target.blockChance,
      missChance: target.missChance,
    };
    let dr = target.damageReduction;
    if (ownStack.active) dr = applyBulwarkDr(target.damageReduction, ownStack.selfModifiers());
    if (foeStack.active) {
      const sunder = applySunderToTarget(
        dr, target.blindChance, target.blockChance, target.missChance, target.hpRegen, foeStack.targetModifiers(),
      );
      dr = sunder.damageReduction;
      target.blindChance = sunder.blindChance;
      target.blockChance = sunder.blockChance;
      target.missChance = sunder.missChance;
    }
    target.damageReduction = dr;
    return () => {
      target.damageReduction = saved.damageReduction;
      target.blindChance = saved.blindChance;
      target.blockChance = saved.blockChance;
      target.missChance = saved.missChance;
    };
  }

  // port of applyElusiveToSwinger L1454816-1454895
  /**
   * Temporarily adds the swinger's Elusive buff (attack, crit chance, lifesteal, attack speed). Returns an
   * undo function. No-op unless stacks are active, the bundle is active and some Elusive percent is > 0.
   */
  function applyElusiveToSwinger(swinger, stack) {
    if (!s.stacksActive || !stack.active) return NOOP;
    const mods = stack.elusiveSelfModifiers();
    if (mods.attackPercent <= 0 && mods.critChancePercent <= 0 && mods.lifestealPercent <= 0 && mods.attackSpeedPercent <= 0) {
      return NOOP;
    }
    const saved = {
      attack: swinger.attack, critChance: swinger.critChance, lifesteal: swinger.lifesteal, attackSpeed: swinger.attackSpeed,
    };
    const b = applyElusiveBuff(swinger.attack, swinger.critChance, swinger.lifesteal, swinger.attackSpeed, mods);
    swinger.attack = b.attack;
    swinger.critChance = b.critChance;
    swinger.lifesteal = b.lifesteal;
    swinger.attackSpeed = b.attackSpeed;
    return () => {
      swinger.attack = saved.attack;
      swinger.critChance = saved.critChance;
      swinger.lifesteal = saved.lifesteal;
      swinger.attackSpeed = saved.attackSpeed;
    };
  }

  // port of applyCritDownToSwinger L1454896-1454928
  /** Temporarily lowers the swinger's crit chance by the CRIT_DOWN debuffs on it. Returns an undo function. */
  function applyCritDownToSwinger(swinger, debuffState) {
    const reduced = critDownChance(swinger.critChance, debuffState);
    if (reduced === swinger.critChance) return NOOP;
    const saved = swinger.critChance;
    swinger.critChance = reduced;
    return () => { swinger.critChance = saved; };
  }

  // port of reactToAttack L1454929-1455279
  /**
   * Stack and thorns reactions to the events of one attack. Event names are from the evader's view:
   *   attacker_hit/crit      the attacker landed: attacker Sunder +1, defender takes hit (thorns, stack loss)
   *   defender_hit/crit      the same, mirrored
   *   attacker_block/miss    the ATTACKER blocked/evaded a defender swing: block reflect; miss also +Elusive
   *   defender_block/miss    mirrored
   *   attacker_blind         the attacker's swing was blinded: the DEFENDER evaded (Elusive +1)
   *   defender_blind         mirrored
   * Thorns sources per hit: stack thorns, Iron Bastion (when the Iron Bastion buff is up) and any
   * active buff thorns percent, each rounded separately. Reflected damage is absorbed by the target's
   * shield, hits the target's HP, and is logged as one `<side>_thorns_reflect` event; nothing is reflected
   * when either side is already dead. The attacker's thorns hit the defender, and are applied first.
   * @param {Iterable<Object>} events the events produced by the attack
   */
  function reactToAttack(events) {
    const thornsA = s.attackerSpellRuntimes ? deps.activeBuffThornsPercent(s.attackerSpellRuntimes) : 0;
    const thornsD = s.defenderSpellRuntimes ? deps.activeBuffThornsPercent(s.defenderSpellRuntimes) : 0;
    if (!s.stacksActive && s.attackerIronBastionPercent === 0 && s.defenderIronBastionPercent === 0 && thornsA === 0 && thornsD === 0) {
      return;
    }
    const ironA = s.attackerIronBastionPercent > 0 && s.attackerSpellRuntimes != null
      && deps.isSpellBuffActive(s.attackerSpellRuntimes, IRON_BASTION);
    const ironD = s.defenderIronBastionPercent > 0 && s.defenderSpellRuntimes != null
      && deps.isSpellBuffActive(s.defenderSpellRuntimes, IRON_BASTION);
    let toDefender = 0; // thorns the attacker side reflects onto the defender
    let toAttacker = 0; // thorns the defender side reflects onto the attacker
    const A = s.attackerStack;
    const D = s.defenderStack;
    for (const ev of events) {
      switch (ev.type) {
        case 'attacker_hit':
        case 'attacker_crit':
          A.onHitLanded();
          toAttacker += D.hitTakenReflect(ev.damage);
          if (ironD) toAttacker += Math.round((ev.damage * s.defenderIronBastionPercent) / 100);
          if (thornsD > 0) toAttacker += Math.round((ev.damage * thornsD) / 100);
          break;
        case 'defender_hit':
        case 'defender_crit':
          D.onHitLanded();
          toDefender += A.hitTakenReflect(ev.damage);
          if (ironA) toDefender += Math.round((ev.damage * s.attackerIronBastionPercent) / 100);
          if (thornsA > 0) toDefender += Math.round((ev.damage * thornsA) / 100);
          break;
        case 'attacker_block':
        case 'attacker_miss':
          toDefender += A.blockReflect(ev.damage);
          if (ev.type === 'attacker_miss') A.onEvaded();
          break;
        case 'defender_block':
        case 'defender_miss':
          toAttacker += D.blockReflect(ev.damage);
          if (ev.type === 'defender_miss') D.onEvaded();
          break;
        case 'attacker_blind':
          D.onEvaded();
          break;
        case 'defender_blind':
          A.onEvaded();
          break;
        default:
          break;
      }
    }
    const reflect = (damage, victim, type) => {
      const r = absorbWithShield(victim.shieldHp, damage);
      victim.shieldHp = r.shieldHp;
      victim.hp -= r.hpDamage;
      s.events.push({ timestamp: s.timestamp, type, damage, ...hpAfter() });
    };
    if (toDefender > 0 && s.attacker.hp > 0 && s.defender.hp > 0) reflect(toDefender, s.defender, 'attacker_thorns_reflect');
    if (toAttacker > 0 && s.defender.hp > 0 && s.attacker.hp > 0) reflect(toAttacker, s.attacker, 'defender_thorns_reflect');
  }

  // port of tagShieldSnapshots L1455280-1455312
  /** Stamps both shield HPs (floored at 0) onto every event from index `from` on. */
  function tagShieldSnapshots(from) {
    for (let i = from; i < s.events.length; i++) {
      s.events[i].attackerShieldHpAfter = Math.max(0, s.attacker.shieldHp);
      s.events[i].defenderShieldHpAfter = Math.max(0, s.defender.shieldHp);
    }
  }

  // port of tagMinionSnapshots L1455313-1455346
  /** Stamps each present minion's HP onto every event from index `from` on. */
  function tagMinionSnapshots(from) {
    for (let i = from; i < s.events.length; i++) {
      if (s.attackerMinion) s.events[i].attackerMinionHpAfter = s.attackerMinion.hp;
      if (s.defenderMinion) s.events[i].defenderMinionHpAfter = s.defenderMinion.hp;
    }
  }

  // port of killMinionsOfDead L1455476-1455562
  /** Instantly kills the minion of each dead owner (no respawn) and logs `<side>_minion_dead`. */
  function killMinionsOfDead(attackerDead, defenderDead) {
    if (attackerDead && s.attackerMinion && killMinion(s.attackerMinion)) {
      s.events.push({
        timestamp: s.timestamp, type: 'attacker_minion_dead', damage: 0, ...hpAfter(), ...minionDeathMeta(s.attackerMinion),
      });
    }
    if (defenderDead && s.defenderMinion && killMinion(s.defenderMinion)) {
      s.events.push({
        timestamp: s.timestamp, type: 'defender_minion_dead', damage: 0, ...hpAfter(), ...minionDeathMeta(s.defenderMinion),
      });
    }
  }

  // port of finishMinionTick L1455347-1455475
  /**
   * End-of-tick minion work over the events from index `from` on: each minion soul-link-heals from the
   * damage its owner's side dealt (logged as `<side>_minion_heal` with the HP gained), then the
   * minions of any dead owner are killed. Without minions only the kill step runs (a no-op).
   */
  function finishMinionTick(from) {
    if (s.attackerMinion || s.defenderMinion) {
      let dealtByAttacker = 0;
      let dealtByDefender = 0;
      for (let i = from; i < s.events.length; i++) {
        const ev = s.events[i];
        if (ATTACKER_DAMAGE_EVENTS.has(ev.type)) dealtByAttacker += ev.damage;
        else if (DEFENDER_DAMAGE_EVENTS.has(ev.type)) dealtByDefender += ev.damage;
      }
      const healA = soulLinkHeal(s.attackerMinion, dealtByAttacker);
      if (healA > 0) s.events.push({ timestamp: s.timestamp, type: 'attacker_minion_heal', damage: healA, ...hpAfter() });
      const healD = soulLinkHeal(s.defenderMinion, dealtByDefender);
      if (healD > 0) s.events.push({ timestamp: s.timestamp, type: 'defender_minion_heal', damage: healD, ...hpAfter() });
    }
    killMinionsOfDead(s.attacker.hp <= 0, s.defender.hp <= 0);
  }

  // port of minionStrike L1455564-1455680
  /**
   * One minion swing at `target`. Dead minion or target hp <= 0: nothing. Otherwise (a swing happened):
   * the target's DR is read with its own Bulwark and the foe's Sunder temporarily applied, the hit is
   * mitigated by it, then by the target's PVP defense fraction (min 1), absorbed by the target's
   * shield, and the minion lifesteals. `drTarget` is the entity whose defences are read and which
   * receives the resulting hp/shield when it is a different object from `target`.
   * Logs `<side>_minion_hit` / `_crit`. Draws one rng value iff the minion has crit chance.
   * @param {Object} minion
   * @param {'attacker'|'defender'} side the minion owner's side
   * @param {Object} target entity that takes the damage
   * @param {Object} drTarget entity whose defences apply (normally the same entity)
   * @param {Object} ownStack the target's stack bundle (Bulwark)
   * @param {Object} foeStack the minion owner's stack bundle (Sunder)
   */
  function minionStrike(minion, side, target, drTarget, ownStack, foeStack) {
    if (!minion.alive || target.hp <= 0) return;
    const swing = minionSwing(minion, s.tickMs, lane(lane(s.rng, side), 'minion'));
    if (!swing) return;
    const undo = applyStackToTarget(drTarget, ownStack, foeStack);
    const dr = drTarget.damageReduction;
    undo();
    let damage = mitigateMinionHit(swing.damage, dr);
    if (target.pvpDefense > 0) {
      damage = Math.max(1, Math.round(damage * (1 - deps.pvpRatingToFraction(target.pvpDefense))));
    }
    const r = absorbWithShield(target.shieldHp, damage);
    target.shieldHp = r.shieldHp;
    target.hp -= r.hpDamage;
    if (drTarget !== target) {
      drTarget.hp = target.hp;
      drTarget.shieldHp = target.shieldHp;
    }
    healMinionLifesteal(minion, damage);
    const type = side === 'attacker'
      ? (swing.isCrit ? 'attacker_minion_crit' : 'attacker_minion_hit')
      : (swing.isCrit ? 'defender_minion_crit' : 'defender_minion_hit');
    s.events.push({ timestamp: s.timestamp, type, damage, ...hpAfter() });
  }

  return {
    applyStackToTarget,
    applyElusiveToSwinger,
    applyCritDownToSwinger,
    reactToAttack,
    tagShieldSnapshots,
    tagMinionSnapshots,
    finishMinionTick,
    killMinionsOfDead,
    minionStrike,
    shieldBaseFor,
  };
}
