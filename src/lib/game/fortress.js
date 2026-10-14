// L1 catalogue: clan fortress groups, bosses, owned buffs, class remap and clan rewards. Lookups only.
// Sources: Game/clan-fortress.md; data/clan-fortress.json (decompile L1222325-1224578, L1533914-1534132).
import fortressData from '../../data/game/clan-fortress.json';

export const FORTRESS_CONSTANTS = fortressData.fortressConstants;
export const FORTRESSES = fortressData.fortresses;
export const FORTRESS_BOSSES = fortressData.bosses;
/** Owned buffs per group: { combat: {...}, nonCombat: {...} }. */
export const FORTRESS_BUFFS = fortressData.buffs;
/** Per class, which buff stat is replaced (e.g. SENTINEL damageReduction -> missChance). */
export const FORTRESS_CLASS_REMAP = fortressData.classRemap;
export const BOSS_SHIELD_CONTROL_POINTS = fortressData.bossShieldControlPoints;
export const FORTRESS_STARS = fortressData.stars;
export const CONTRIBUTION_BONUS = fortressData.contributionBonus;
export const ATTACK_REWARD_TIERS = fortressData.attackRewardTiers;
export const DEFENSE_REWARD = fortressData.defenseReward;
export const CORE_DEFENSE_WIN_MULTIPLIER = fortressData.coreDefenseWinMultiplier;
export const REWARD_SCALE_BY_CLAN_COUNT = fortressData.rewardScaleByClanCount;
export const CLAN_RANKS = fortressData.clanRanks;
export const WAR_POINT_RATES = fortressData.warPointRates;
export const DOUBLE_REWARD_SCHEDULE = fortressData.doubleRewardSchedule;
export const CLAN_WAR_SESSION_REWARDS = fortressData.clanWarSessionRewards;
export const RAID_CONSTANTS = fortressData.raidConstants;
export const RAIDS = fortressData.raids;

/** Village raid by id (e.g. 'raid_1'), or null. */
export const raidById = (id) => RAIDS.find((r) => r.id === id) ?? null;

const fortressMap = new Map(FORTRESSES.map((f) => [f.id, f]));

/** Fortress entry by id (e.g. 'TOP_1'), or null. */
export const fortressById = (id) => fortressMap.get(id) ?? null;

/** Fortress group (TOP, BOTTOM or CORE) on a given day index counted from weekAnchorUtc. */
export function fortressGroupOnDayIndex(dayIndexFromAnchor) {
  const schedule = FORTRESS_CONSTANTS.scheduleByDayIndexFromAnchor;
  const i = ((dayIndexFromAnchor % 7) + 7) % 7;
  return schedule[String(i)] ?? null;
}

/** Stat key a class substitutes for a buff stat, or the stat itself when the class is not remapped. */
export function remapFortressStat(playerClass, stat) {
  return FORTRESS_CLASS_REMAP[playerClass]?.[stat] ?? stat;
}
