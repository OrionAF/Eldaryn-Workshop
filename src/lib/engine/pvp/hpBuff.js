// PVP HP buff (module 5734). Pure; no rng. Rules: Game/combat-pvp.md §3, Game/updates-2.8.2.md §1.
import { LEGACY_PVP_BALANCE, pvpFightLevel, pvpHpMultiplierFor } from './balance.js';

// port of getPvpHpMultiplier L1603672-1603697
/** HP multiplier at a fight level (`balance` defaults to LEGACY, the flat x8, as in the client). */
export function getPvpHpMultiplier(level, balance = LEGACY_PVP_BALANCE) {
  return pvpHpMultiplierFor(balance, level);
}

/**
 * Applies an HP multiplier to a stat sheet: `totalHp = floor(totalHp * mult)` and `pvpBaseHp = totalHp`
 * (the pre-multiplier HP, which becomes the entity's `rawMaxHp`). Returns a new object. Returns `stats`
 * itself when `pvpBaseHp` is already defined (never buffs twice) or the multiplier is 1.
 * The client's applyPvpHpBuff (L1603698-1603746) takes a level and a balance; this takes the resolved
 * multiplier, so callers can also pass the 36x Final Battle shape (combat-pvp.md §12).
 * @param {Object} stats ComputedStats-shaped, with `totalHp`
 * @param {number} [mult]
 */
export function applyPvpHpBuff(stats, mult = getPvpHpMultiplier(undefined)) {
  if (stats.pvpBaseHp !== undefined) return stats;
  if (mult === 1) return stats;
  return { ...stats, totalHp: Math.floor(stats.totalHp * mult), pvpBaseHp: stats.totalHp };
}

/**
 * Re-applies a multiplier to an already-buffed sheet from its `pvpBaseHp` (same result as buffing the
 * unbuffed sheet). Returns `stats` itself when its HP already matches.
 */
export function rebuffPvpHp(stats, mult) {
  if (stats.pvpBaseHp === undefined) return applyPvpHpBuff(stats, mult);
  const totalHp = mult === 1 ? stats.pvpBaseHp : Math.floor(stats.pvpBaseHp * mult);
  return totalHp === stats.totalHp ? stats : { ...stats, totalHp };
}

// port of applyPvpHpBuffPair L1606114-1606147
/**
 * Buffs both sides of a fight with ONE multiplier, read at `pvpFightLevel(level, fallback)`. The client
 * leaves an already-buffed sheet alone; this port re-buffs it from `pvpBaseHp`, because fighterDuelArgs
 * pre-buffs each side at its own level before the attacker is known.
 * @returns {[Object, Object]}
 */
export function applyPvpHpBuffPair(a, b, level, fallback, balance = LEGACY_PVP_BALANCE) {
  const mult = getPvpHpMultiplier(pvpFightLevel(level, fallback), balance);
  return [rebuffPvpHp(a, mult), rebuffPvpHp(b, mult)];
}
