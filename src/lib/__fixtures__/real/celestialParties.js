// The five Celestial server logs and the parties that fought them (fixture notes, 2026-10-15).
// Player 0 started every run except the L95 one, where the other player's tank did (autoStart);
// the stack player follows that (Game/combat-pve.md §20.7).
import hardL85 from './celestial-hard-l85.json';
import normalL85 from './celestial-normal-l85.json';
import overloadLoss from './celestial-hard-l85-overload-loss.json';
import normalL85b from './celestial-normal-l85-b.json';
import hardL95 from './celestial-hard-l95.json';
import sentinelOld from './profile-sentinel-l85.json';
import sentinelNew from './profile-sentinel-l85-oct15b.json';
import warrior from './profile-warrior-l73.json';
import tinCan from './leaderboard-warrior-l95-tank.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { buildFighter } from '../../build/fighter.js';
import { fighterFromLeaderboard } from '../../build/sheetFighter.js';

const NOW = '2026-10-15T00:00:00.000Z';
/** The imported profile's selected preset (the live loadout and the server sheet). */
function liveFighter(profile) {
  const c = normaliseCharacter(gameProfileToCharacter(profile, { now: NOW }));
  return buildFighter(c, c.activePresetId);
}
/** The Warrior's TANK preset. */
function tankFighter(profile) {
  const c = normaliseCharacter(gameProfileToCharacter(profile, { now: NOW }));
  return buildFighter(c, c.presets.find((p) => p.name === 'TANK').id);
}

export const CELESTIAL_LOGS = Object.freeze([
  {
    id: 'hard-l85', fight: hardL85, difficulty: 'HARD', tactics: { focus: 'HOLD', holdCount: 4 }, stackPlayerIndex: 0,
    party: () => [liveFighter(sentinelOld), tankFighter(warrior)],
  },
  {
    id: 'normal-l85', fight: normalL85, difficulty: 'NORMAL', tactics: { focus: 'HOLD', holdCount: 4 }, stackPlayerIndex: 0,
    party: () => [liveFighter(sentinelOld), tankFighter(warrior)],
  },
  {
    id: 'hard-l85-overload-loss', fight: overloadLoss, difficulty: 'HARD', tactics: { focus: 'HOLD', holdCount: 7 }, stackPlayerIndex: 0,
    party: () => [liveFighter(sentinelNew), tankFighter(warrior)],
  },
  {
    id: 'normal-l85-b', fight: normalL85b, difficulty: 'NORMAL', tactics: { focus: 'HOLD', holdCount: 4 }, stackPlayerIndex: 0,
    party: () => [liveFighter(sentinelNew), tankFighter(warrior)],
  },
  {
    id: 'hard-l95', fight: hardL95, difficulty: 'HARD', tactics: { focus: 'HOLD', holdCount: 4 }, stackPlayerIndex: 1,
    party: () => [liveFighter(sentinelNew), fighterFromLeaderboard(tinCan)],
    // Earthwarden fired on a tick with two add hits on the tank, and the cast row (and every later row)
    // carries the tank's HP from before those hits: 71 688 of damage the server lost (combat-pve.md §20.9)
    resync: [{ timestamp: 66790, reason: 'Earthwarden cast restores the pre-enemy-phase HP' }],
  },
]);
