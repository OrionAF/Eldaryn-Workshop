// L1 catalogue: arena ladder, rewards, rating constant, engine ceilings and clan duel constants. Lookups only.
// Sources: Game/combat-pvp.md; data/combat-pvp.json (arena tables module 3144, engine modules 3959/3963/5399).
import pvpData from '../../data/game/combat-pvp.json';

export const ARENA_CONSTANTS = pvpData.arenaConstants.values;
export const ARENA_RANKS = pvpData.ranks.values;
export const ARENA_FIGHT_REWARD_BY_POSITION_OFFSET = pvpData.fightRewardByPositionOffset.values;
export const ARENA_SESSION_REWARDS_BY_RANK = pvpData.sessionRewardsByRank.values;
export const ARENA_RANK_FIGHT_MULTIPLIERS = pvpData.rankFightMultipliers.values;
export const ARENA_POSITION_TIERS = pvpData.positionTiers.values;
export const ARENA_RANK_THRESHOLDS = pvpData.rankThresholds.values;
/** Rating fraction is r / (r + K). */
export const PVP_RATING_K = pvpData.pvpRatingK.value;
/** Per-stat engine ceilings (percent-style units), keyed by enum name. */
export const PVP_COMBAT_CEILINGS = pvpData.combatCeilings.values;
export const PVP_ENGINE_STATUS_CONSTANTS = pvpData.engineStatusConstants.values;
export const CLAN_WAR_PVP = pvpData.clanWarPvp.values;
export const CLAN_BATTLE_DUEL = pvpData.clanBattleDuel.values;
/** Stack-sigil definitions (Bulwark, Hemorrhage, ...) used by the PVP engine. */
export const STACK_SIGIL_DEFS = pvpData.stackSigilDefs.values;

const rankMap = new Map(ARENA_RANKS.map((r) => [r.rank, r]));

/** Arena rank entry by enum name (e.g. 'VANGUARD'), or null. */
export const arenaRank = (rank) => rankMap.get(rank) ?? null;
