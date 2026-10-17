// Arena display reward helpers, 2.7.4 source L667518 / L667786 and L1482460-1482550.
// See Game/combat-pvp.md §Arena reward objective. Loss payouts are unresolved.
import { ARENA_FIGHT_REWARD_BY_POSITION_OFFSET, ARENA_RANK_FIGHT_MULTIPLIERS } from '../../game/combatPvp.js';

/** One-based ladder positions -> the client's virtual reward slot, or null when not selectable. */
export function arenaVirtualOffset(position, opponentPosition) {
  if (![position, opponentPosition].every((x) => Number.isSafeInteger(x) && x > 0) || position === opponentPosition) return null;
  const mine = position - 1, theirs = opponentPosition - 1;
  const above = Math.min(mine, 3);
  const index = theirs < mine ? above - (mine - theirs) : above + (theirs - mine) - 1;
  return [3, 2, 1, -1, -2, -3][index] ?? null;
}

export function arenaInfluenceReward(rank, position, opponentPosition) {
  const offset = arenaVirtualOffset(position, opponentPosition);
  const row = ARENA_FIGHT_REWARD_BY_POSITION_OFFSET.find((x) => x.positionOffset === offset);
  const mult = ARENA_RANK_FIGHT_MULTIPLIERS.find((x) => x.rank === rank);
  return row && mult ? Math.round(row.influence * mult.influenceMultiplier) : null;
}
