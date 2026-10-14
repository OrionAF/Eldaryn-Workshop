// PVP hit resolution: rating fraction, HP regen pulse and one swing (module 5399 helpers).
// Rules: Game/combat-pvp.md §5-§7. Entities are plain mutable objects (core/entity.js shape plus the
// status fields paralyzedMs, fearedMs, silencedMs, staggerStacks, blinded); rng is always the last
// randomness argument and draws happen in the client's order (draw order is behaviour).
import { PVP_RATING } from '../../game/stats.js';
import { rollAttackDamage, rollPenetrationCritMult, rollDisruption, PARALYZE_DURATION_MS, STAGGER_STUN_MS } from '../core/rolls.js';
import { absorbWithShield, regenShieldRefillAmount } from '../core/shield.js';
import { damageMinion, minionDeathMeta } from '../core/minions.js';

/** Regen pulse period (module 5399 slot9, L1457661-1457662). */
export const REGEN_PULSE_MS = 100;
/** Pulses per second divisor (slot10, L1457663-1457664). */
export const REGEN_PULSES_PER_SECOND = 10;

// port of pvpRatingToFraction L1452748-1452763
/** `r / (r + K)` for r > 0 (K = 200), else 0. Never reaches 1. */
export function pvpRatingToFraction(rating) {
  if (rating <= 0) return 0;
  return rating / (rating + PVP_RATING.K);
}

// port of applyRegen L1452765-1452839
/**
 * One call per tick with the accumulating regen `timer`. Below 100 ms nothing happens. At or above it
 * the timer drops by 100 and, when `hpRegen > 0`, one pulse of
 * `max(1, round(rawMaxHp * hpRegen / 100 / 10))` HP heals `e.hp` up to `buffedMaxHp` (default
 * `e.maxHp`). Mutates `e.hp`. `overflow` is the shield refill from the pulse (the part that did not fit
 * as HP, or the whole pulse with `e.shieldRegenAlwaysRefills`); at full HP it is the whole pulse
 * (not passed through the always-refills switch, as in the client).
 * Wound / mark regen reductions are the caller's (they lower `e.hpRegen` first).
 * @returns {{timer:number, healed:number, overflow:number}}
 */
export function applyRegen(e, timer, buffedMaxHp) {
  if (!(timer >= REGEN_PULSE_MS)) return { timer, healed: 0, overflow: 0 };
  const next = timer - REGEN_PULSE_MS;
  if (e.hpRegen <= 0) return { timer: next, healed: 0, overflow: 0 };
  const max = buffedMaxHp == null ? e.maxHp : buffedMaxHp;
  const amount = Math.max(1, Math.round((e.rawMaxHp * e.hpRegen) / 100 / REGEN_PULSES_PER_SECOND));
  if (!(e.hp < max)) return { timer: next, healed: 0, overflow: amount };
  const before = e.hp;
  e.hp = Math.min(max, e.hp + amount);
  const healed = e.hp - before;
  return { timer: next, healed, overflow: regenShieldRefillAmount(amount, healed, e.shieldRegenAlwaysRefills) };
}

// port of processAttack.mitigate L1452937-1453003 (same sequence on the penetration path L1453430-1453528)
// Not applyDamageReduction: the client applies DR whenever dr > 0, even for 0 damage (gives 1).
function mitigate(x, atk, def) {
  if (def.damageReduction > 0) x = Math.max(1, Math.round(x * (1 - def.damageReduction / 100)));
  if (atk.pvpAttack > 0) x = Math.round(x * (1 + pvpRatingToFraction(atk.pvpAttack)));
  if (def.pvpDefense > 0) x = Math.max(1, Math.round(x * (1 - pvpRatingToFraction(def.pvpDefense))));
  return x;
}

// port of processAttack.applyLifesteal L1453004-1453045
// Heals from post-mitigation damage, including the part the shield absorbed. Mutates atk.hp.
function applyLifesteal(atk, dmg, maxHp) {
  if (atk.lifesteal > 0 && atk.hp > 0 && atk.hp < maxHp) {
    const heal = Math.floor((dmg * atk.lifesteal) / 100);
    if (heal > 0) atk.hp = Math.min(maxHp, atk.hp + heal);
  }
}

// Shield first, remainder to HP (no mitigation argument in PVP: 1 shield point absorbs 1 damage).
function strike(def, dmg) {
  const r = absorbWithShield(def.shieldHp, dmg);
  def.shieldHp = r.shieldHp;
  def.hp -= r.hpDamage;
}

// port of processAttack L1452841-1453843
/**
 * Resolves one swing of `atk` against `def` and mutates both. Check order: paralyzed, feared, blinded
 * (each loses the swing; blind is consumed), a living `defMinion` (the swing and its double hit hit the
 * minion: no avoid roll, no DR or PVP), then ONE avoid roll `rng()*100 < block + miss`, then the hit
 * or avoided path (combat-pvp.md §6). Penetration works only when the defender's miss is exactly 0.
 *
 * Draw order: [avoid roll if block+miss > 0], crit, [double hit if doubleHit > 0], then on the hit path
 * [blind], [paralyze], [disruption] (each only when its guard passes; see the guards in the body). The
 * avoided-and-penetrating path draws only the penetration crit (when critChance > 0).
 *
 * Event labels: the swing events (hit, crit, lost swing) name the swinger's side; avoid, minion and
 * proc events (blinded, paralyzed, silenced, ...) name the target's side. `attackerHpAfter` /
 * `defenderHpAfter` are the swinger's and target's HP (clamped at 0), verbatim from the client even
 * when the defender is the swinger. `log=false` skips building events (state changes are identical).
 *
 * @param {Object} atk the swinger
 * @param {Object} def the target
 * @param {number} t timestamp (ms) put on every event
 * @param {boolean} atkIsAttacker whether the swinger is the arena attacker (labels only)
 * @param {number|null} maxHp the swinger's lifesteal cap; null or undefined means `atk.maxHp`
 * @param {Object|null} defMinion the target's minion (core/minions.js), or null
 * @param {() => number} rng
 * @param {boolean} [log=true]
 * @returns {Array<Object>} events in order ([] when log is false)
 */
export function processAttack(atk, def, t, atkIsAttacker, maxHp, defMinion, rng, log = true) {
  const events = [];
  const cap = maxHp == null ? atk.maxHp : maxHp;
  const S = atkIsAttacker ? 'attacker' : 'defender'; // swinger side
  const T = atkIsAttacker ? 'defender' : 'attacker'; // target side
  const emit = (type, damage, extra) => {
    if (!log) return;
    const ev = { timestamp: t, type, damage, attackerHpAfter: Math.max(0, atk.hp), defenderHpAfter: Math.max(0, def.hp) };
    events.push(extra ? Object.assign(ev, extra) : ev);
  };

  if (atk.paralyzedMs > 0) { emit(`${S}_paralyze`, 0); return events; } // L1452886-1452892, 1453817-1453841
  if (atk.fearedMs > 0) { emit(`${S}_fear`, 0); return events; } // L1452895-1452901, 1453788-1453816
  if (atk.blinded) { atk.blinded = false; emit(`${S}_blind`, 0); return events; } // L1452903-1452905, 1453755-1453787

  if (defMinion && defMinion.alive) { // L1452906-1452912, 1453570-1453754
    const roll = rollAttackDamage(atk, rng);
    const strikes = [{ damage: roll.damage, isCrit: roll.isCrit, doubleHit: false }];
    if (roll.isDoubleHit) strikes.push({ damage: roll.doubleHitDamage, isCrit: false, doubleHit: true });
    for (const s of strikes) {
      if (!defMinion.alive) break;
      const r = damageMinion(defMinion, s.damage);
      applyLifesteal(atk, r.dealt, cap);
      const extra = {};
      if (s.isCrit) extra.isCrit = true;
      if (s.doubleHit) extra.doubleHit = true;
      emit(`${T}_minion_damaged`, r.dealt, extra);
      if (r.died) emit(`${T}_minion_dead`, 0, minionDeathMeta(defMinion));
    }
    return events;
  }

  const avoid = def.blockChance + def.missChance;
  if (avoid > 0 && rng() * 100 < avoid) { // L1452914-1452927: one roll for block and miss together
    // AVOIDED path L1453403-1453569
    let dealt = 0;
    if (atk.penetration > 0 && def.missChance === 0) {
      const base = Math.round((atk.attack * atk.penetration) / 100);
      const raw = Math.round(base * rollPenetrationCritMult(atk, rng));
      dealt = mitigate(raw, atk, def);
      strike(def, dealt);
      applyLifesteal(atk, dealt, cap);
    }
    emit(`${T}_${def.missChance > 0 ? 'miss' : 'block'}`, dealt);
    return events;
  }

  // HIT path L1452929-1453400
  const roll = rollAttackDamage(atk, rng);
  const dmg = mitigate(roll.damage, atk, def);
  strike(def, dmg);
  applyLifesteal(atk, dmg, cap);
  emit(`${S}_${roll.isCrit ? 'crit' : 'hit'}`, dmg);
  if (roll.isDoubleHit && def.hp > 0) { // L1453096-1453141: never re-rolls avoid, never crits
    const d2 = mitigate(roll.doubleHitDamage, atk, def);
    strike(def, d2);
    applyLifesteal(atk, d2, cap);
    emit(`${S}_hit`, d2, { doubleHit: true });
  }

  // On-hit procs, once per swing, after the double hit (L1453143-1453400).
  if (atk.blindChance > 0 && !def.blinded && def.hp > 0 && rng() * 100 < atk.blindChance) { // L1453143-1453191
    def.blinded = true;
    emit(`${T}_blinded`, 0);
  }
  if (atk.paralyzeChance > 0 && !(def.paralyzedMs > 0) && def.hp > 0 && rng() * 100 < atk.paralyzeChance) { // L1453193-1453246
    def.paralyzedMs = PARALYZE_DURATION_MS;
    emit(`${T}_paralyzed`, 0);
  }
  if (atk.disruptionChance > 0 && def.hp > 0) { // L1453248-1453400
    const d = rollDisruption(atk, def.silencedMs ?? 0, def.staggerStacks ?? 0, def.fearedMs ?? 0, rng);
    // An unknown disruptionEffect returns undefined after drawing (the client would throw); treat as no proc.
    if (d && d.procced) {
      def.silencedMs = d.silencedMs;
      def.staggerStacks = d.staggerStacks;
      def.fearedMs = d.fearedMs;
      if (d.procced === 'SILENCE') emit(`${T}_silenced`, 0);
      else if (d.procced === 'STAGGER') {
        emit(`${T}_staggered`, 0, { staggerStacks: d.staggerStacks });
        if (d.staggerStunned) {
          def.paralyzedMs = Math.max(def.paralyzedMs ?? 0, STAGGER_STUN_MS);
          emit(`${T}_paralyzed`, 0, { paralyzeMs: STAGGER_STUN_MS });
        }
      } else emit(`${T}_feared`, 0, { fearMs: d.fearedMs });
    }
  }
  return events;
}
