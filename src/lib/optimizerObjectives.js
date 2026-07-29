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
 *   { kind: 'pvp-goal', weights? }
 *     The PVP/Custom preset goal (pvpGoalObjective.js): closed-form
 *     geometric blend of Maximum Damage / Damage Mitigation / Survivability
 *     under the goal's slider weights (sum 100), single-stage. Distinct
 *     from 'pvp' above: no concrete opponent - an averaged reference
 *     opponent drives the search, which is what makes it cheap enough to
 *     run single-stage. Duel validation against the archetype gauntlet is a
 *     separate, on-demand step (pvpGauntlet.js), not part of this search.
 */

import { sigilAwareDpsObjective, createMonteCarloObjective } from './optimizer.js';
import { createMultiPvpWinObjective } from './pvpOptimizer.js';
import { PVP_HEALTH_MULTIPLIER } from './pvpSimulation.js';
import { createTankObjective } from './tankObjective.js';
import { createPvpGoalObjective } from './pvpGoalObjective.js';

export const PVP_SCREEN_ITERATIONS = 150;
export const PVP_CONFIRM_ITERATIONS = 500;

/**
 * Spec kinds whose objective is a Monte Carlo estimator rather than a closed
 * form. Consumers that report per-candidate differences need to know, because
 * a small difference between two sampled scores may be sampling residue -
 * see combat-model.md §8 "Why search maxima are not comparable".
 */
const SAMPLED_KINDS = new Set(['pve-accurate', 'pvp']);

/** True when this spec's objective returns a sampled estimate. */
export function specIsSampled(spec) {
  return SAMPLED_KINDS.has(spec?.kind);
}

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
        healthMultiplier: spec.healthMultiplier ?? PVP_HEALTH_MULTIPLIER,
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
    case 'pvp-goal':
      return { objective: createPvpGoalObjective({ weights: spec.weights }), screenObjective: null };
    default:
      throw new Error(`Unknown objective spec kind: ${spec?.kind}`);
  }
}
