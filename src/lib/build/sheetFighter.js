// build/sheetFighter.js: a Fighter from another player's /leaderboard/player profile. That profile
// carries the server's computedStats (the sheet), the worn sigils with levels and rarity, the altar
// tier and the active major glyphs, but no talent allocation, so the sheet is used as is and no
// talent-driven mechanic is modelled (see Game/combat-pve.md §20 for what the Celestial logs show).
import { sigilBySpecies, utilitySlotSpellType } from '../game/sigils.js';
import { isRankingsProfile } from '../model/opponents.js';

/** True for a /leaderboard/player profile: a server sheet plus the worn sigils, no presets. */
export const isLeaderboardProfile = isRankingsProfile;

/**
 * @param {Object} profile  a /leaderboard/player profile
 * @returns {import('../engine/types.js').Fighter & {source: 'sheet'}}
 */
export function fighterFromLeaderboard(profile) {
  if (!isLeaderboardProfile(profile)) throw new Error('not a leaderboard profile');
  const worn = profile.equippedSigils.filter((s) => sigilBySpecies(s.species));
  const isAncient = (s) => s.rarity === 'ANCIENT' || sigilBySpecies(s.species)?.rarity === 'ANCIENT';
  const ancient = worn.find(isAncient) ?? null;
  const type = utilitySlotSpellType(profile.class, profile.activeSpec);
  const utility = profile.utilitySigil ?? worn.find((s) => sigilBySpecies(s.species)?.spellType === type) ?? null;
  return {
    stats: { ...profile.computedStats },
    class: profile.class,
    spec: profile.activeSpec ?? null,
    level: profile.level,
    sigils: worn.filter((s) => s !== ancient && s !== utility && sigilBySpecies(s.species)?.spellType !== type).map((s) => ({ species: s.species, level: s.level })),
    utility: utility ? { species: utility.species, level: utility.level } : null,
    ancient: ancient ? { species: ancient.species, level: ancient.level } : null,
    conditions: {},
    glyphMods: (profile.activeMajorGlyphs ?? []).map((g) => ({ glyphType: g.glyphType, rarity: g.rarity })),
    altarTier: profile.sigilAltarTier ?? 1,
    source: 'sheet',
  };
}
