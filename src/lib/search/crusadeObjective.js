// search/crusadeObjective.js: the optimiser target 'crusade', a solo Hell Crusade run (three bosses inside
// one 300 s budget) on the client's simulateCrusadeFight port (engine/pve/crusade.js). Spec, the solo rule,
// the per-fight scores and the objectives: docs/Reference/simulation.md §Crusade.
//
// TARGET spec (plain JSON): {kind: 'crusade', difficulty: 'NORMAL'|'HARD'|'MYTHIC', mythicPlus?: whole number
// from 1 (Mythic only)}. The client offers a solo run only where the difficulty's minPlayers is 1 (Normal):
// the others resolve to an error that says so.
import { stableStringify } from '../engine/metrics.js';
import {
  simulateCrusade, prepareCrusadeMember, crusadeBossEntity, CRUSADE_ASSUMPTIONS, CRUSADE_TIME_LIMIT_MS,
} from '../engine/pve/crusade.js';
import {
  CRUSADE_DIFFICULTIES, CRUSADE_HELL_BOSSES, crusadeDifficulty,
} from '../game/pveContent.js';

export const CRUSADE_TARGET_KIND = 'crusade';
/** A solo run is one player (simulateCrusadeFight's playerCount). */
export const SOLO_PLAYERS = 1;
export const CRUSADE_DIFFICULTY_LABEL = Object.freeze({ NORMAL: 'Normal', HARD: 'Hard', MYTHIC: 'Mythic' });

/** Whether the client offers a solo run at a difficulty (CrusadeHub's Solo button: minPlayers <= 1, L1767933-1767945). */
export const crusadeSoloAllowed = (difficulty) => (crusadeDifficulty(difficulty)?.minPlayers ?? Infinity) <= SOLO_PLAYERS;

/**
 * Validate a Crusade target spec.
 * @param {Object} raw
 * @returns the shape objectives.js resolveTarget returns, plus `crusade` (the engine arguments).
 */
export function resolveCrusadeTarget(raw) {
  const difficulty = raw?.difficulty;
  if (!CRUSADE_DIFFICULTIES.includes(difficulty)) throw new Error(`unknown Crusade difficulty '${difficulty}'`);
  const plus = raw.mythicPlus ?? null;
  if (plus !== null) {
    if (difficulty !== 'MYTHIC') throw new Error('a Mythic+ level needs the Mythic difficulty');
    if (!(Number.isInteger(plus) && plus >= 1)) throw new Error(`Mythic+ level must be a whole number from 1, got ${plus}`);
  }
  const name = `${CRUSADE_DIFFICULTY_LABEL[difficulty]}${plus ? `+${plus}` : ''}`;
  if (!crusadeSoloAllowed(difficulty)) {
    throw new Error(`Crusade ${name} needs a party of ${crusadeDifficulty(difficulty).minPlayers}: the game offers a solo run on Normal only`);
  }
  const mythicPlus = plus ?? 0;
  const spec = { kind: CRUSADE_TARGET_KIND, difficulty, ...(plus ? { mythicPlus: plus } : {}) };
  return {
    kind: CRUSADE_TARGET_KIND, spec, key: stableStringify(spec), realm: 'base',
    // the three bosses as fought (the screen heuristic reads the first)
    enemy: CRUSADE_HELL_BOSSES.map((b) => {
      const e = crusadeBossEntity(b, SOLO_PLAYERS, difficulty, mythicPlus);
      return { id: e.id, hp: e.maxHp, attack: e.attack, attackSpeed: e.attackSpeed };
    }),
    maxMs: CRUSADE_TIME_LIMIT_MS, seconds: CRUSADE_TIME_LIMIT_MS / 1000, opts: {},
    mode: CRUSADE_TARGET_KIND, fidelity: 'server-model',
    assumptions: Object.values(CRUSADE_ASSUMPTIONS).map((a) => ({ id: a.key, label: a.text })),
    label: `Crusade ${name}, solo`,
    crusade: { difficulty, mythicPlus, playerCount: SOLO_PLAYERS },
  };
}

/**
 * A run runner for a resolved target: the build is prepared once per call.
 * @returns {(fighter: Object) => {fight: (rng: () => number) => import('../engine/pve/crusade.js').CrusadeResult}}
 */
export function crusadeRunner(target) {
  const { difficulty, mythicPlus, playerCount } = target.crusade;
  return (fighter) => {
    const me = prepareCrusadeMember(fighter);
    return { fight: (rng) => simulateCrusade({ party: [me], difficulty, mythicPlus, playerCount, rng }) };
  };
}

const LOSS_CEILING = 1 - 1e-9;
const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * One run's win-rate score (objectives.js winRateFightScore's scale): a full clear scores 1 + the share of
 * the run's time budget left, a failed run the share of the three bosses' HP removed (< 1).
 */
export function crusadeFightScore(r) {
  if (r.success) return 1 + clamp01(1 - r.totalDuration / r.timeLimitMs);
  return Math.min(LOSS_CEILING, clamp01(r.bossHpTotal > 0 ? r.damageDealt / r.bossHpTotal : 0));
}

/** One run's expected enchant stones: the mean of the client's drop roll for the bosses it killed. */
export const crusadeStoneScore = (r) => r.expectedStones;
