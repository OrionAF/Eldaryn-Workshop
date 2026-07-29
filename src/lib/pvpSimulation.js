/**
 * pvpSimulation.js - Monte Carlo two-sided PVP duel simulator.
 *
 * Where simulation.js plays a one-sided fight against a target dummy, this
 * module plays PLAYER vs OPPONENT on one shared timeline: both sides have an
 * HP pool, swing on their own Speed schedule, and the fight ends at death or
 * `durationSeconds` (60s). Repeated runs give a win/draw distribution.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ THE MODEL THIS IMPLEMENTS IS docs/Reference/combat-model.md §6.       │
 * │ That document owns the per-hit resolution order, the PVP damage       │
 * │ chain, the 8x HP pool and its healing rule, the percentage-based      │
 * │ timeout, the over-cap rule, the PVP-only sigil mechanics, and every   │
 * │ documented assumption - each with a provenance tag. Do not restate    │
 * │ any of it here; if the two disagree, the document wins.               │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * WHAT THIS FILE ADDS BEYOND THE MODEL - the engine mechanics:
 *
 * TICK ARITHMETIC. All times INSIDE the engine are integer ticks; everything
 * REPORTED (endTime, trace timestamps) converts back to seconds (tick / 400).
 * A fighter swings every round(40000 / Speed) ticks, re-reading Speed after
 * every swing so timed buffs shift the next interval; both fighters' first
 * swing is on tick 1. Rounding to whole ticks costs at most +-1.25ms per
 * swing (~0.02% on attack rate), far below Monte Carlo noise at 1000 runs.
 * TICKS_PER_SEC itself is documented in combat-model.md §5.
 *
 * STAT READS GO THROUGH statNow(), NEVER `stats` DIRECTLY. Sigil buffs are
 * timed additive layers on top of the already-capped base and may exceed the
 * cap while they last, so a raw read silently loses them (combat-model.md §6,
 * "over-cap rule"). Enemy strips (negative layers) floor at 0.
 *
 * SIMULTANEITY. Events sharing a tick drain as ONE batch, so a fighter killed
 * on tick t still lands their own already-due attack at t - that is how the
 * mutual-kill outcome arises. Death is sticky: a regen or lifesteal heal in
 * the same batch cannot revive a fighter.
 *
 * ACTIVATION SCHEDULE. Pure self-buff sigils fire on tick 1, inserted before
 * that tick's swings so the buff covers the very first hit; enemy-targeting
 * sigils wait out the 1s trigger delay and first fire on tick 400.
 */

import { pvpEffect, buffedAttack } from './dps.js';
import { STAT_FIELDS } from './constants.js';
import { SIGIL_MECHANICS, DAMAGE_KINDS, SIGIL_FIRST_HIT_DELAY_SEC, sigilDefById, applySpecialGlyphsToMech } from './sigilEffects.js';
import { mulberry32, TICKS_PER_SEC, secToTicks } from './simulation.js';

export { TICKS_PER_SEC };

/**
 * Every fighter's HP pool in Arena and Clan War, as a multiple of their
 * Health stat (Jul 2026 patch; one multiplier for everyone, no level
 * breakpoint). Healing is deliberately NOT multiplied - see the header.
 */
export const PVP_HEALTH_MULTIPLIER = 8;

const PARALYZE_SECONDS = 2;
const PARALYZE_TICKS = secToTicks(PARALYZE_SECONDS);

/** Decorrelated per-iteration seed (same scheme as simulation.js). */
function iterationSeed(baseSeed, iteration) {
  return (baseSeed + Math.imul(iteration, 0x9e3779b9)) >>> 0;
}

// --- PVP sigil mechanics -------------------------------------------------

/**
 * PVE-unsupported / partially-supported sigils, now modeled against a real
 * opponent. Percentages come straight from the tooltip text in sigilsData.js.
 * Kinds beyond sigilEffects.js's set:
 *   'on-hit-marks'  every landed hit adds a mark on the ENEMY (max maxStacks)
 *                   applying perStack as a negative stat layer; sheds
 *                   shedPerSec stacks every second
 *   'hit-stacks'    stacks build on SELF from blocked ('block') or dodged/
 *                   blind-fizzled ('avoid') incoming hits, applying perStack
 *                   as a positive layer; taking an unblocked hit burns
 *                   burnOnHit stacks. thornsPerStack reflects that % of the
 *                   pre-mitigation damage of each landed incoming hit.
 */
export const PVP_SIGIL_MECHANICS = {
  ...SIGIL_MECHANICS,
  'sunder-mark': {
    kind: 'on-hit-marks', maxStacks: 8, shedPerSec: 1.75,
    perStack: { dmg_reduction: 4, block_chance: 4, miss_chance: 4, blind_chance: 4 },
  },
  'siegebreaker-mark': {
    kind: 'on-hit-marks', maxStacks: 8, shedPerSec: 1.75,
    perStack: { hp_regen: 3, block_chance: 4, miss_chance: 4, blind_chance: 4 },
  },
  'bulwark-of-thorns': {
    kind: 'hit-stacks', trigger: 'block', maxStacks: 8, burnOnHit: 2,
    perStack: { health_pct: 4, dmg_reduction: 2 }, thornsPerStack: 4,
  },
  'elusive-supremacy': {
    kind: 'hit-stacks', trigger: 'avoid', maxStacks: 8, burnOnHit: 2,
    perStack: { attack_pct: 3, crit: 3, lifesteal: 3, speed: 3 },
  },
  // regenDebuff marks the mechanic; the % itself is level-scaled and comes
  // from the entered values (resolvePvpSigils fills in mech.regenDebuffPct).
  'withering-touch': { kind: 'nuke', regenDebuff: true, debuffDurationSec: 8 },
  'thunderbind': { kind: 'nuke', paralyzeSec: PARALYZE_SECONDS },
};

/**
 * Resolve which sigils a side brings into the fight: catalogue structure +
 * the entered numbers (SigilValues shape, model.js). Passives are NOT
 * resolved here - they're already inside the side's stat totals (via
 * totals.js for the player, baked into the entered profile numbers for the
 * opponent). Returns [{ def, mech }] with entered numbers substituted in.
 */
export function resolvePvpSigils(characterClass, sigilIds, sigilValues, specialGlyphIds = []) {
  const defById = sigilDefById(characterClass);
  if (!defById) return [];
  const resolved = [];
  for (const sigilId of sigilIds || []) {
    const def = defById.get(sigilId);
    if (!def?.active) continue;
    const mech = PVP_SIGIL_MECHANICS[def.id] ?? {};
    if (mech.kind === 'unsupported') continue;
    const entered = sigilValues?.[sigilId] || {};
    resolved.push({
      def: {
        ...def,
        active: {
          ...def.active,
          stats: def.active.stats.map((s) => ({ statKey: s.statKey, value: Number(entered.active?.[s.statKey]) || 0 })),
          damage: Math.max(0, Number(entered.damage) || 0),
        },
      },
      mech: applySpecialGlyphsToMech(def.id, {
        ...mech,
        tickDamage: Math.max(0, Number(entered.tickDamage) || 0),
        regenDebuffPct: mech.regenDebuff ? Math.min(100, Math.max(0, Number(entered.regenDebuffPct) || 0)) : 0,
      }, specialGlyphIds),
    });
  }
  return resolved;
}

/**
 * Clamp a stat record to the game's hard caps. Inputs here are always
 * EFFECTIVE (post-soft-cap-curve) values - the player's from
 * resolveEffectiveTotals, the opponent's typed off their stat sheet - so
 * only impossible over-hard-cap entries are corrected; the curve itself is
 * never (re-)applied (it isn't idempotent, see statCaps.js).
 */
export function capStats(stats) {
  const capped = { ...stats };
  for (const f of STAT_FIELDS) {
    const v = Number(capped[f.key]) || 0;
    capped[f.key] = f.cap != null && v > f.cap ? f.cap : v;
  }
  return capped;
}

/**
 * Build one side of the fight. `stats` is a full OffensiveStats-shaped
 * record (the player's from resolveEffectiveTotals - already capped; the
 * opponent's manual entry - capped here either way, harmless if repeated).
 * `specialGlyphIds` are the side's equipped SPECIAL_GLYPHS ids (the player's
 * come from activeSpecialGlyphIds(character); opponents carry their own list
 * UI, so theirs default to none).
 */
export function buildPvpSide({ name = 'Fighter', stats, characterClass, sigilIds = [], sigilValues = {}, specialGlyphIds = [] }) {
  return {
    name,
    stats: capStats(stats),
    sigils: resolvePvpSigils(characterClass, sigilIds, sigilValues, specialGlyphIds),
  };
}

// --- Single duel ----------------------------------------------------------

const CHANCE_KEYS = new Set([
  'crit', 'double_hit', 'miss_chance', 'blind_chance', 'paralyze_chance',
  'block_chance', 'dmg_reduction', 'penetration', 'lifesteal', 'hp_regen',
]);

function makeFighter(side, healthMultiplier) {
  const maxHp = Math.max(1, (Number(side.stats.health) || 0) * healthMultiplier);
  return {
    name: side.name,
    stats: side.stats,
    sigils: side.sigils,
    maxHp,
    // Healing is sized off the ORIGINAL pool, so the regen tick divides the
    // multiplier back out (header: the pool grows, the healing does not).
    healthMultiplier: Math.max(1e-9, healthMultiplier),
    hp: maxHp,
    dead: false, // sticky - same-batch heals cannot revive
    bonusMaxHp: 0, // from timed health_pct layers (bulwark stacks)
    blindStacks: 0,
    paralyzedUntil: -1,
    regenFactor: 1, // withering-touch debuff multiplies this down
    regenDebuffUntil: -1,
    // Per-tick regen heal cache: recomputed only when a layer/mark/stack
    // mutates (invalidateStats) or a timed boundary (layer expiry, the
    // withering-touch window edge) passes - the common quiet tick is a
    // couple of float ops instead of a statNow rebuild.
    regenPerTick: 0,
    regenMaxHp: 0,
    regenDirty: true,
    regenValidUntil: -1,
    traceRegenAccum: 0, // regen healed since the last whole-second trace event
    layers: [], // timed stat layers: { stats: {key: value}, until } (negative = strip)
    marks: new Map(), // sigilId -> { stacks, mech } for on-hit-marks ON THIS FIGHTER
    hitStacks: new Map(), // sigilId -> { stacks, mech } for hit-stacks owned by this fighter
    statCache: new Map(), // statNow memo, valid for statCacheTime until a layer/mark/stack mutates
    statCacheTime: -1,
    counters: {
      swings: 0, hits: 0, crits: 0, doubleHits: 0, blindedSwings: 0,
      paralyzedSwings: 0, dodgedByEnemy: 0, blockedByEnemy: 0,
      blindsInflicted: 0, paralyzesInflicted: 0,
      damageDealt: 0, damageByTag: {}, healed: 0,
    },
  };
}

/** Drop the statNow memo + regen cache after any layer/mark/stack mutation. */
function invalidateStats(f) {
  f.statCacheTime = -1;
  f.regenDirty = true;
}

/** Current effective value of a stat at tick `time`: capped base + timed layers + stacks (floor 0 for chances). */
function statNow(f, key, time) {
  if (f.statCacheTime !== time) {
    f.statCacheTime = time;
    f.statCache.clear();
    // Expired layers can never contribute again - prune so the scan below
    // stays short even when buff sigils re-activate all fight.
    if (f.layers.length > 0 && f.layers.some((l) => time >= l.until)) {
      f.layers = f.layers.filter((l) => time < l.until);
    }
  } else {
    const cached = f.statCache.get(key);
    if (cached !== undefined) return cached;
  }
  let v = Number(f.stats[key]) || 0;
  for (const layer of f.layers) {
    if (time < layer.until) v += layer.stats[key] || 0;
  }
  for (const { stacks, mech } of f.marks.values()) v -= stacks * (mech.perStack[key] || 0);
  for (const { stacks, mech } of f.hitStacks.values()) v += stacks * (mech.perStack[key] || 0);
  if (CHANCE_KEYS.has(key) && v < 0) v = 0;
  f.statCache.set(key, v);
  return v;
}

function thornsPct(f) {
  let pct = 0;
  for (const { stacks, mech } of f.hitStacks.values()) pct += stacks * (mech.thornsPerStack || 0);
  return pct;
}

/** Effective max HP incl. timed health_pct layers; keeps hp ratio sane by clamping only. */
function maxHpNow(f, time) {
  const pct = statNow(f, 'health_pct', time) - (Number(f.stats.health_pct) || 0);
  return f.maxHp * (1 + Math.max(0, pct) / 100);
}

/**
 * Play one duel. Returns winner ('player' | 'opponent' | 'draw'), end time
 * (in seconds), per-side HP remaining + counters. Internally the fight runs
 * on the integer tick clock (400/s, see header).
 */
export function runPvpSingle(playerSide, opponentSide, { durationSeconds = 60, healthMultiplier = PVP_HEALTH_MULTIPLIER, rng, trace = null } = {}) {
  const durationTicks = secToTicks(durationSeconds);
  const heap = [];
  let seq = 0;
  const schedule = (time, fn) => {
    heap.push({ time, seq: seq++, fn });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (cmp(heap[i], heap[p]) >= 0) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const cmp = (a, b) => a.time - b.time || a.seq - b.seq;
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let s = i;
        if (l < heap.length && cmp(heap[l], heap[s]) < 0) s = l;
        if (r < heap.length && cmp(heap[r], heap[s]) < 0) s = r;
        if (s === i) break;
        [heap[i], heap[s]] = [heap[s], heap[i]];
        i = s;
      }
    }
    return top;
  };

  const player = makeFighter(playerSide, healthMultiplier);
  const opponent = makeFighter(opponentSide, healthMultiplier);
  player.enemy = opponent;
  opponent.enemy = player;
  player.role = 'player';
  opponent.role = 'opponent';

  // Optional combat log (timestamps in seconds for the UI). Every call sits
  // behind `trace &&` so an untraced run allocates nothing and, critically,
  // never touches the rng - a traced fight is bit-identical to the same
  // seed's untraced one.
  const traceEv = trace ? (side, kind, extra) => trace.push({ t: time / TICKS_PER_SEC, side: side.role, kind, ...extra }) : null;

  let time = 0; // current tick
  let ended = false;
  let winner = null;
  let endTick = durationTicks;
  let mutualKill = false;

  const heal = (f, amount) => {
    if (amount <= 0 || f.dead) return;
    const cap = maxHpNow(f, time);
    const applied = Math.min(amount, cap - f.hp);
    if (applied > 0) {
      f.hp += applied;
      f.counters.healed += applied;
      traceEv && traceEv(f, 'heal', { amount: applied, hp: f.hp });
    }
  };

  const dealDamage = (attacker, defender, amount, tag, meta) => {
    if (ended || amount <= 0) return;
    defender.hp -= amount;
    attacker.counters.damageDealt += amount;
    attacker.counters.damageByTag[tag] = (attacker.counters.damageByTag[tag] || 0) + amount;
    if (defender.hp <= 0) {
      defender.hp = 0;
      defender.dead = true; // fight ends when the current same-time batch drains
    }
    if (traceEv) {
      traceEv(attacker, 'damage', { tag, amount, targetHp: defender.hp, ...(meta || {}) });
      if (defender.dead) traceEv(defender, 'death', {});
    }
  };

  /** The step-6 PVP damage chain (pure sigil damage also goes through this). */
  const pvpChain = (attacker, defender, dmg) => {
    const dmgRed = Math.min(100, statNow(defender, 'dmg_reduction', time));
    return dmg
      * (1 - dmgRed / 100)
      * (1 + pvpEffect(statNow(attacker, 'pvp_attack', time)) / 100)
      * (1 - pvpEffect(statNow(defender, 'pvp_defense', time)) / 100);
  };

  /** Landed-hit procs: blind, paralyze, lifesteal, on-hit marks, thorns, stack burn. */
  const onLandedHit = (attacker, defender, damage, preMitigation, blocked) => {
    if (rng() < statNow(attacker, 'blind_chance', time) / 100) {
      defender.blindStacks += 1;
      attacker.counters.blindsInflicted += 1;
      traceEv && traceEv(attacker, 'blind', {});
    }
    if (rng() < statNow(attacker, 'paralyze_chance', time) / 100) {
      defender.paralyzedUntil = Math.max(defender.paralyzedUntil, time + PARALYZE_TICKS);
      attacker.counters.paralyzesInflicted += 1;
      traceEv && traceEv(attacker, 'paralyze', {});
    }
    heal(attacker, damage * (statNow(attacker, 'lifesteal', time) / 100));
    for (const { def, mech } of attacker.sigils) {
      if (mech.kind !== 'on-hit-marks') continue;
      let mark = defender.marks.get(def.id);
      if (!mark) {
        mark = { stacks: 0, mech };
        defender.marks.set(def.id, mark);
      }
      if (mark.stacks < mech.maxStacks) {
        mark.stacks += 1;
        invalidateStats(defender);
      }
    }
    // Thorns reflect % of the attacker's pre-mitigation hit back at them.
    const reflect = preMitigation * (thornsPct(defender) / 100);
    if (reflect > 0) dealDamage(defender, attacker, reflect, 'thorns');
    // Taking an unblocked hit burns hit-stacks (bulwark/elusive).
    if (!blocked) {
      for (const st of defender.hitStacks.values()) {
        if (st.stacks > 0) {
          st.stacks = Math.max(0, st.stacks - (st.mech.burnOnHit || 0));
          invalidateStats(defender);
        }
      }
      // Burning bulwark stacks can shrink max HP below current HP - clamp.
      const cap = maxHpNow(defender, time);
      if (defender.hp > cap) defender.hp = cap;
    }
  };

  const gainHitStack = (f, trigger) => {
    for (const { def, mech } of f.sigils) {
      if (mech.kind === 'hit-stacks' && mech.trigger === trigger) {
        let st = f.hitStacks.get(def.id);
        if (!st) {
          st = { stacks: 0, mech };
          f.hitStacks.set(def.id, st);
        }
        if (st.stacks < mech.maxStacks) {
          st.stacks += 1;
          invalidateStats(f);
        }
      }
    }
  };

  /** Resolve one hit (main swing or double-hit extra) from attacker vs defender. */
  const resolveHit = (attacker, defender, { canCrit, tag }) => {
    if (rng() < statNow(defender, 'miss_chance', time) / 100) {
      attacker.counters.dodgedByEnemy += 1;
      gainHitStack(defender, 'avoid');
      traceEv && traceEv(defender, 'dodge', { tag });
      return;
    }
    // Buffed base damage. Attack % from buffs/stacks is ADDITIVE into the
    // build's own Attack % total, so this decomposes to the flat pool and
    // recombines rather than scaling the displayed number - see dps.js
    // buffedAttack (audit F3). `flatAdd` is any timed FLAT attack layer, which
    // joins the flat pool before the percentage applies.
    const basePct = Number(attacker.stats.attack_pct) || 0;
    const flatAdd = statNow(attacker, 'attack', time) - (Number(attacker.stats.attack) || 0);
    const pctAdd = statNow(attacker, 'attack_pct', time) - basePct;
    const base = buffedAttack(attacker.stats.attack, basePct, flatAdd, Math.max(0, pctAdd));

    const blocked = rng() < statNow(defender, 'block_chance', time) / 100;
    let dmg = base;
    let isCrit = false;
    if (blocked) {
      attacker.counters.blockedByEnemy += 1;
      gainHitStack(defender, 'block');
      dmg = base * (statNow(attacker, 'penetration', time) / 100);
      if (dmg <= 0) {
        traceEv && traceEv(defender, 'block', { tag, amount: 0 });
        return; // blocked to zero: no procs
      }
    }
    // Penetration Rework: what slips through a block CAN now crit, so the crit
    // roll happens on whatever got through - blocked or not. Previously the
    // pierced portion skipped this branch entirely, which is what made
    // penetration near-useless against real block builds.
    if (canCrit && rng() < statNow(attacker, 'crit', time) / 100) {
      dmg *= statNow(attacker, 'crit_mult', time) / 100;
      attacker.counters.crits += 1;
      isCrit = true;
    }
    const final = pvpChain(attacker, defender, dmg);
    attacker.counters.hits += 1;
    dealDamage(attacker, defender, final, tag, { crit: isCrit, blocked });
    if (!ended) onLandedHit(attacker, defender, final, dmg, blocked);
  };

  const speedNow = (f) => Math.max(100, statNow(f, 'speed', time));
  // Swing interval in ticks: 40000 / speed (speed 100 -> 400 ticks = 1/s,
  // speed 400 -> 100 ticks = 4/s), re-read after every swing.
  const swingIntervalTicks = (f) => Math.max(1, Math.round(40000 / speedNow(f)));

  const scheduleSwing = (f, atTick) => {
    schedule(atTick, () => {
      if (ended) return;
      if (time < f.paralyzedUntil) {
        f.counters.paralyzedSwings += 1;
        traceEv && traceEv(f, 'paralyzed-swing', {});
      } else if (f.blindStacks > 0) {
        f.blindStacks -= 1;
        f.counters.swings += 1;
        f.counters.blindedSwings += 1;
        traceEv && traceEv(f, 'blinded-swing', {});
      } else {
        f.counters.swings += 1;
        resolveHit(f, f.enemy, { canCrit: true, tag: 'swing' });
        if (!ended && rng() < statNow(f, 'double_hit', time) / 100) {
          f.counters.doubleHits += 1;
          resolveHit(f, f.enemy, { canCrit: false, tag: 'double_hit' });
        }
      }
      scheduleSwing(f, time + swingIntervalTicks(f));
    });
  };

  // Sigil activations: firstAt, firstAt+cd, ... (cooldown starts at
  // activation). Enemy-targeting sigils first fire on tick 400 (1s), buffs
  // on tick 1 (before that tick's swings - insertion order breaks the tie).
  const scheduleSigils = (f) => {
    for (const { def, mech } of f.sigils) {
      const cd = secToTicks(Number(def.active.cooldownSec) || 0);
      const duration = secToTicks(Number(def.active.durationSec) || 0);
      const damage = Number(def.active.damage) || 0;
      const tag = `sigil_${def.id}`;
      if (mech.kind === 'on-hit-marks' || mech.kind === 'hit-stacks') continue; // passive-in-combat, no schedule
      if (cd <= 0) continue;

      // Sigil damage is SPELL damage: the caster's Spell Damage boosts it,
      // the target's Spell Resist softens it (both via statNow, so timed
      // buff layers apply), then the step-6 chain runs as for any damage.
      const pureDamage = (amount) => {
        if (amount <= 0 || ended) return;
        const boosted = amount * (1 + statNow(f, 'spell_damage', time) / 100);
        const resist = Math.min(100, statNow(f.enemy, 'spell_resist', time));
        dealDamage(f, f.enemy, pvpChain(f, f.enemy, boosted * (1 - resist / 100)), tag);
      };
      const state = { tickerStarted: false, stacks: 0 };

      const activate = () => {
        if (ended) return;
        const now = time;
        traceEv && traceEv(f, 'sigil', { name: def.name });
        switch (mech.kind) {
          case 'tick-train': {
            const interval = secToTicks(mech.tickIntervalSec || 1);
            for (let t = interval; t <= duration; t += interval) {
              schedule(now + t, () => pureDamage(damage));
            }
            break;
          }
          case 'dot': {
            pureDamage(damage);
            const interval = secToTicks(mech.tickIntervalSec || 1);
            for (let t = interval; t <= duration; t += interval) {
              schedule(now + t, () => pureDamage(mech.tickDamage || 0));
            }
            break;
          }
          case 'stacking-dot': {
            pureDamage(damage);
            state.stacks = Math.min(state.stacks + 1, mech.maxStacks || 8);
            if (!state.tickerStarted) {
              state.tickerStarted = true;
              const interval = secToTicks(mech.tickIntervalSec || 1);
              const tick = () => {
                pureDamage(state.stacks * (mech.tickDamage || 0));
                schedule(time + interval, tick);
              };
              schedule(now + interval, tick);
            }
            break;
          }
          default: {
            pureDamage(damage);
            if (mech.regenDebuffPct) {
              f.enemy.regenFactor = 1 - mech.regenDebuffPct / 100;
              f.enemy.regenDebuffUntil = now + (mech.debuffDurationSec ? secToTicks(mech.debuffDurationSec) : duration);
              f.enemy.regenDirty = true;
            }
            if (mech.paralyzeSec) {
              f.enemy.paralyzedUntil = Math.max(f.enemy.paralyzedUntil, now + secToTicks(mech.paralyzeSec));
              f.counters.paralyzesInflicted += 1;
            }
            break;
          }
        }
        if (def.active.stats.length > 0 && duration > 0) {
          const stats = {};
          for (const s of def.active.stats) stats[s.statKey] = (stats[s.statKey] || 0) + s.value;
          f.layers.push({ stats, until: now + duration });
          invalidateStats(f);
        }
        schedule(now + cd, activate);
      };
      // Enemy-targeting activations (damage, tick mechanics, or debuffs like
      // withering-touch/thunderbind) wait out the in-game 1s trigger delay;
      // pure self-buffs fire on tick 1.
      const targetsEnemy =
        DAMAGE_KINDS.has(mech.kind) || damage > 0 || mech.regenDebuffPct || mech.paralyzeSec;
      schedule(targetsEnemy ? secToTicks(SIGIL_FIRST_HIT_DELAY_SEC) : 1, activate);
    }
  };

  // Per-tick housekeeping: gradual HP regen + mark shedding. The per-tick
  // regen amount is cached and recomputed only when invalidateStats fired
  // (layer/mark/stack mutation, debuff application) or a timed boundary
  // passes (earliest layer expiry, the withering-touch window edge) - a
  // quiet tick costs a couple of float ops, no statNow rebuild.
  const housekeep = (f) => {
    if (f.regenDirty || time >= f.regenValidUntil) {
      let until = Infinity;
      for (const l of f.layers) if (l.until > time && l.until < until) until = l.until;
      if (f.regenDebuffUntil > time && f.regenDebuffUntil < until) until = f.regenDebuffUntil;
      const factor = time < f.regenDebuffUntil ? f.regenFactor : 1;
      f.regenMaxHp = maxHpNow(f, time);
      // The heal is a share of the ORIGINAL max HP (regenMaxHp is the
      // multiplied pool, and stays the clamp cap below); health_pct buffs
      // raise both pools, so dividing the multiplier back out is exact.
      const healingMaxHp = f.regenMaxHp / f.healthMultiplier;
      f.regenPerTick = healingMaxHp * (statNow(f, 'hp_regen', time) / 100 / TICKS_PER_SEC) * factor;
      f.regenValidUntil = until;
      f.regenDirty = false;
    }
    // A shrunken max HP (expired health_pct layer / burned bulwark stacks)
    // clamps current HP before the regen heal.
    if (f.hp > f.regenMaxHp) f.hp = f.regenMaxHp;
    if (f.regenPerTick > 0 && !f.dead) {
      const applied = Math.min(f.regenPerTick, f.regenMaxHp - f.hp);
      if (applied > 0) {
        f.hp += applied;
        f.counters.healed += applied;
        if (trace) f.traceRegenAccum += applied;
      }
    }
    // The trace logs regen once per whole second (24k per-tick lines would
    // drown the combat log), as one aggregated heal event.
    if (trace && time % TICKS_PER_SEC === 0 && f.traceRegenAccum > 0) {
      traceEv(f, 'heal', { amount: f.traceRegenAccum, hp: f.hp });
      f.traceRegenAccum = 0;
    }
    for (const mark of f.marks.values()) {
      if (mark.stacks > 0) {
        mark.stacks = Math.max(0, mark.stacks - (mark.mech.shedPerSec || 0) / TICKS_PER_SEC);
        invalidateStats(f);
      }
    }
  };

  // Both sides' sigils are scheduled BEFORE anyone's swings (heap ties break
  // by insertion order), so a tick-1 buff covers the very first hit.
  for (const f of [player, opponent]) scheduleSigils(f);
  for (const f of [player, opponent]) scheduleSwing(f, 1);

  // The tick loop. Combat runs on ticks 1 .. durationTicks-1; the horizon
  // tick itself only evaluates the survival winner (matching the old
  // strictly-before-the-horizon rule). Within a tick, this tick's due events
  // drain as ONE batch: attacks due on the same tick all land even if the
  // first one is lethal - that's how the game produces the both-die
  // "Defeated" outcome (header). Housekeeping (regen/shedding) runs after
  // the batch, and never for a fighter who died this tick (death is sticky).
  for (let tick = 1; tick < durationTicks && !ended; tick++) {
    time = tick;
    while (heap.length > 0 && heap[0].time <= tick) {
      pop().fn();
    }
    if (player.dead || opponent.dead) {
      ended = true;
      endTick = tick;
      mutualKill = player.dead && opponent.dead;
      // A mutual kill counts as a LOSS for the player, per the game's rules.
      winner = player.dead ? 'opponent' : 'player';
      break;
    }
    housekeep(player);
    housekeep(opponent);
  }

  if (!ended) {
    time = durationTicks;
    // Survival winner: since the Jul 2026 patch the game compares remaining
    // HP PERCENTAGE, not the raw number - 90% of a small pool now beats 10%
    // of a huge one.
    const hpPctNow = (f) => {
      const cap = maxHpNow(f, time);
      return cap > 0 ? Math.min(f.hp, cap) / cap : 0;
    };
    const pPct = hpPctNow(player);
    const oPct = hpPctNow(opponent);
    winner = pPct > oPct ? 'player' : oPct > pPct ? 'opponent' : 'draw';
    endTick = durationTicks;
  }

  const sideResult = (f) => {
    const cap = maxHpNow(f, endTick);
    const hp = Math.min(f.hp, cap); // buffed-then-expired max HP can't leave hp above cap
    return {
      hpRemaining: hp,
      maxHp: cap,
      hpPct: (hp / cap) * 100,
      ...f.counters,
    };
  };

  return {
    winner,
    endTime: endTick / TICKS_PER_SEC,
    diedEarly: endTick < durationTicks,
    mutualKill,
    player: sideResult(player),
    opponent: sideResult(opponent),
  };
}

/**
 * 95% normal-approximation half-width (in percentage points) of a rate
 * estimated over `n` independent duels - so the UI can render "62.4% ± 3.0%"
 * instead of implying false precision.
 */
export function rateCiHalfWidth(ratePct, n) {
  if (n <= 0) return 0;
  const p = Math.min(1, Math.max(0, ratePct / 100));
  return 1.96 * Math.sqrt((p * (1 - p)) / n) * 100;
}

// --- Batch + aggregation ---------------------------------------------------

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function summarize(values) {
  const sorted = Float64Array.from(values).sort();
  const n = sorted.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i];
  const mean = n > 0 ? sum / n : 0;
  return {
    mean,
    min: n ? sorted[0] : 0,
    max: n ? sorted[n - 1] : 0,
    p5: percentile(sorted, 0.05),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  };
}

/**
 * Run `iterations` independent duels. Fully reproducible from `seed`
 * (omitted -> random, echoed back). Returns win/draw rates, time-to-kill and
 * per-side damage/HP distributions, and averaged proc counters.
 */
export function runPvpSimulation({
  player,
  opponent,
  durationSeconds = 60,
  healthMultiplier = PVP_HEALTH_MULTIPLIER,
  iterations = 1000,
  seed,
} = {}) {
  const baseSeed = (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;

  let wins = 0, losses = 0, draws = 0, decided = 0, mutualKills = 0;
  const killTimes = [];
  const playerDamage = new Float64Array(iterations);
  const opponentDamage = new Float64Array(iterations);
  const playerHpPct = new Float64Array(iterations);
  const opponentHpPct = new Float64Array(iterations);
  const sums = {
    player: { swings: 0, crits: 0, doubleHits: 0, blindedSwings: 0, paralyzedSwings: 0, dodgedByEnemy: 0, blockedByEnemy: 0, blindsInflicted: 0, paralyzesInflicted: 0, healed: 0 },
    opponent: { swings: 0, crits: 0, doubleHits: 0, blindedSwings: 0, paralyzedSwings: 0, dodgedByEnemy: 0, blockedByEnemy: 0, blindsInflicted: 0, paralyzesInflicted: 0, healed: 0 },
  };
  const tagSums = { player: {}, opponent: {} };

  for (let i = 0; i < iterations; i++) {
    const rng = mulberry32(iterationSeed(baseSeed, i));
    const run = runPvpSingle(player, opponent, { durationSeconds, healthMultiplier, rng });
    if (run.winner === 'player') wins += 1;
    else if (run.winner === 'opponent') losses += 1;
    else draws += 1;
    if (run.mutualKill) mutualKills += 1; // already counted inside losses
    if (run.diedEarly) {
      decided += 1;
      killTimes.push(run.endTime);
    }
    playerDamage[i] = run.player.damageDealt;
    opponentDamage[i] = run.opponent.damageDealt;
    playerHpPct[i] = run.player.hpPct;
    opponentHpPct[i] = run.opponent.hpPct;
    for (const sideKey of ['player', 'opponent']) {
      for (const k of Object.keys(sums[sideKey])) sums[sideKey][k] += run[sideKey][k];
      for (const [tag, amount] of Object.entries(run[sideKey].damageByTag)) {
        tagSums[sideKey][tag] = (tagSums[sideKey][tag] || 0) + amount;
      }
    }
  }

  const avg = (sideKey) => {
    const out = {};
    for (const [k, v] of Object.entries(sums[sideKey])) out[k] = iterations > 0 ? v / iterations : 0;
    return out;
  };
  // Mean damage per source tag ('swing', 'double_hit', 'thorns', per-sigil
  // tags…), largest first.
  const avgTags = (sideKey) =>
    Object.fromEntries(
      Object.entries(tagSums[sideKey])
        .map(([tag, total]) => [tag, iterations > 0 ? total / iterations : 0])
        .sort((a, b) => b[1] - a[1])
    );

  return {
    iterations,
    durationSeconds,
    healthMultiplier,
    seed: baseSeed,
    winRate: iterations > 0 ? (wins / iterations) * 100 : 0,
    lossRate: iterations > 0 ? (losses / iterations) * 100 : 0,
    drawRate: iterations > 0 ? (draws / iterations) * 100 : 0,
    mutualKillRate: iterations > 0 ? (mutualKills / iterations) * 100 : 0, // subset of lossRate
    killRate: iterations > 0 ? (decided / iterations) * 100 : 0,
    timeToKill: summarize(killTimes),
    player: { damageDealt: summarize(playerDamage), hpRemainingPct: summarize(playerHpPct), perRun: avg('player'), damageByTag: avgTags('player') },
    opponent: { damageDealt: summarize(opponentDamage), hpRemainingPct: summarize(opponentHpPct), perRun: avg('opponent'), damageByTag: avgTags('opponent') },
  };
}

/**
 * Play ONE duel with an event trace - the "sample fight" combat log. Uses the
 * same per-iteration rng stream as `runPvpSimulation`'s first duel for the
 * same seed, so the traced fight is literally duel #1 of that batch. Tracing
 * never touches the rng, so the outcome is identical with or without it.
 */
export function runTracedDuel({ player, opponent, durationSeconds = 60, healthMultiplier = PVP_HEALTH_MULTIPLIER, seed } = {}) {
  const baseSeed = (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0;
  const rng = mulberry32(iterationSeed(baseSeed, 0));
  const trace = [];
  const run = runPvpSingle(player, opponent, { durationSeconds, healthMultiplier, rng, trace });
  return { seed: baseSeed, events: trace, run };
}
