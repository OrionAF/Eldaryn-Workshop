// The PVP duel resolver: the main loop of simulateArenaPvP (module 5399) plus the runDuel wrapper.
// Rules: Game/combat-pvp.md §4 (tick loop), §7 (regen), §10 (winner). The pieces it drives are ported
// in pvp/attack.js (one swing, regen), pvp/arenaSpells.js (one caster's spells), pvp/reactions.js
// (duel state, stacks, thorns, minion strikes) and core/*.
//
// Draw order is behaviour. Per tick: attacker spell crits, defender spell crits, DoT crits of the
// debuffs on the defender, then on the attacker, the attacker's swing (pvp/attack.js order), the
// attacker's minion crit, the defender's swing, the defender's minion crit.
import { ARENA_CONSTANTS } from '../../game/combatPvp.js';
import { processAttack, applyRegen, pvpRatingToFraction } from './attack.js';
import { applyPvpHpBuff } from './hpBuff.js';
import { processArenaSpells } from './arenaSpells.js';
import { createDuelState, createReactions } from './reactions.js';
import { duelEvent, hpAfter } from './events.js';
import {
  initSpellRuntimes, computeActiveBuffModifiers, isSpellBuffActive, activeBuffThornsPercent, hasActiveEffects,
  EMPTY_BUFF_MODIFIERS,
} from '../core/spells.js';
import {
  initDebuffState, processDebuffsTick, computeDebuffModifiers, slowedAttackSpeed,
} from '../core/debuffs.js';
import { applyBuffsToEntity, hasActiveBuffs, getBuffedMaxHp } from '../core/buffs.js';
import { absorbWithShield } from '../core/shield.js';
import {
  advanceMinionRespawn, minionSummonMeta, openingSummonWindowMs, openingSwingTimerStart, summonMinion,
} from '../core/minions.js';
import {
  buildCombatSpells, getEquippedShieldConfig, getEquippedSummonConfig, classifyShieldVariant,
} from '../core/spellConfig.js';
import { glyphCombatMods } from '../core/glyphMods.js';
import { disruptionEffectFor } from '../core/disruption.js';
import { assertFiniteEntity } from '../validate.js';
import { lane } from '../rng.js';

/** @typedef {import('./events.js').DuelEvent} DuelEvent */
/** @typedef {import('./events.js').ArenaPvpResult} ArenaPvpResult */
/** @typedef {import('./events.js').DuelSummary} DuelSummary */

/** Every numeric field createPlayerEntity produces; a duel needs each of them finite (plan I9). */
const ENTITY_KEYS = Object.freeze([
  'maxHp', 'rawMaxHp', 'hp', 'attack', 'attackSpeed', 'doubleHit', 'critChance', 'critDamage', 'lifesteal',
  'hpRegen', 'damageReduction', 'blockChance', 'missChance', 'blindChance', 'paralyzeChance', 'penetration',
  'disruptionChance', 'pvpAttack', 'pvpDefense', 'spellDamage', 'spellResist', 'spellCritChance', 'spellVamp',
]);

/**
 * The sheet keys a duel needs, with the neutral value an absent one takes (stats.md §2: chances, ratings,
 * regen and DR are 0, Crit Damage is the base 1.5). HP, Attack and Attack Speed have no neutral value:
 * a sheet without them cannot duel (features/duel.js `missingStats`).
 */
export const DUEL_STAT_DEFAULTS = Object.freeze({
  totalDoubleHit: 0, totalCritChance: 0, totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0,
  totalDamageReduction: 0, totalBlockChance: 0, totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0,
  totalPenetration: 0, totalDisruptionChance: 0, totalPvpAttack: 0, totalPvpDefense: 0, totalSpellDamage: 0,
  totalSpellResist: 0, totalSpellCritChance: 0, totalSpellVamp: 0,
});

/**
 * A complete duel sheet from a sparse one (blank rows, stats the class sheet hides). Present keys are
 * kept as given; absent ones take their neutral value; `disruptionEffect` is derived from class and form
 * when the sheet carries none. Returns a copy and the keys that were defaulted.
 * @param {Object} stats
 * @param {string} [playerClass]
 * @param {'BEAR'|'WOLF'|null} [form]
 * @returns {{stats: Object, defaulted: string[]}}
 */
export function completeDuelStats(stats, playerClass, form = null) {
  const out = { ...stats };
  const defaulted = [];
  for (const [key, neutral] of Object.entries(DUEL_STAT_DEFAULTS)) {
    if (out[key] == null) { out[key] = neutral; defaulted.push(key); }
  }
  if (out.disruptionEffect == null) out.disruptionEffect = disruptionEffectFor(playerClass, form);
  return { stats: out, defaulted };
}

const STATUS_FIELDS = ['blinded', 'paralyzedMs', 'silencedMs', 'staggerStacks', 'fearedMs'];

// The client reads these status fields off the entity without creating them; they start here.
function initStatus(e) {
  e.blinded = false;
  e.paralyzedMs = 0;
  e.silencedMs = 0;
  e.staggerStacks = 0;
  e.fearedMs = 0;
}

// L1456166-1456265: each status timer counts down by one tick, floored at 0.
function countDown(e, dtMs) {
  if (e.paralyzedMs > 0) e.paralyzedMs = Math.max(0, e.paralyzedMs - dtMs);
  if (e.silencedMs > 0) e.silencedMs = Math.max(0, e.silencedMs - dtMs);
  if (e.fearedMs > 0) e.fearedMs = Math.max(0, e.fearedMs - dtMs);
}

// computeActiveBuffModifiers sums the active runtimes only; skip the walk when none is active.
const buffMods = (runtimes) => (hasActiveEffects(runtimes) ? computeActiveBuffModifiers(runtimes) : EMPTY_BUFF_MODIFIERS);

// L1457022-1457045, 1457143-1457166: the swing ran on the buffed copies; copy the status fields back.
function syncStatus(to, from) {
  if (to === from) return;
  for (const f of STATUS_FIELDS) to[f] = from[f];
}

// port of simulateArenaPvP L1454718-1457623 (setup L1455734-1456044, loop L1456045-1457455, end and
// result L1457456-1457621)
/**
 * One arena duel. The 14 positional arguments are the client's; `opts` is this port's addition.
 * @param {Object} a0 attacker stats (ComputedStats with the x8 buff applied: applyPvpHpBuff)
 * @param {Object} a1 defender stats
 * @param {Array<Object>|null} a2 attacker castable spells (CombatSpellConfig[]; buildCombatSpells)
 * @param {Array<Object>|null} a3 defender castable spells
 * @param {Array<string>|null} a4 attacker equipped sigil species (stack sigils)
 * @param {Array<string>|null} a5 defender equipped sigil species
 * @param {Object|null} a6 attacker glyph combat mods ({stack, ironBastionThornsPercent})
 * @param {Object|null} a7 defender glyph combat mods
 * @param {Object|null} a8 attacker shield config ({hpPercent, vampAlwaysRefills, regenAlwaysRefills})
 * @param {Object|null} a9 defender shield config
 * @param {Object|null} a10 attacker stack context ({playerClass, activeSpec, form})
 * @param {Object|null} a11 defender stack context
 * @param {Object|null} a12 attacker summon config (getEquippedSummonConfig)
 * @param {Object|null} a13 defender summon config
 * @param {{rng: () => number, log?: boolean}} opts  `log=false` is the event-free mode: same draws and
 *   state, `ticks` is []
 * @returns {ArenaPvpResult}
 */
export function simulateArenaPvP(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, opts) {
  const rng = opts?.rng;
  if (typeof rng !== 'function') throw new TypeError('simulateArenaPvP: opts.rng is required');
  const log = opts.log !== false;

  const s = createDuelState({
    attackerStats: a0, defenderStats: a1, attackerSummon: a12, defenderSummon: a13,
    attackerShield: a8, defenderShield: a9, attackerEquipped: a4, defenderEquipped: a5,
    attackerGlyphCombat: a6, defenderGlyphCombat: a7, attackerStackCtx: a10, defenderStackCtx: a11,
    attackerSpellRuntimes: a2?.length ? initSpellRuntimes(a2) : null, // L1455880-1455910
    defenderSpellRuntimes: a3?.length ? initSpellRuntimes(a3) : null,
    rng,
  });
  const R = createReactions(s, { isSpellBuffActive, activeBuffThornsPercent, pvpRatingToFraction });
  const A = s.attacker;
  const D = s.defender;
  assertFiniteEntity('attacker', A, ENTITY_KEYS);
  assertFiniteEntity('defender', D, ENTITY_KEYS);
  const aMin = s.attackerMinion;
  const dMin = s.defenderMinion;
  const aRt = s.attackerSpellRuntimes;
  const dRt = s.defenderSpellRuntimes;
  const aStack = s.attackerStack;
  const dStack = s.defenderStack;
  const events = s.events;
  const dt = s.tickMs;
  initStatus(A);
  initStatus(D);
  const aDebuffs = initDebuffState(); // debuffs ON the attacker (cast by the defender)
  const dDebuffs = initDebuffState(); // debuffs ON the defender

  // Event-free mode still needs a tick's events where the client reads them back: the swing events
  // feed reactToAttack (stacks, thorns), and every damage row feeds the minions' soul link
  // (finishMinionTick). The rows are dropped at the end of each tick.
  const reactsToSwings = s.stacksActive || s.attackerIronBastionPercent > 0 || s.defenderIronBastionPercent > 0
    || aRt != null || dRt != null;
  const keepRows = log || s.hasMinions;
  const swingRows = keepRows || reactsToSwings;

  // --- opening (L1455934-1456044): only with a minion on either side ---
  let elapsed = 0;
  let swingA = 0;
  let swingD = 0;
  let regenA = 0;
  let regenD = 0;
  if (s.hasMinions) {
    const windowMs = openingSummonWindowMs([aMin, dMin]);
    if (aMin) {
      summonMinion(aMin);
      if (log) events.push({ ...duelEvent(0, 'attacker_minion_summoned', 0, A, D, false), ...minionSummonMeta(aMin, windowMs) });
    }
    if (dMin) {
      summonMinion(dMin);
      if (log) events.push({ ...duelEvent(0, 'defender_minion_summoned', 0, A, D, false), ...minionSummonMeta(dMin, windowMs) });
    }
    if (log) {
      R.tagMinionSnapshots(0);
      if (s.hasShields) R.tagShieldSnapshots(0);
    }
    s.timestamp = windowMs;
    swingA = openingSwingTimerStart(Math.round(1000 / A.attackSpeed), windowMs, 0);
    swingD = openingSwingTimerStart(Math.round(1000 / D.attackSpeed), windowMs, 0);
    if (aMin) aMin.timer = openingSwingTimerStart(Math.round(1000 / aMin.attackSpeed), windowMs, aMin.timer);
    if (dMin) dMin.timer = openingSwingTimerStart(Math.round(1000 / dMin.attackSpeed), windowMs, dMin.timer);
    elapsed = windowMs;
  }
  const horizon = ARENA_CONSTANTS.FIGHT_DURATION_MS + elapsed; // L1456046-1456047
  // Buff modifiers of each side's runtimes. Only that side's processArenaSpells changes its runtimes,
  // so the value after a side's cast is also its value at the start of the next tick (L1456321-1456360
  // recomputes it there; same result).
  let aMods = aRt ? buffMods(aRt) : null;
  let dMods = dRt ? buffMods(dRt) : null;

  // L1456488-1456788: one side's debuffs tick; the damage goes through the victim's PVP Defense
  // once, then its shield. Rows are named after the CASTER's side.
  const tickDebuffs = (list, victim, casterSide, t) => {
    const r = processDebuffsTick(list, dt, t, lane(rng, casterSide));
    if (r.targetHpDelta < 0) {
      let dmg = Math.abs(r.targetHpDelta);
      if (victim.pvpDefense > 0) dmg = Math.max(1, Math.round(dmg * (1 - pvpRatingToFraction(victim.pvpDefense))));
      const ab = absorbWithShield(victim.shieldHp, dmg);
      victim.shieldHp = ab.shieldHp;
      victim.hp -= ab.hpDamage;
    }
    if (!keepRows) return;
    const frac = victim.pvpDefense > 0 ? pvpRatingToFraction(victim.pvpDefense) : 0;
    for (const ev of r.events) {
      const isTick = ev.type === 'debuff_tick';
      const row = {
        timestamp: ev.timestamp,
        type: `${casterSide}_${isTick ? 'spell_debuff_tick' : 'spell_debuff_expired'}`,
        damage: isTick && frac > 0 ? Math.max(1, Math.round(ev.value * (1 - frac))) : ev.value,
        ...hpAfter(A, D),
        spell: ev.source,
        debuffStacks: ev.stacks,
        debuffMaxStacks: ev.maxStacks,
        debuffPermanent: ev.permanent,
        damagePerTick: ev.damagePerTick,
      };
      if (ev.isCrit) row.isCrit = true;
      events.push(row);
    }
  };

  // Death row (L1457310-1457455): one side down -> `<loser>_dead` with clamped HP; both down -> the
  // higher (less negative) HP wins, a tie goes to the defender.
  const pushDeath = (t, mutualZero) => {
    if (!log) return;
    if (A.hp <= 0 && D.hp <= 0) {
      const type = A.hp > D.hp ? 'defender_dead' : 'attacker_dead';
      events.push(mutualZero ? { timestamp: t, type, damage: 0, attackerHpAfter: 0, defenderHpAfter: 0 } : duelEvent(t, type, 0, A, D));
    } else {
      events.push(duelEvent(t, D.hp <= 0 ? 'defender_dead' : 'attacker_dead', 0, A, D));
    }
  };

  // One swing of `atkE` at `defE` (the buffed copies) and its bookkeeping (L1456993-1457109, 1457114-1457230).
  const swing = (atkE, defE, atk, def, t, isAttacker, maxHp, defMinion, atkDebuffs, defStack, atkStack) => {
    const undoStack = R.applyStackToTarget(defE, defStack, atkStack);
    defE.shieldHp = def.shieldHp;
    const undoCrit = R.applyCritDownToSwinger(atkE, atkDebuffs);
    const evs = processAttack(atkE, defE, t, isAttacker, maxHp, defMinion, rng, swingRows);
    undoCrit();
    undoStack();
    atk.hp = atkE.hp;
    def.hp = defE.hp;
    def.shieldHp = defE.shieldHp;
    syncStatus(A, isAttacker ? atkE : defE);
    syncStatus(D, isAttacker ? defE : atkE);
    if (keepRows) for (const ev of evs) events.push({ ...ev, ...hpAfter(A, D) });
    R.reactToAttack(evs);
    if (atkE !== atk) atkE.hp = atk.hp;
    if (defE !== def) defE.hp = def.hp;
  };

  // --- the clock (L1456045-1457455) ---
  while (A.hp > 0 && D.hp > 0 && elapsed < horizon) {
    const t = elapsed + dt;
    s.timestamp = t;
    const start = events.length;

    if (s.hasMinions) { // L1456105-1456165
      if (aMin && advanceMinionRespawn(aMin, dt) && log) {
        events.push({ ...duelEvent(t, 'attacker_minion_summoned', 0, A, D), ...minionSummonMeta(aMin) });
      }
      if (dMin && advanceMinionRespawn(dMin, dt) && log) {
        events.push({ ...duelEvent(t, 'defender_minion_summoned', 0, A, D), ...minionSummonMeta(dMin) });
      }
    }
    swingA += dt;
    swingD += dt;
    regenA += dt;
    regenD += dt;
    countDown(A, dt); // the client runs paralyze A, D, silence A, D, fear A, D: independent fields
    countDown(D, dt);

    // spells (L1456266-1456420): Bulwark's max-HP share feeds each caster's spell heal cap
    let aMaxHp = A.maxHp;
    let dMaxHp = D.maxHp;
    const aStackHp = s.stacksActive && aStack.active ? aStack.selfModifiers().hpPercent : 0;
    const dStackHp = s.stacksActive && dStack.active ? dStack.selfModifiers().hpPercent : 0;
    const aBuffBefore = aMods;
    const dBuffBefore = dMods;
    let aBuff = null;
    let dBuff = null;
    if (aRt) {
      const rows = processArenaSpells(aRt, {
        caster: A, target: D, dtMs: dt, timestamp: t, side: 'attacker', targetDebuffs: dDebuffs, casterDebuffs: aDebuffs,
        targetSpellResistBonus: dBuffBefore?.spellResist ?? 0, casterHpPercentBonus: aStackHp,
        targetMinion: dMin, casterMinion: aMin, log: keepRows,
      }, lane(rng, 'attacker'));
      for (const r of rows) events.push(r);
      aMods = buffMods(aRt);
      aBuff = aMods;
      aMaxHp = getBuffedMaxHp(A.maxHp, aBuff.hpPercent);
    }
    if (dRt) {
      const rows = processArenaSpells(dRt, {
        caster: D, target: A, dtMs: dt, timestamp: t, side: 'defender', targetDebuffs: aDebuffs, casterDebuffs: dDebuffs,
        targetSpellResistBonus: aBuffBefore?.spellResist ?? 0, casterHpPercentBonus: dStackHp,
        targetMinion: aMin, casterMinion: dMin, log: keepRows,
      }, lane(rng, 'defender'));
      for (const r of rows) events.push(r);
      dMods = buffMods(dRt);
      dBuff = dMods;
      dMaxHp = getBuffedMaxHp(D.maxHp, dBuff.hpPercent);
    }
    // Bulwark's max-HP bonus stacks on the spell one and clamps HP (L1456422-1456487)
    if (s.stacksActive) {
      if (aStack.active) {
        const m = aStack.selfModifiers();
        if (m.hpPercent > 0) {
          aMaxHp = getBuffedMaxHp(A.maxHp, (aBuff ? aBuff.hpPercent : 0) + m.hpPercent);
          if (A.hp > aMaxHp) A.hp = aMaxHp;
        }
      }
      if (dStack.active) {
        const m = dStack.selfModifiers();
        if (m.hpPercent > 0) {
          dMaxHp = getBuffedMaxHp(D.maxHp, (dBuff ? dBuff.hpPercent : 0) + m.hpPercent);
          if (D.hp > dMaxHp) D.hp = dMaxHp;
        }
      }
    }

    // debuff ticks: the defender's first (L1456488-1456637), then the attacker's (L1456638-1456788)
    if (dDebuffs.length > 0) tickDebuffs(dDebuffs, D, 'attacker', t);
    if (aDebuffs.length > 0) tickDebuffs(aDebuffs, A, 'defender', t);

    // killed by a spell or DoT: no regen, no swings this tick (L1456789-1456796, tail L1457375-1457455)
    if (A.hp <= 0 || D.hp <= 0) {
      if (s.hasMinions) R.finishMinionTick(start);
      pushDeath(t, false);
      if (log && s.hasShields) R.tagShieldSnapshots(start);
      if (log && s.hasMinions) R.tagMinionSnapshots(start);
      elapsed = t;
      break;
    }

    // timed buffs on copies (L1456797-1456826)
    const aE = aBuff && hasActiveBuffs(aBuff) ? applyBuffsToEntity(A, aBuff) : A;
    const dE = dBuff && hasActiveBuffs(dBuff) ? applyBuffsToEntity(D, dBuff) : D;

    // regen with Wound (percent) and Siegebreaker mark (points, floor 0) reductions (L1456827-1456988)
    const aWound = computeDebuffModifiers(aDebuffs).regenReductionPercent;
    const dWound = computeDebuffModifiers(dDebuffs).regenReductionPercent;
    const aRegen0 = aE.hpRegen;
    const dRegen0 = dE.hpRegen;
    if (aWound > 0) aE.hpRegen = aE.hpRegen * (1 - aWound / 100);
    if (dWound > 0) dE.hpRegen = dE.hpRegen * (1 - dWound / 100);
    if (s.stacksActive) {
      const onA = dStack.targetModifiers().hpRegenReductionPercent;
      const onD = aStack.targetModifiers().hpRegenReductionPercent;
      if (onA > 0) aE.hpRegen = Math.max(0, aE.hpRegen - onA);
      if (onD > 0) dE.hpRegen = Math.max(0, dE.hpRegen - onD);
    }
    const ra = applyRegen(aE, regenA, aMaxHp);
    regenA = ra.timer;
    aE.hpRegen = aRegen0;
    A.hp = aE.hp;
    if (ra.healed > 0 && log) events.push(duelEvent(t, 'attacker_regen', ra.healed, A, D, false));
    if (ra.overflow > 0 && A.shieldMax > 0 && A.shieldHp < A.shieldMax) {
      A.shieldHp = Math.min(A.shieldMax, A.shieldHp + ra.overflow);
      if (aE !== A) aE.shieldHp = A.shieldHp;
    }
    const rd = applyRegen(dE, regenD, dMaxHp);
    regenD = rd.timer;
    dE.hpRegen = dRegen0;
    D.hp = dE.hp;
    if (rd.healed > 0 && log) events.push(duelEvent(t, 'defender_regen', rd.healed, A, D, false));
    if (rd.overflow > 0 && D.shieldMax > 0 && D.shieldHp < D.shieldMax) {
      D.shieldHp = Math.min(D.shieldMax, D.shieldHp + rd.overflow);
      if (dE !== D) dE.shieldHp = D.shieldHp;
    }

    // the attacker swings first (L1456989-1457109) ...
    const undoElusiveA = R.applyElusiveToSwinger(aE, aStack);
    const intervalA = Math.round(1000 / slowedAttackSpeed(aE.attackSpeed, aDebuffs));
    if (swingA >= intervalA) {
      swingA -= intervalA;
      swing(aE, dE, A, D, t, true, aMaxHp, dMin, aDebuffs, dStack, aStack);
    }
    undoElusiveA();
    if (aMin) R.minionStrike(aMin, 'attacker', D, dE, dStack, aStack);

    // ... then the defender, even if the attacker's swing killed it (L1457110-1457230)
    const undoElusiveD = R.applyElusiveToSwinger(dE, dStack);
    const intervalD = Math.round(1000 / slowedAttackSpeed(dE.attackSpeed, dDebuffs));
    if (swingD >= intervalD) {
      swingD -= intervalD;
      swing(dE, aE, D, A, t, false, dMaxHp, aMin, dDebuffs, aStack, dStack);
    }
    undoElusiveD();
    if (dMin) R.minionStrike(dMin, 'defender', A, aE, aStack, dStack);

    // end of tick (L1457231-1457309)
    if (s.hasMinions) R.finishMinionTick(start);
    if (s.stacksActive) {
      aStack.tick(dt);
      dStack.tick(dt);
      if (log) {
        const sa = aStack.snapshot();
        const sd = dStack.snapshot();
        for (let i = start; i < events.length; i++) {
          const ev = events[i];
          ev.attackerBulwarkStacks = sa.bulwarkStacks;
          ev.attackerSunderStacks = sa.sunderStacks;
          ev.defenderBulwarkStacks = sd.bulwarkStacks;
          ev.defenderSunderStacks = sd.sunderStacks;
        }
      }
    }
    if (log && s.hasShields) R.tagShieldSnapshots(start);
    elapsed = t;
    if (A.hp <= 0 || D.hp <= 0) {
      pushDeath(t, true);
      if (log && s.hasShields) R.tagShieldSnapshots(start);
      if (log && s.hasMinions) R.tagMinionSnapshots(start);
      break;
    }
    if (log && s.hasMinions) R.tagMinionSnapshots(start);
    if (!log) events.length = 0;
  }

  // --- the result (L1457456-1457621) ---
  let attackerWon;
  if (A.hp > 0 && D.hp > 0) { // time up (L1457456-1457524): clamp to max HP, strictly more raw HP wins
    A.hp = Math.min(A.hp, A.maxHp);
    D.hp = Math.min(D.hp, D.maxHp);
    attackerWon = A.hp > D.hp;
    const from = events.length;
    if (log) events.push(duelEvent(elapsed, 'time_up', 0, A, D, false));
    if (s.hasMinions) R.killMinionsOfDead(!attackerWon, attackerWon);
    if (log) {
      events.push(duelEvent(elapsed, attackerWon ? 'defender_dead' : 'attacker_dead', 0, A, D, false));
      if (s.hasShields) R.tagShieldSnapshots(from);
      if (s.hasMinions) R.tagMinionSnapshots(from);
    }
  } else if (A.hp <= 0 && D.hp <= 0) {
    attackerWon = A.hp > D.hp; // mutual kill (L1457525-1457545)
  } else {
    attackerWon = D.hp <= 0;
  }
  if (!log) events.length = 0;

  const out = {
    ticks: events,
    totalDuration: elapsed,
    attackerWon,
    attackerMaxHp: A.maxHp,
    defenderMaxHp: D.maxHp,
    attackerHpRemaining: Math.max(0, A.hp),
    defenderHpRemaining: Math.max(0, D.hp),
  };
  if (A.shieldMax > 0) out.attackerShieldMax = A.shieldMax;
  if (D.shieldMax > 0) out.defenderShieldMax = D.shieldMax;
  if (A.shieldMax > 0) out.attackerShieldVariant = classifyShieldVariant(a8);
  if (D.shieldMax > 0) out.defenderShieldVariant = classifyShieldVariant(a9);
  return out;
}

/**
 * The 14 simulateArenaPvP arguments of one side, from a Fighter (types.js). Stats get the x8 PVP HP
 * buff (applyPvpHpBuff never buffs twice). Generic sigils are the equipped slots and stack sources;
 * `utility` is the Summon / Shield slot (the Form slot for a Druid). `ancient` is owned but not cast:
 * the arena loop has no Transform trigger (see the slice notes).
 * @param {import('../types.js').Fighter & {form?: 'BEAR'|'WOLF'|null}} f
 */
export function fighterDuelArgs(f) {
  const playerClass = f.class;
  const spec = f.spec ?? null;
  // buildFighter emits formKind (and formConfig.form); accept those as well as an explicit `form`.
  const form = f.form ?? f.formKind ?? f.formConfig?.form ?? null;
  const druid = playerClass === 'MYSTIC' && spec === 'MYSTIC_DRUID';
  const sigils = f.sigils ?? [];
  const generic = sigils.map((x) => x.species);
  const ownedSigils = [...sigils, f.utility, f.ancient].filter(Boolean).map((x) => ({
    species: x.species,
    level: x.level,
    activationCondition: f.conditions?.[x.species],
  }));
  const state = {
    ownedSigils,
    equippedSpecies: druid ? [] : generic,
    druidEquippedSpecies: druid ? generic : [],
    utilitySlotSpecies: druid ? null : f.utility?.species ?? null,
    druidUtilitySlotSpecies: druid ? f.utility?.species ?? null : null,
    altarTier: f.altarTier ?? 1,
  };
  const glyphs = glyphCombatMods(f.glyphMods ?? [], playerClass, spec);
  const { stats } = completeDuelStats(f.stats, playerClass, form);
  return {
    stats: applyPvpHpBuff(stats),
    spells: buildCombatSpells(state, playerClass, spec, form, glyphs.mods),
    equipped: generic,
    glyphCombat: glyphs.combat,
    shield: getEquippedShieldConfig(state, spec, glyphs.mods),
    stackCtx: { playerClass, activeSpec: spec, form },
    summon: getEquippedSummonConfig(state),
  };
}

/**
 * One duel between two Fighters (rebuild-plan §2.3). `log` defaults to false (the event-free mode).
 * @param {{attacker: Object, defender: Object, rng: () => number, log?: boolean}} p
 *   attacker / defender: Fighters, or the output of fighterDuelArgs
 * @returns {DuelSummary & {result: ArenaPvpResult}}
 */
export function runDuel({ attacker, defender, rng, log = false }) {
  const a = attacker.stackCtx ? attacker : fighterDuelArgs(attacker);
  const d = defender.stackCtx ? defender : fighterDuelArgs(defender);
  const r = simulateArenaPvP(
    a.stats, d.stats, a.spells, d.spells, a.equipped, d.equipped, a.glyphCombat, d.glyphCombat,
    a.shield, d.shield, a.stackCtx, d.stackCtx, a.summon, d.summon, { rng, log },
  );
  const timedOut = r.attackerHpRemaining > 0 && r.defenderHpRemaining > 0;
  const summary = {
    winner: r.attackerWon ? 'attacker' : 'defender',
    attackerWon: r.attackerWon,
    timeMs: r.totalDuration,
    timedOut,
    attackerHpLeft: r.attackerHpRemaining,
    defenderHpLeft: r.defenderHpRemaining,
    attackerMaxHp: r.attackerMaxHp,
    defenderMaxHp: r.defenderMaxHp,
    result: r,
  };
  if (log) summary.log = r.ticks;
  return summary;
}
