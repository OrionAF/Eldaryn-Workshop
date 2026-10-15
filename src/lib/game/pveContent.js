// L1 catalogue: Oblivion XP curve and floors, Oblivion drop weights, classic dungeons and campaign
// progress chapters. Lookups only. Sources: Game/pve-content.md; data/pve-content.json
// (oblivion: decompile L1189711-1190344, L1706365-1706694; dungeons L1062171-1062963).
import contentData from '../../data/game/pve-content.json';

/** Oblivion XP per level: { toLevel, xpCost, cumulative } entries from level 2 to 100. */
export const OBLIVION_XP_CURVE = contentData.oblivionXpCurve.table;
export const OBLIVION_DROP_WEIGHTS = contentData.oblivionDropWeights;
/** First 60 Oblivion floors ({ floor, mobHp, mobAttack, instability }). */
export const OBLIVION_FLOORS = contentData.oblivionDungeonFloors.floors;
/** The 7 normal classic dungeons; hard variants are built from these by engine/pve/enemies.js. */
export const CLASSIC_DUNGEONS = contentData.classicDungeons.dungeons;
/** hardVariant constants (configs, share, stepMultipliers, caps, coins); schema pve-content.md §12. */
export const CLASSIC_DUNGEON_HARD = contentData.classicDungeons.hard;
/** Campaign progress chapters: 22 entries (normal 1-11, hard 12-22). */
export const PROGRESS_CHAPTERS = contentData.progressChapters;

/** Oblivion floor entry by floor number, or null. */
export const oblivionFloor = (floor) => OBLIVION_FLOORS.find((f) => f.floor === floor) ?? null;

/** Classic dungeon entry by id (e.g. 'dungeon_1'), or null. */
export const classicDungeon = (id) => CLASSIC_DUNGEONS.find((d) => d.id === id) ?? null;
