// The PVP duel log schema (`DuelEvent`) produced by pvp/resolver.js and consumed by DuelTimeline (F3)
// and replayCheck (E9). Field names are the client's (simulateArenaPvP L1454718-1457623); the event
// model is described in Game/combat-pvp.md §11. Pure; no rng.

/**
 * One row of the duel log. Every row has the first five fields; the rest appear only on the event
 * types that carry them. `attackerHpAfter` / `defenderHpAfter` are clamped at 0 on most rows; the
 * client leaves them unclamped on regen, opening-summon and timeout rows (see resolver.js).
 * @typedef {Object} DuelEvent
 * @property {number} timestamp   ms since the fight start (the opening summon window counts)
 * @property {string} type        `<side>_<kind>` (see SIDE_EVENT_KINDS) or 'time_up'
 * @property {number} damage      damage dealt, HP healed (regen, minion heal) or 0
 * @property {number} attackerHpAfter
 * @property {number} defenderHpAfter
 * @property {boolean} [isCrit]
 * @property {boolean} [doubleHit]
 * @property {{name: string, icon: string|null, species: string}} [spell]  spell / debuff / minion source
 * @property {number} [paralyzeMs]
 * @property {number} [fearMs]
 * @property {number} [staggerStacks]
 * @property {number} [debuffStacks]
 * @property {number} [debuffMaxStacks]
 * @property {boolean} [debuffPermanent]
 * @property {number} [damagePerTick]
 * @property {number} [attackerMomentumStacks]
 * @property {number} [defenderMomentumStacks]
 * @property {number} [minionMaxHp]
 * @property {number} [minionRespawnMs]
 * @property {number} [summonReadyMs]   opening summon rows only
 * @property {number} [attackerShieldHpAfter]   stamped on every row of a tick when either side has a shield
 * @property {number} [defenderShieldHpAfter]
 * @property {number} [attackerMinionHpAfter]   stamped when that side has a minion
 * @property {number} [defenderMinionHpAfter]
 * @property {number} [attackerBulwarkStacks]   stamped when a stack sigil is active (not on death rows)
 * @property {number} [attackerSunderStacks]
 * @property {number} [defenderBulwarkStacks]
 * @property {number} [defenderSunderStacks]
 */

/**
 * The verbatim `simulateArenaPvP` return value (L1457545-1457621).
 * @typedef {Object} ArenaPvpResult
 * @property {DuelEvent[]} ticks       the log; [] in event-free mode
 * @property {number} totalDuration    timestamp of the last processed tick (ms)
 * @property {boolean} attackerWon
 * @property {number} attackerMaxHp    the x8 pool
 * @property {number} defenderMaxHp
 * @property {number} attackerHpRemaining  max(0, hp)
 * @property {number} defenderHpRemaining
 * @property {number} [attackerShieldMax]  only when > 0
 * @property {number} [defenderShieldMax]
 * @property {'arcane'|'void'|'abyssal'} [attackerShieldVariant]  only when that side has a shield
 * @property {'arcane'|'void'|'abyssal'} [defenderShieldVariant]
 */

/**
 * runDuel's summary. A superset of types.js `DuelResult`; `winner` is never 'draw' (the engine has
 * no draw: a timeout tie and an equal mutual kill both go to the defender).
 * @typedef {Object} DuelSummary
 * @property {'attacker'|'defender'} winner
 * @property {boolean} attackerWon
 * @property {number} timeMs
 * @property {boolean} timedOut
 * @property {number} attackerHpLeft
 * @property {number} defenderHpLeft
 * @property {number} attackerMaxHp
 * @property {number} defenderMaxHp
 * @property {DuelEvent[]} [log]  only when options.log is true
 */

/** Event kinds that follow a `attacker_` / `defender_` prefix (combat-pvp.md §11). */
export const SIDE_EVENT_KINDS = Object.freeze([
  'hit', 'crit', 'miss', 'block', 'blind', 'blinded', 'paralyze', 'paralyzed', 'fear', 'feared',
  'silenced', 'staggered', 'regen', 'thorns_reflect', 'dead',
  'minion_summoned', 'minion_hit', 'minion_crit', 'minion_damaged', 'minion_dead', 'minion_heal',
  'spell_cast', 'spell_damage', 'spell_dot_tick', 'spell_heal_tick', 'spell_buff_start', 'spell_end',
  'spell_debuff_applied', 'spell_debuff_stack', 'spell_debuff_tick', 'spell_debuff_expired',
  'minion_buff', 'minion_buff_end',
]);

/** The one unprefixed type. */
export const TIME_UP = 'time_up';

/**
 * Splits a log type into its side and kind: 'defender_spell_damage' -> {side: 'defender', kind:
 * 'spell_damage'}; 'time_up' -> {side: null, kind: 'time_up'}. Which side a prefix names depends on
 * the kind (combat-pvp.md §6, pvp/attack.js): swings name the swinger, avoid / status / minion rows the
 * target, spell rows the caster except status rows (the victim).
 * @param {string} type
 * @returns {{side: 'attacker'|'defender'|null, kind: string}}
 */
export function parseEventType(type) {
  if (type.startsWith('attacker_')) return { side: 'attacker', kind: type.slice(9) };
  if (type.startsWith('defender_')) return { side: 'defender', kind: type.slice(9) };
  return { side: null, kind: type };
}

/** Clamped HP-after pair of the two duelists (`Math.max(0, hp)`, as most client rows do). */
export function hpAfter(attacker, defender) {
  return { attackerHpAfter: Math.max(0, attacker.hp), defenderHpAfter: Math.max(0, defender.hp) };
}

/**
 * A plain row `{timestamp, type, damage, attackerHpAfter, defenderHpAfter}`. `clamp=false` keeps the
 * raw HP (regen, opening summon, timeout rows).
 * @returns {DuelEvent}
 */
export function duelEvent(timestamp, type, damage, attacker, defender, clamp = true) {
  return clamp
    ? { timestamp, type, damage, attackerHpAfter: Math.max(0, attacker.hp), defenderHpAfter: Math.max(0, defender.hp) }
    : { timestamp, type, damage, attackerHpAfter: attacker.hp, defenderHpAfter: defender.hp };
}
