// L1 catalogue: transcendence boards, tiers, cost brackets and socket positions. Lookups only.
// Imported statically and read synchronously by the stat pipeline and the build layer (rebuild-plan §8 Size).
// Sources: Game/transcendence.md; data/transcendence.json (decompile L1217888-1221319).
import transcendenceJson from '../../data/game/transcendence.json';

export const TRANSCENDENCE_CONSTANTS = transcendenceJson.constants;
export const TRANSCENDENCE_TIERS = transcendenceJson.tiers;
export const TRANSCENDENCE_COST_BRACKETS = transcendenceJson.costBrackets;
export const TRANSCENDENCE_ALLOC_TIERS = transcendenceJson.allocTiers;
export const TRANSCENDENCE_SOCKET_POSITIONS = transcendenceJson.socketPositions;
export const TRANSCENDENCE_MINOR_STAT_POOLS = transcendenceJson.minorStatPools;
export const TRANSCENDENCE_NOTABLE_BASE = transcendenceJson.notableBase;
export const TRANSCENDENCE_NOTABLE_OVERRIDES = transcendenceJson.notableOverrides;
export const TRANSCENDENCE_SIGIL_BASE = transcendenceJson.sigilBase;
export const TRANSCENDENCE_SIGIL_OVERRIDES = transcendenceJson.sigilOverrides;
export const TRANSCENDENCE_DEATHLORD_META = transcendenceJson.deathlordMinorMeta;

/** The six boards, keyed 'CLASS' or 'CLASS/FLAVOR' (flavor splits Mystic and Necromancer specs). */
export const TRANSCENDENCE_BOARDS = transcendenceJson.boards;
export const TRANSCENDENCE_BOARD_KEYS = Object.keys(TRANSCENDENCE_BOARDS);

const BOARD_KEY_BY_SPEC = {
  WARRIOR_TANK: 'WARRIOR',
  WARRIOR_DPS: 'WARRIOR',
  SENTINEL_MARKSMANSHIP: 'SENTINEL',
  SENTINEL_DISRUPTION: 'SENTINEL',
  MYSTIC_MAGE: 'MYSTIC/MAGE',
  MYSTIC_DRUID: 'MYSTIC/DRUID',
  NECROMANCER_DEATHLORD: 'NECROMANCER/DEATHLORD',
  NECROMANCER_DOOMWEAVER: 'NECROMANCER/DOOMWEAVER',
};

/** Board key for a spec key (see classes.js SPECS), or null. */
export const transcendenceBoardKeyForSpec = (specKey) => BOARD_KEY_BY_SPEC[specKey] ?? null;

/** Board object ({ flavor, nodeCount, nodes }) for a board key, or null. */
export const transcendenceBoard = (boardKey) => TRANSCENDENCE_BOARDS[boardKey] ?? null;

/** Board for a spec key, or null. */
export function transcendenceBoardForSpec(specKey) {
  const key = transcendenceBoardKeyForSpec(specKey);
  return key ? transcendenceBoard(key) : null;
}
