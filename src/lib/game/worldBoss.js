// L1 catalogue: World Boss config, affinities, season clock, rewards. Lookups only.
// Sources: Game/pve-content.md §7; data/world-boss.json (cites L1153423-1153478, L1152862-1153000).
import data from '../../data/game/world-boss.json';

export const WORLD_BOSS_CONSTANTS = data.constants;
export const WORLD_BOSS_SEASON = data.season;
export const WORLD_BOSS_AFFINITY_CYCLE = data.affinityCycle;
export const WORLD_BOSS_AFFINITIES = data.affinities;
export const WORLD_BOSSES = data.bosses;
export const WORLD_BOSS_POSITION_REWARDS = data.positionRewards;
