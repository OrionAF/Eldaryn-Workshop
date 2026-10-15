// L1 catalogue: Celestial Trial config (difficulties, boss scaling bands, boss spells, tactics, dust).
// Lookups only. Sources: Game/pve-content.md §6; data/celestial.json (module 4150, L1156882-1160944).
import data from '../../data/game/celestial.json';

export const CELESTIAL_CONSTANTS = data.constants;
export const CELESTIAL_TACTICS = data.tactics;
export const CELESTIAL_DUST = data.dust;
/** The playable fight difficulties of the engine (MYTHIC's party-power HP scaling is [SERVER]). */
export const CELESTIAL_DIFFICULTIES = Object.freeze(['NORMAL', 'HARD']);

/** Difficulty entry ('NORMAL' | 'HARD' | 'MYTHIC'), or null. */
export const celestialDifficulty = (id) => (Object.hasOwn(data.difficulties, id) ? data.difficulties[id] : null);
