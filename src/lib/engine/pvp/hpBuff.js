// PVP x8 HP buff (module 5399). Pure; no rng. Rules: Game/combat-pvp.md §3.
import { ARENA_CONSTANTS } from '../../game/combatPvp.js';

// port of getPvpHpMultiplier L1452741-1452746
/** `ARENA_CONSTANTS.PVP_HP_MULTIPLIER` (8 for Arena and Clan War PVP). */
export function getPvpHpMultiplier() {
  return ARENA_CONSTANTS.PVP_HP_MULTIPLIER;
}

// port of applyPvpHpBuff L1454678-1454717
/**
 * Applies the PVP HP multiplier to a stat sheet: `totalHp = floor(totalHp * mult)` and
 * `pvpBaseHp = totalHp` (the pre-multiplier HP, which becomes the entity's `rawMaxHp`).
 * Returns a new object. Returns `stats` itself when `pvpBaseHp` is already defined (never buffs
 * twice) or the multiplier is 1.
 *
 * The client function takes only `stats` and reads the multiplier itself; `mult` here is an optional
 * override (default `getPvpHpMultiplier()`) for the 36x Final Battle shape (combat-pvp.md §12).
 * @param {Object} stats ComputedStats-shaped, with `totalHp`
 * @param {number} [mult]
 */
export function applyPvpHpBuff(stats, mult = getPvpHpMultiplier()) {
  if (stats.pvpBaseHp !== undefined) return stats;
  if (mult === 1) return stats;
  return { ...stats, totalHp: Math.floor(stats.totalHp * mult), pvpBaseHp: stats.totalHp };
}
