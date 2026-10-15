// Per-swing random rolls and the flat damage-reduction step. Every roll takes the rng as its last
// argument and draws in the client's order (draw order is behaviour, rebuild-plan §6). Each draw
// reads its purpose's lane of that rng ('crit', 'double', 'disrupt'); a plain rng is its own lanes.

import { lane } from '../rng.js';

// Status constants: L1089570-1089584 (module 3963); values in Game/combat-pve.md §8.1.
export const DISRUPTION_SILENCE_MS = 3000;
export const STAGGER_STACKS_TO_STUN = 3;
export const STAGGER_STUN_MS = 2000;
export const FEAR_DURATION_MS = 1000;
/** Code value 1000 ms; the in-game tooltip says 2 s (combat-pve.md §8.1, UNRESOLVED server-side). */
export const PARALYZE_DURATION_MS = 1000;

// port of applyDamageReduction L1085970-1085997
/**
 * `max(1, round(damage * (1 - dr/100)))` when both `dr` and `damage` are above 0, else `damage`.
 * No rng.
 */
export function applyDamageReduction(damage, damageReductionPercent) {
  if (damageReductionPercent > 0 && damage > 0) {
    return Math.max(1, Math.round(damage * (1 - damageReductionPercent / 100)));
  }
  return damage;
}

// port of rollAttackDamage L1085998-1086047
/**
 * One swing. Draw 1 (always): crit, `rng()*100 < critChance`; crit damage is `round(attack*critDamage)`.
 * Draw 2 (only when doubleHit > 0): double hit, `rng()*100 < doubleHit`.
 * @param {{attack:number, critChance:number, critDamage:number, doubleHit:number}} e
 * @param {() => number} rng
 * @returns {{damage:number, isCrit:boolean, isDoubleHit:boolean, doubleHitDamage:number}}
 */
export function rollAttackDamage(e, rng) {
  const isCrit = lane(rng, 'crit')() * 100 < e.critChance;
  const damage = isCrit ? Math.round(e.attack * e.critDamage) : e.attack;
  const isDoubleHit = e.doubleHit > 0 ? lane(rng, 'double')() * 100 < e.doubleHit : false;
  return { damage, isCrit, isDoubleHit, doubleHitDamage: isDoubleHit ? e.attack : 0 };
}

// port of rollPenetrationCritMult L1086048-1086072
/**
 * Crit multiplier for a penetrating (blocked) hit: `critDamage` on a crit, else 1.
 * Draws once only when critChance > 0.
 */
export function rollPenetrationCritMult(e, rng) {
  if (e.critChance > 0 && lane(rng, 'crit')() * 100 < e.critChance) return e.critDamage;
  return 1;
}

// port of rollDisruption L1086073-1086166
/**
 * Disruption proc. `procced` is null when nothing happened, else 'SILENCE' | 'STAGGER' | 'FEAR'.
 * No draw when disruptionChance <= 0, or SILENCE with silencedMs > 0, or FEAR with fearedMs > 0.
 * Otherwise one draw: `rng()*100 >= disruptionChance` is a miss.
 * SILENCE sets silencedMs 3000; FEAR sets fearedMs 1000; STAGGER adds a stack and at 3 stacks
 * stuns (staggerStunned true, stacks reset to 0). Applying the stun duration (STAGGER_STUN_MS) is the
 * caller's job. An unknown effect draws and then returns undefined, as in the client.
 * @param {{disruptionChance:number, disruptionEffect:string}} e
 * @returns {{procced:string|null, silencedMs:number, staggerStacks:number, fearedMs:number, staggerStunned:boolean}|undefined}
 */
export function rollDisruption(e, silencedMs, staggerStacks, fearedMs, rng) {
  const none = { procced: null, silencedMs, staggerStacks, fearedMs, staggerStunned: false };
  if (e.disruptionChance <= 0) return none;
  const effect = e.disruptionEffect;
  if (effect === 'SILENCE' && silencedMs > 0) return none;
  if (effect === 'FEAR' && fearedMs > 0) return none;
  if (lane(rng, 'disrupt')() * 100 >= e.disruptionChance) return none;
  if (effect === 'SILENCE') {
    return { procced: 'SILENCE', silencedMs: DISRUPTION_SILENCE_MS, staggerStacks, fearedMs, staggerStunned: false };
  }
  if (effect === 'STAGGER') {
    const stacks = staggerStacks + 1;
    const stunned = stacks >= STAGGER_STACKS_TO_STUN;
    return { procced: 'STAGGER', silencedMs, staggerStacks: stunned ? 0 : stacks, fearedMs, staggerStunned: stunned };
  }
  if (effect === 'FEAR') {
    return { procced: 'FEAR', silencedMs, staggerStacks, fearedMs: FEAR_DURATION_MS, staggerStunned: false };
  }
  return undefined;
}
