// L1 catalogue: PVE campaign chapters, hard chapters and mob defaults. Lookups only.
// Sources: Game/combat-pve.md; data/combat-pve.json (module 3962, decompile L1084790-1085511).
// Only the engine and worker chunks import this file (rebuild-plan §8 Size).
import pveData from '../../data/game/combat-pve.json';

export const PVE_PROGRESS_CONSTANTS = pveData.progressConstants;
export const PVE_HARD_LEVEL_MULTIPLIERS = pveData.hardLevelMultipliers;
export const PVE_HARD_CHAPTER_OFFSET = pveData.hardChapterOffset;
export const PVE_MOB_DEFAULTS = pveData.mobDefaults;
/** Normal chapters 1-11, each with 10 levels of 3 mobs. */
export const PVE_CHAPTERS = pveData.chapters;
/** Hard chapters 12-22 (display 1-11), scaled from a basedOnChapter. */
export const PVE_HARD_CHAPTERS = pveData.hardChapters;

/** Normal chapter by chapter number (1-11), or null. */
export const pveChapter = (chapter) => PVE_CHAPTERS.find((c) => c.chapter === chapter) ?? null;

/** Hard chapter by chapter number (12-22), or null. */
export const pveHardChapter = (chapter) => PVE_HARD_CHAPTERS.find((c) => c.chapter === chapter) ?? null;

/**
 * Picker label for a campaign chapter: "3. Warlord's Pass"; a hard chapter (12-22) has no name of its
 * own, so it is "Hard 3. Warlord's Pass", numbered by `displayChapter` and named after `basedOnChapter`.
 */
export function chapterLabel(chapter) {
  const hard = pveHardChapter(chapter);
  if (hard) return `Hard ${hard.displayChapter}. ${pveChapter(hard.basedOnChapter)?.name ?? ''}`.trim();
  const normal = pveChapter(chapter);
  return normal ? `${normal.chapter}. ${normal.name}` : `Chapter ${chapter}`;
}
