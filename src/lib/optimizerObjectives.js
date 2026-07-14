/**
 * optimizerObjectives.js - serializable objective SPECS for the build
 * optimizer.
 *
 * optimize() takes objective FUNCTIONS, which cannot cross a Web Worker
 * boundary. A spec is the plain-JSON description of which objectives to
 * build; objectivesFromSpec() turns it into the { objective, screenObjective }
 * pair on whichever side actually runs the search (the worker, or the inline
 * fallback when Workers are unavailable).
 *
 * Spec kinds:
 *   { kind: 'pve-fast' }
 *     The default closed-form sigil-aware DPS objective, single-stage.
 *   { kind: 'pve-accurate', iterations?, durationSeconds? }
 *     Two-stage: the closed-form objective screens/ranks every candidate,
 *     and a Monte Carlo battle-sim objective (common random numbers)
 *     confirms adoptions - MC noise never decides fine-grained moves, and
 *     the expensive sim only runs on real challengers.
 *   { kind: 'pvp', opponent | opponents, aggregate?, healthMultiplier?,
 *     durationSeconds?, screenIterations?, confirmIterations? }
 *     Two-stage PVP win-chance: low-iteration duels (seed A) screen,
 *     higher-iteration duels (seed B) confirm - different seeds so the
 *     confirmation is independent of the screen's RNG luck. Pass `opponents`
 *     (array) + `aggregate` ('mean' | 'min') to optimize one build across
 *     several matchups at once.
 *   { kind: 'tank', ehpWeight? }
 *     The Warrior tank goal (tankObjective.js): closed-form geometric blend
 *     of effective HP and sustainable incoming DPS, single-stage.
 */

import { sigilAwareDpsObjective, createMonteCarloObjective } from './optimizer.js';
import { createMultiPvpWinObjective } from './pvpOptimizer.js';
import { createTankObjective } from './tankObjective.js';

export const PVP_SCREEN_ITERATIONS = 150;
export const PVP_CONFIRM_ITERATIONS = 500;

/** Build the { objective, screenObjective } pair optimize() expects from a plain-JSON spec. */
export function objectivesFromSpec(spec = { kind: 'pve-fast' }) {
  switch (spec.kind) {
    case 'pve-fast':
      return { objective: sigilAwareDpsObjective, screenObjective: null };
    case 'pve-accurate':
      return {
        objective: createMonteCarloObjective({
          iterations: spec.iterations ?? 100,
          durationSeconds: spec.durationSeconds ?? 60,
          seed: 1,
        }),
        screenObjective: sigilAwareDpsObjective,
      };
    case 'pvp': {
      // Single opponent (spec.opponent) or several (spec.opponents +
      // spec.aggregate: 'mean' | 'min') - one opponent through the multi
      // objective is exactly the single-opponent objective.
      const opponents = spec.opponents ?? [spec.opponent];
      const shared = {
        opponents,
        aggregate: spec.aggregate ?? 'mean',
        healthMultiplier: spec.healthMultiplier ?? 1,
        durationSeconds: spec.durationSeconds ?? 60,
      };
      return {
        objective: createMultiPvpWinObjective({
          ...shared,
          iterations: spec.confirmIterations ?? PVP_CONFIRM_ITERATIONS,
          seed: 2,
        }),
        screenObjective: createMultiPvpWinObjective({
          ...shared,
          iterations: spec.screenIterations ?? PVP_SCREEN_ITERATIONS,
          seed: 1,
        }),
      };
    }
    case 'tank':
      return { objective: createTankObjective({ ehpWeight: spec.ehpWeight ?? 0.5 }), screenObjective: null };
    default:
      throw new Error(`Unknown objective spec kind: ${spec?.kind}`);
  }
}
