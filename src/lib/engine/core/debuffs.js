// Enemy debuff state: BLEED / POISON damage over time, WOUND (regen cut), SLOW (attack speed cut)
// and CRIT_DOWN (crit chance cut). Pure functions over a plain array of debuff objects; the
// caller owns the array (one per target) and passes an injected rng. See Game/combat-pve.md §9.2.
// Module 3966, L1092930-1094002.

import { lane } from '../rng.js';

/** @typedef {'BLEED'|'POISON'|'WOUND'|'SLOW'|'CRIT_DOWN'|'ATTACK_DOWN'} DebuffType */

export const DEBUFF_TYPES = Object.freeze({
  BLEED: 'BLEED',
  POISON: 'POISON',
  WOUND: 'WOUND',
  SLOW: 'SLOW',
  CRIT_DOWN: 'CRIT_DOWN',
  ATTACK_DOWN: 'ATTACK_DOWN',
});

/** Cap on the summed SLOW reduction, percent (module constant slot1 = 50, L1093998). */
export const SLOW_REDUCTION_CAP = 50;
/** [CODE, 2.7.5] Game/updates-2.7.5.md §3. */
export const ATTACK_REDUCTION_CAP = 50;
/** Cap on the summed WOUND regen reduction, percent (computeDebuffModifiers, min(sum, 100)). */
export const WOUND_REDUCTION_CAP = 100;
/** Default crit multiplier of a damage-over-time tick. */
export const DEFAULT_DOT_CRIT_MULT = 1.5;

/**
 * What a spell applies. `config.durationMs === 0` means permanent.
 * @typedef {Object} DebuffSpec
 * @property {DebuffType} type
 * @property {{durationMs: number, maxStacks: number, tickIntervalMs?: number,
 *   regenReductionPercent?: number, attackSpeedReductionPercent?: number,
 *   critChanceReduction?: number, attackReductionPerStack?: number}} config
 * @property {number} [damagePerTickFlat]  one stack's damage per tick (> 0 for a DoT)
 * @property {number} [critChance]  percent, tick crit chance
 * @property {number} [critMult]    default 1.5
 * @property {string} [source]
 */

/**
 * A live debuff on a target. Fields beyond `type` .. `isPermanent` are filled as the client does.
 * @typedef {Object} Debuff
 * @property {DebuffType} type
 * @property {number} stacks
 * @property {number} maxStacks
 * @property {number} remainingMs  Infinity when permanent
 * @property {boolean} isPermanent
 * @property {number} regenReductionPercent
 * @property {number} [attackSpeedReductionPercent]
 * @property {number} [critChanceReduction]
 * @property {number} damagePerTickFlat
 * @property {number[]} stackDamages  per-stack damage, oldest first
 * @property {number} tickIntervalMs
 * @property {number} nextTickIn
 * @property {number} critChance
 * @property {number} critMult
 * @property {string} [source]
 * @property {Feeder[]} [partyFeeders]  only for instances shared by crusade party members
 */

/**
 * One party member's contribution to a shared debuff instance.
 * @typedef {Object} Feeder
 * @property {number} slot  -1 is the legacy placeholder made when the instance had no feeder list
 * @property {number} maxStacks
 * @property {boolean} isPermanent
 * @property {number} remainingMs
 * @property {number} regenReductionPercent
 * @property {number} attackSpeedReductionPercent
 * @property {number} critChanceReduction
 */

const n0 = (v) => (v == null ? 0 : v);

// port of initDebuffState L1093372-1093376
/** A fresh, empty debuff list. @returns {Debuff[]} */
export function initDebuffState() {
  return [];
}

// port of isLiveFeeder L1092933-1092947
export function isLiveFeeder(f) {
  return f.isPermanent || f.remainingMs > 0;
}

// port of newFeeder L1092948-1092993
/** @param {number} slot @param {DebuffSpec} spec @returns {Feeder} */
export function newFeeder(slot, spec) {
  const c = spec.config;
  const permanent = c.durationMs === 0;
  return {
    slot,
    maxStacks: c.maxStacks,
    isPermanent: permanent,
    remainingMs: permanent ? Infinity : c.durationMs,
    regenReductionPercent: n0(c.regenReductionPercent),
    attackSpeedReductionPercent: n0(c.attackSpeedReductionPercent),
    critChanceReduction: n0(c.critChanceReduction),
    ...(c.attackReductionPerStack ? { attackReductionPerStack: c.attackReductionPerStack } : {}),
  };
}

// port of snapshotAtInstanceCadence L1092994-1093034
/**
 * Per-tick damage of a joining feeder, rescaled to the instance's tick cadence so the
 * damage per second is preserved: max(1, round(dpt * instanceTick / specTick)).
 */
export function snapshotAtInstanceCadence(inst, spec) {
  const dpt = spec.damagePerTickFlat;
  const specTick = n0(spec.config.tickIntervalMs);
  if (dpt <= 0 || specTick <= 0 || inst.tickIntervalMs <= 0 || specTick === inst.tickIntervalMs) return dpt;
  return Math.max(1, Math.round((dpt * inst.tickIntervalMs) / specTick));
}

// port of feedSharedInstance L1093035-1093239
/**
 * Merge one party member's application into a shared instance: the instance keeps the best of
 * every feeder (max stacks, max reductions, permanent if any feeder is, otherwise the longest
 * live remaining time). Returns true when another live feeder (different slot) exists.
 * @param {Debuff} inst @param {DebuffSpec} spec @param {number} slot
 */
export function feedSharedInstance(inst, spec, slot) {
  let feeders = inst.partyFeeders;
  if (feeders == null) {
    feeders = [
      {
        slot: -1,
        maxStacks: inst.maxStacks,
        isPermanent: inst.isPermanent,
        remainingMs: inst.remainingMs,
        regenReductionPercent: inst.regenReductionPercent,
        attackSpeedReductionPercent: n0(inst.attackSpeedReductionPercent),
        critChanceReduction: n0(inst.critChanceReduction),
        ...(inst.attackReductionPerStack ? { attackReductionPerStack: inst.attackReductionPerStack } : {}),
      },
    ];
    inst.partyFeeders = feeders;
  }
  const idx = feeders.findIndex((f) => f.slot === slot);
  const found = idx >= 0 ? feeders[idx] : null;
  let fe;
  if (found && isLiveFeeder(found)) {
    if (!found.isPermanent) found.remainingMs = spec.config.durationMs;
    fe = found;
  } else {
    fe = newFeeder(slot, spec);
    if (idx >= 0) feeders[idx] = fe;
    else feeders.push(fe);
  }
  if (fe.maxStacks > inst.maxStacks) inst.maxStacks = fe.maxStacks;
  if (fe.isPermanent && !inst.isPermanent) {
    inst.isPermanent = true;
    inst.remainingMs = Infinity;
  }
  if (fe.regenReductionPercent > inst.regenReductionPercent) inst.regenReductionPercent = fe.regenReductionPercent;
  if (fe.attackSpeedReductionPercent > n0(inst.attackSpeedReductionPercent)) {
    inst.attackSpeedReductionPercent = fe.attackSpeedReductionPercent;
  }
  if (fe.critChanceReduction > n0(inst.critChanceReduction)) inst.critChanceReduction = fe.critChanceReduction;
  if (n0(fe.attackReductionPerStack) > n0(inst.attackReductionPerStack)) inst.attackReductionPerStack = fe.attackReductionPerStack;
  if (!inst.isPermanent) {
    let longest = 0;
    for (const f of feeders) if (isLiveFeeder(f) && f.remainingMs > longest) longest = f.remainingMs;
    inst.remainingMs = longest;
  }
  const others = feeders.some((f) => f.slot !== slot && isLiveFeeder(f));
  const specTick = n0(spec.config.tickIntervalMs);
  // An instance that never ticked adopts the joining feeder's cadence (L1093218-1093232).
  if (others && inst.tickIntervalMs <= 0 && specTick > 0) {
    inst.tickIntervalMs = specTick;
    inst.nextTickIn = specTick;
  }
  return others;
}

// port of applyDebuff L1093377-1093652
/**
 * Apply a debuff to the target list (mutates `state`). A new type starts at 1 stack; a repeat adds a
 * stack up to maxStacks (at the cap the oldest stackDamage is replaced) and refreshes the timer
 * unless permanent or party-shared. Returns the 'debuff_applied' / 'debuff_stack_added' event.
 * @param {Debuff[]} state
 * @param {DebuffSpec} spec
 * @param {number} timestamp
 * @param {{partySlot?: number}|null} [ctx]  crusade party feeder slot
 */
export function applyDebuff(state, spec, timestamp, ctx = null) {
  const existing = state.find((d) => d.type === spec.type);
  const partySlot = ctx == null ? undefined : ctx.partySlot;
  const dptSpec = spec.damagePerTickFlat;

  if (!existing) {
    const cfg = spec.config;
    const permanent = cfg.durationMs === 0;
    const d = {
      type: spec.type,
      stacks: 1,
      maxStacks: cfg.maxStacks,
      remainingMs: permanent ? Infinity : cfg.durationMs,
      isPermanent: permanent,
      regenReductionPercent: cfg.regenReductionPercent == null ? 0 : cfg.regenReductionPercent,
    };
    if (cfg.attackSpeedReductionPercent) d.attackSpeedReductionPercent = cfg.attackSpeedReductionPercent;
    if (cfg.critChanceReduction) d.critChanceReduction = cfg.critChanceReduction;
    if (cfg.attackReductionPerStack) d.attackReductionPerStack = cfg.attackReductionPerStack;
    d.damagePerTickFlat = dptSpec;
    d.stackDamages = dptSpec > 0 ? [dptSpec] : [];
    d.tickIntervalMs = n0(cfg.tickIntervalMs);
    d.nextTickIn = n0(cfg.tickIntervalMs);
    d.critChance = n0(spec.critChance);
    d.critMult = spec.critMult == null ? DEFAULT_DOT_CRIT_MULT : spec.critMult;
    d.source = spec.source;
    if (partySlot !== undefined) d.partyFeeders = [newFeeder(partySlot, spec)];
    state.push(d);
    return {
      timestamp,
      type: 'debuff_applied',
      value: 0,
      stacks: 1,
      maxStacks: d.maxStacks,
      damagePerTick: dptSpec,
      permanent,
      source: spec.source,
    };
  }

  const shared = partySlot !== undefined;
  const joined = shared ? feedSharedInstance(existing, spec, partySlot) : false;
  const dpt = joined ? snapshotAtInstanceCadence(existing, spec) : dptSpec;
  if (existing.stacks < existing.maxStacks) {
    existing.stacks += 1;
    if (dptSpec > 0) existing.stackDamages.push(dpt);
  } else if (dptSpec > 0 && existing.stackDamages.length > 0) {
    existing.stackDamages.shift();
    existing.stackDamages.push(dpt);
  }
  if (dptSpec > 0) {
    existing.damagePerTickFlat = dpt;
    existing.critChance = n0(spec.critChance);
    existing.critMult = spec.critMult == null ? DEFAULT_DOT_CRIT_MULT : spec.critMult;
  }
  if (!existing.isPermanent && !shared) existing.remainingMs = spec.config.durationMs;
  return {
    timestamp,
    type: 'debuff_stack_added',
    value: 0,
    stacks: existing.stacks,
    maxStacks: existing.maxStacks,
    damagePerTick:
      existing.stackDamages.length > 0
        ? existing.stackDamages.reduce((a, b) => a + b, 0)
        : existing.damagePerTickFlat * existing.stacks,
    permanent: existing.isPermanent,
    source: spec.source,
  };
}

// port of computeDebuffModifiers L1093240-1093371
/**
 * Summed reductions across the list. WOUND adds regenReductionPercent (not scaled by stacks),
 * SLOW and CRIT_DOWN add their own fields. Result: regenReductionPercent always (cap 100);
 * attackSpeedReductionPercent (cap 50) and critChanceReduction only when > 0.
 * @param {Debuff[]} state
 * @returns {{regenReductionPercent: number, attackSpeedReductionPercent?: number, critChanceReduction?: number}}
 */
export function computeDebuffModifiers(state) {
  let wound = 0;
  let slow = 0;
  let critDown = 0;
  let attackDown = 0;
  for (const d of state) {
    if (d.type === DEBUFF_TYPES.ATTACK_DOWN && d.attackReductionPerStack > 0) attackDown += d.stacks * d.attackReductionPerStack;
    if (d.type === DEBUFF_TYPES.WOUND && d.regenReductionPercent > 0) wound += d.regenReductionPercent;
    if (d.type === DEBUFF_TYPES.SLOW) {
      const v = n0(d.attackSpeedReductionPercent);
      if (v > 0) slow += d.attackSpeedReductionPercent;
    }
    if (d.type === DEBUFF_TYPES.CRIT_DOWN) {
      const v = n0(d.critChanceReduction);
      if (v > 0) critDown += d.critChanceReduction;
    }
  }
  const out = { regenReductionPercent: Math.min(wound, WOUND_REDUCTION_CAP) };
  if (slow > 0) out.attackSpeedReductionPercent = Math.min(slow, SLOW_REDUCTION_CAP);
  if (critDown > 0) out.critChanceReduction = critDown;
  if (attackDown > 0) out.attackReductionPercent = Math.min(attackDown, ATTACK_REDUCTION_CAP);
  return out;
}

/** [CODE, 2.7.5] Applies to current attack, without mutating its source; Game/updates-2.7.5.md §3. */
export function weakenedAttack(attack, state) {
  if (!state?.length) return attack;
  const reduction = computeDebuffModifiers(state).attackReductionPercent ?? 0;
  return reduction > 0 ? Math.floor(attack * (1 - reduction / 100)) : attack;
}

// port of processDebuffsTick L1093653-1093868
/**
 * Advance every debuff by dtMs. Iterates from the last entry down: party feeder timers run, a
 * non-permanent debuff whose timer reaches 0 is removed (swap with last, pop) and emits
 * 'debuff_expired'; a BLEED/POISON with a cadence counts nextTickIn down and, when it reaches 0,
 * deals sum(stackDamages) (or damagePerTickFlat * stacks) once (no catch-up), optionally crit.
 * One rng draw per due tick, only when the debuff's critChance > 0.
 * @param {Debuff[]} state
 * @param {number} dtMs
 * @param {number} timestamp
 * @param {() => number} rng
 * @returns {{targetHpDelta: number, debuffModifiers: ReturnType<typeof computeDebuffModifiers>, events: Object[]}}
 */
export function processDebuffsTick(state, dtMs, timestamp, rng) {
  const events = [];
  let targetHpDelta = 0;
  for (let i = state.length - 1; i >= 0; i--) {
    const d = state[i];
    if (d.partyFeeders) {
      for (const f of d.partyFeeders) if (!f.isPermanent) f.remainingMs -= dtMs;
    }
    if (!d.isPermanent) {
      d.remainingMs -= dtMs;
      if (d.remainingMs <= 0) {
        events.push({
          timestamp,
          type: 'debuff_expired',
          value: 0,
          stacks: d.stacks,
          maxStacks: d.maxStacks,
          damagePerTick: d.damagePerTickFlat,
          permanent: d.isPermanent,
          source: d.source,
        });
        state[i] = state[state.length - 1];
        state.pop();
        continue;
      }
    }
    if ((d.type === DEBUFF_TYPES.BLEED || d.type === DEBUFF_TYPES.POISON) && d.tickIntervalMs > 0) {
      d.nextTickIn -= dtMs;
      if (d.nextTickIn <= 0) {
        const base =
          d.stackDamages.length > 0 ? d.stackDamages.reduce((a, b) => a + b, 0) : d.damagePerTickFlat * d.stacks;
        // one lane per source and type (engine/rng.js laneRng); a plain rng is its own lanes
        const crit = d.critChance > 0 && lane(rng, `debuff:${d.source?.species ?? ''}:${d.type}`)() * 100 < d.critChance;
        const dmg = crit ? Math.floor(base * d.critMult) : base;
        targetHpDelta -= dmg;
        const ev = {
          timestamp,
          type: 'debuff_tick',
          value: dmg,
          stacks: d.stacks,
          maxStacks: d.maxStacks,
          damagePerTick: dmg,
          permanent: d.isPermanent,
        };
        if (crit) ev.isCrit = true;
        ev.source = d.source;
        events.push(ev);
        d.nextTickIn += d.tickIntervalMs;
      }
    }
  }
  return { targetHpDelta, debuffModifiers: computeDebuffModifiers(state), events };
}

// port of critDownChance L1093869-1093903
/** Crit chance after CRIT_DOWN: max(0, chance - reduction). Unchanged with no debuffs. */
export function critDownChance(chance, state) {
  if (!state || state.length === 0) return chance;
  const red = n0(computeDebuffModifiers(state).critChanceReduction);
  return red > 0 ? Math.max(0, chance - red) : chance;
}

// port of slowedAttackSpeed L1093904-1093938
/** Attack speed after SLOW: as * (1 - reduction/100). Unchanged with no debuffs. */
export function slowedAttackSpeed(attackSpeed, state) {
  if (!state || state.length === 0) return attackSpeed;
  const red = n0(computeDebuffModifiers(state).attackSpeedReductionPercent);
  return red > 0 ? attackSpeed * (1 - red / 100) : attackSpeed;
}

// port of hasActiveDebuffs L1093939-1093946
export const hasActiveDebuffs = (state) => state.length > 0;

// port of getBleedStacks L1093947-1093970
export function getBleedStacks(state) {
  const d = state.find((x) => x.type === DEBUFF_TYPES.BLEED);
  return d ? d.stacks : 0;
}

// port of hasWoundDebuff L1093971-1093990
export const hasWoundDebuff = (state) => state.some((d) => d.type === DEBUFF_TYPES.WOUND);
