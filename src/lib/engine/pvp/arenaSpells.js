// PVP arena spells: one caster's spell pass for one tick, applied to both duelists (module 5399).
// Rules: Game/combat-pvp.md §8. The wrapper around core/spells.js processSpellsTick: it feeds the
// tick its PVP inputs, then applies the result (heal, shield, minion intercept, PVP Defense on spell
// damage, status effects, debuffs) and returns the duel-log events.
//
// Entities are plain mutable objects (core/entity.js shape plus the status fields paralyzedMs, fearedMs,
// silencedMs, blinded and the shield flags). `rng` is always the last argument; the only draws are the
// spell crit rolls inside processSpellsTick (draw order is behaviour).
import { PVP_RATING } from '../../game/stats.js';
import { castLockoutMs } from '../core/stances.js';
import { processSpellsTick } from '../core/spells.js';
import { applyDebuff, computeDebuffModifiers, weakenedAttack } from '../core/debuffs.js';
import { getBuffedMaxHp } from '../core/buffs.js';
import { absorbWithShield, shieldRefillAmount } from '../core/shield.js';
import {
  damageMinion, endMinionEmpower, endMinionFrenzy, endMinionBastion, healMinion, isMinionAlive, minionDeathMeta,
} from '../core/minions.js';

// port of mapSpellEventType L1453845-1453856: the log type is `<caster side>_<spell event type>`
export const mapSpellEventType = (type, side) => `${side}_${type}`;

// pvpRatingToFraction L1452748-1452763 (module 5399 slot 13; the same function lives in pvp/attack.js,
// kept private here so this slice depends on E5b only): r / (r + K) for r > 0, else 0.
const ratingFraction = (rating) => (rating > 0 ? rating / (rating + PVP_RATING.K) : 0);

// port of routeSpellHealToMinion L1095017-1095363 (module 8; absent from core/minions.js, so ported here)
/**
 * Applies the minion side of a spell-tick result to the caster's minion: empower regen pulses and the
 * empower / frenzy start and end, and routes `healsMinion` heal ticks away from the owner. Mutates
 * `minion` and `result` (`ownerHpDelta` loses the routed heal, `ownerMinionHeal` becomes 0 and the
 * routed `spell_heal_tick` events are replaced). Always syncs `minion.soulLinkBonus` from the result.
 * @param {Object|null} minion
 * @param {Object} result  a processSpellsTick result
 * @param {number} ownerMaxHp  the owner's max HP: a minion heal is its share of the owner's heal
 * @returns {Array<{type:string, timestamp:number, healed:number, spell:Object, minionMaxHp?:number}>}
 */
export function routeSpellHealToMinion(minion, result, ownerMaxHp) {
  if (!minion) return [];
  const soulLink = result.buffModifiers == null ? 0 : result.buffModifiers.soulLink ?? 0;
  if (soulLink !== (minion.soulLinkBonus ?? 0)) minion.soulLinkBonus = soulLink;
  const emp = result.ownerMinionEmpower;
  if (!result.ownerMinionHeal && !emp) return [];
  const out = [];
  // shareOfMinion L1095080-1095127
  const share = (v) => (ownerMaxHp > 0 ? Math.max(1, Math.floor((v * minion.maxHp) / ownerMaxHp)) : v);
  const healEvent = (timestamp, healed, spell) => ({ type: 'minion_heal', timestamp, healed, spell });

  if (emp && minion.alive) {
    for (const h of emp.heals) {
      const healed = healMinion(minion, share(h.value));
      if (healed > 0) out.push(healEvent(h.timestamp, healed, h.spell));
    }
  }
  if (emp?.end && minion.alive && endMinionEmpower(minion)) {
    out.push({ type: 'minion_buff_end', timestamp: emp.end.timestamp, healed: 0, spell: emp.end.spell, minionMaxHp: minion.maxHp });
  }
  if (emp?.frenzyEnd && minion.alive && endMinionFrenzy(minion)) {
    out.push({ type: 'minion_buff_end', timestamp: emp.frenzyEnd.timestamp, healed: 0, spell: emp.frenzyEnd.spell, minionMaxHp: minion.maxHp });
  }
  if (emp?.bastionEnd && minion.alive && endMinionBastion(minion)) {
    out.push({ type: 'minion_buff_end', timestamp: emp.bastionEnd.timestamp, healed: 0, spell: emp.bastionEnd.spell, minionMaxHp: minion.maxHp });
  }
  if (result.ownerMinionHeal && minion.alive) {
    const kept = [];
    for (const ev of result.events) {
      if (!ev.minionHeal) { kept.push(ev); continue; }
      const healed = healMinion(minion, share(ev.value));
      if (healed > 0) out.push(healEvent(ev.timestamp, healed, ev.spell));
    }
    result.ownerHpDelta -= result.ownerMinionHeal;
    result.ownerMinionHeal = 0;
    result.events = kept;
  }
  if (emp?.start && minion.alive) {
    endMinionEmpower(minion); // a re-cast replaces the running empower
    const bonus = Math.max(0, Math.floor((minion.maxHp * emp.start.maxHpPercent) / 100));
    minion.maxHp += bonus;
    minion.hp += bonus;
    minion.empowerBonusHp = bonus;
    minion.empowerSpell = emp.start.spell;
    out.push({ type: 'minion_buff', timestamp: emp.start.timestamp, healed: bonus, spell: emp.start.spell, minionMaxHp: minion.maxHp });
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

/**
 * @typedef {Object} ArenaSpellsInput
 * @property {Object} caster   the casting duelist (mutated: hp, shieldHp)
 * @property {Object} target   the other duelist (mutated: hp, shieldHp, paralyzedMs, silencedMs, fearedMs, blinded)
 * @property {number} dtMs
 * @property {number} timestamp
 * @property {'attacker'|'defender'} side  the CASTER's side; log types are prefixed with it, the status
 *   events with the other side (the victim)
 * @property {Array<Object>} targetDebuffs  the target's debuff list; the tick's new debuffs land here
 * @property {Array<Object>} casterDebuffs  the caster's debuff list; only its WOUND cuts the caster's spell heals
 * @property {number} [targetSpellResistBonus=0]  spellResist of the target's active spell buffs
 *   (computeActiveBuffModifiers(target runtimes).spellResist, L1456340-1456400); the sum with
 *   target.spellResist is the tick's targetSpellResist. target.damageReduction is NOT added (PVE does).
 * @property {number} [casterHpPercentBonus=0]  hpPercent from the caster's other self-modifiers
 *   (`selfModifiers().hpPercent` of the Chrono Flux object, L1456262-1456289), added to the tick's own
 * @property {Object|null} [targetMinion=null]  the target's minion: absorbs spell_damage hits while alive
 * @property {Object|null} [casterMinion=null]  the caster's minion: receives minion heals and buffs
 * @property {boolean} [log=true]  false returns [] and skips building the log (state is identical)
 * @property {{buffModifiers?: Object}|null} [spellsOut=null]  receives the tick's `buffModifiers`
 * @property {number} [damageMult=1]  the fight's damage ramp this tick (pvp/balance.js)
 *   (computeActiveBuffModifiers of the runtimes after the tick), so the caller need not recompute it
 */

// The processSpellsTick input, one shared object refilled on every call: processSpellsTick reads it and
// keeps nothing, and it never re-enters this function (saves an allocation per caster per tick).
export { castLockoutMs } from '../core/stances.js';

const SPELL_INPUT = {
  maxHp: 0, dtMs: 0, timestamp: 0, attack: 0, healReductionPercent: 0, hp: 0, enemyHp: 0, enemyMaxHp: 0,
  offensiveConditions: true, selfConditionsMet: false, spellDamage: 0, targetSpellResist: 0, spellCritChance: 0,
  critDamage: 0, spellVamp: 0, silencedMs: 0, healingMult: 1, healBaseMaxHp: 0, minionAlive: false, damageMult: 1,
};

// port of processArenaSpells L1453857-1454667
/**
 * One tick of one caster's spells in a duel. Mutates `runtimes`, both entities, the target's debuff list
 * and both minions. Returns the log events in the client's order: status effects (paralyzed, silenced,
 * feared, blinded), debuffs applied, the tick's spell events, then minion heal / buff events. Each log
 * event is `{timestamp, type, damage, attackerHpAfter, defenderHpAfter, ...}` with the HP values read
 * after all of this call's state changes.
 *
 * PVP specifics (all in this wrapper, see combat-pvp.md §8):
 * - activation conditions are honoured for DAMAGE / DEBUFF (offensiveConditions true);
 * - `healingMult = 1 - ratingFraction(target.pvpDefense)` scales the caster's spell vamp and self-heal;
 * - the net `targetHpDelta` (after the minion intercept) goes through PVP Defense once, then the shield;
 * - the per-event log damage of spell_damage / spell_dot_tick is rounded by PVP Defense separately, so
 *   the logged hits need not sum to the HP lost.
 * rng draws: only the spell crit rolls inside processSpellsTick.
 * @param {Array<Object>} runtimes  the caster's spell runtimes
 * @param {ArenaSpellsInput} input
 * @param {() => number} rng
 * @returns {Array<Object>} log events
 */
export function processArenaSpells(runtimes, input, rng) {
  const {
    caster, target, dtMs, timestamp, side, targetDebuffs, casterDebuffs,
    targetSpellResistBonus = 0, casterHpPercentBonus = 0, targetMinion = null, casterMinion = null, log = true,
    spellsOut = null, damageMult = 1,
  } = input;
  const attacker = side === 'attacker' ? caster : target;
  const defender = side === 'attacker' ? target : caster;
  const targetSide = side === 'attacker' ? 'defender' : 'attacker';
  const defFraction = target.pvpDefense > 0 ? ratingFraction(target.pvpDefense) : 0;
  const woundPercent = casterDebuffs.length > 0 ? computeDebuffModifiers(casterDebuffs).regenReductionPercent : 0;

  const si = SPELL_INPUT;
  si.maxHp = caster.maxHp;
  si.dtMs = dtMs;
  si.timestamp = timestamp;
  si.attack = weakenedAttack(caster.attack, casterDebuffs);
  si.healReductionPercent = woundPercent;
  si.hp = caster.hp;
  si.enemyHp = target.hp;
  si.enemyMaxHp = target.maxHp;
  si.spellDamage = caster.spellDamage;
  si.targetSpellResist = target.spellResist + targetSpellResistBonus;
  si.spellCritChance = caster.spellCritChance;
  si.critDamage = caster.critDamage;
  si.spellVamp = caster.spellVamp;
  si.silencedMs = castLockoutMs(caster);
  si.healingMult = 1 - defFraction;
  si.healBaseMaxHp = caster.rawMaxHp;
  si.minionAlive = isMinionAlive(casterMinion);
  si.damageMult = damageMult; // 2.8.2 passes the fight's ramp as processSpellsTick's options (L1605410-1605459)
  const result = processSpellsTick(runtimes, si, rng);

  if (spellsOut) spellsOut.buffModifiers = result.buffModifiers;
  const minionEvents = routeSpellHealToMinion(casterMinion, result, caster.maxHp);

  // --- caster HP and shield (L1453996-1454052) ---
  const hpPercent = (result.buffModifiers.hpPercent ?? 0) + casterHpPercentBonus;
  const buffedMaxHp = hpPercent > 0 ? getBuffedMaxHp(caster.maxHp, hpPercent) : caster.maxHp;
  if (result.ownerHpDelta > 0) {
    const before = caster.hp;
    caster.hp = Math.min(buffedMaxHp, caster.hp + result.ownerHpDelta);
    const refill = shieldRefillAmount(result, caster.hp - before, caster.shieldVampAlwaysRefills);
    if (refill > 0 && caster.shieldMax > 0 && (caster.shieldHp ?? 0) < caster.shieldMax) {
      caster.shieldHp = Math.min(caster.shieldMax, (caster.shieldHp ?? 0) + refill);
    }
  }
  if (hpPercent <= 0 && caster.hp > caster.maxHp) caster.hp = caster.maxHp;

  // --- the target's minion intercepts spell_damage hits while alive (L1454054-1454112) ---
  let targetHpDelta = result.targetHpDelta;
  let minionHits = null; // spell event -> {dealt, died}; made on the first intercepted hit
  if (targetMinion && targetMinion.alive && targetHpDelta < 0) {
    for (const ev of result.events) {
      if (ev.type === 'spell_damage' && ev.value > 0 && targetMinion.alive) {
        targetHpDelta += ev.value; // the whole hit, whatever the minion's remaining HP
        (minionHits ??= new Map()).set(ev, damageMinion(targetMinion, ev.value));
      }
    }
  }

  // --- what is left hits the target: PVP Defense once, then the shield (L1454113-1454146) ---
  if (targetHpDelta < 0) {
    let damage = Math.abs(targetHpDelta);
    if (target.pvpDefense > 0) damage = Math.max(1, Math.round(damage * (1 - defFraction)));
    const absorbed = absorbWithShield(target.shieldHp ?? 0, damage);
    target.shieldHp = absorbed.shieldHp;
    target.hp -= absorbed.hpDamage;
  }

  const events = [];
  const hpAfter = () => ({
    attackerHpAfter: Math.max(0, attacker.hp),
    defenderHpAfter: Math.max(0, defender.hp),
  });
  const status = (victimType, extra) => {
    if (log) events.push({ timestamp, type: mapSpellEventType(victimType, targetSide), damage: 0, ...hpAfter(), ...extra });
  };

  // status effects take the longer duration (L1454147-1454306). The event type names the victim's side.
  if (result.targetParalyzeMs) {
    target.paralyzedMs = Math.max(target.paralyzedMs ?? 0, result.targetParalyzeMs);
    status('paralyzed', { paralyzeMs: result.targetParalyzeMs });
  }
  if (result.targetSilenceMs) {
    target.silencedMs = Math.max(target.silencedMs ?? 0, result.targetSilenceMs);
    status('silenced');
  }
  if (result.targetFearMs) {
    target.fearedMs = Math.max(target.fearedMs ?? 0, result.targetFearMs);
    status('feared', { fearMs: result.targetFearMs });
  }
  if (result.targetBlinded) {
    target.blinded = true;
    status('blinded');
  }

  // debuffs (L1454307-1454378)
  if (result.newDebuffs) {
    for (const spec of result.newDebuffs) {
      const inst = applyDebuff(targetDebuffs, spec, timestamp);
      if (!log) continue;
      events.push({
        timestamp,
        type: mapSpellEventType(inst.type === 'debuff_applied' ? 'spell_debuff_applied' : 'spell_debuff_stack', side),
        damage: 0,
        ...hpAfter(),
        spell: inst.source,
        debuffStacks: inst.stacks,
        debuffMaxStacks: inst.maxStacks,
        debuffPermanent: inst.permanent,
        damagePerTick: inst.damagePerTick,
      });
    }
  }

  if (!log) return events;

  // the tick's spell events (L1454384-1454600)
  const momentum = result.ownerMomentumStacks === undefined ? {}
    : side === 'attacker' ? { attackerMomentumStacks: result.ownerMomentumStacks }
      : { defenderMomentumStacks: result.ownerMomentumStacks };
  for (const ev of result.events) {
    const hit = minionHits !== null ? minionHits.get(ev) : undefined;
    const crit = ev.isCrit ? { isCrit: true } : {};
    if (!hit) {
      const reduced = (ev.type === 'spell_damage' || ev.type === 'spell_dot_tick') && defFraction > 0;
      events.push({
        timestamp: ev.timestamp,
        type: mapSpellEventType(ev.type, side),
        damage: reduced ? Math.max(1, Math.round(ev.value * (1 - defFraction))) : ev.value,
        ...hpAfter(),
        spell: ev.spell,
        ...crit,
        ...momentum,
      });
      continue;
    }
    events.push({
      timestamp: ev.timestamp,
      type: `${targetSide}_minion_damaged`,
      damage: hit.dealt,
      ...hpAfter(),
      spell: ev.spell,
      ...crit,
      ...momentum,
    });
    if (hit.died) {
      events.push({
        timestamp: ev.timestamp,
        type: `${targetSide}_minion_dead`,
        damage: 0,
        ...hpAfter(),
        ...(targetMinion ? minionDeathMeta(targetMinion) : {}),
      });
    }
  }

  // minion heals and buffs (L1454600-1454664)
  for (const m of minionEvents) {
    events.push({
      timestamp: m.timestamp,
      type: mapSpellEventType(m.type, side),
      damage: m.healed,
      ...hpAfter(),
      spell: m.spell,
      ...(m.minionMaxHp !== undefined ? { minionMaxHp: m.minionMaxHp } : {}),
    });
  }
  return events;
}
