// 2.9.7 Retribution (module 4088, constants module 4089): the thorns ramp of a Juggernaut Stance
// Warrior or a Dire Ursine (bear) Druid in Progress and dungeons. Rules: Game/combat-pve.md §23.
import { getEquippedStanceConfig } from '../sources/stance.js';
import { getEquippedFormConfig } from './spellConfig.js';

/** RetributionKind (L1119565-1119570). */
export const RETRIBUTION_KIND = Object.freeze({ JUGGERNAUT: 'JUGGERNAUT', DRUID: 'DRUID' });

// JUGGERNAUT_RETRIBUTION / DRUID_RETRIBUTION (L1119609-1119612). The stack clock and the full-block
// threshold are the Juggernaut's for both kinds; only the step percent differs (combat-pve.md §23).
export const RETRIBUTION_CONSTANTS = Object.freeze({
  startMs: 10000, stepMs: 5000, fullReflectStacks: 25,
  stepPercent: Object.freeze({ JUGGERNAUT: 50, DRUID: 40 }),
});
const C = RETRIBUTION_CONSTANTS;

// port of retributionStepPercent L1119213-1119246
export const retributionStepPercent = (kind = RETRIBUTION_KIND.JUGGERNAUT) =>
  kind !== RETRIBUTION_KIND.DRUID ? C.stepPercent.JUGGERNAUT : C.stepPercent.DRUID;

// port of retributionStacks L1119248-1119273: 0 before 10 s of combat, then +1 every 5 s, no cap
export function retributionStacks(elapsedMs) {
  if (!(elapsedMs >= C.startMs)) return 0;
  return 1 + Math.floor((elapsedMs - C.startMs) / C.stepMs);
}

// port of retributionBonusPercent L1119275-1119305
export const retributionBonusPercent = (stacks, kind = RETRIBUTION_KIND.JUGGERNAUT) =>
  Math.max(0, stacks) * retributionStepPercent(kind);

// port of retributionMultiplier L1119403-1119431 (the client's UI uses it; the fight rounds instead)
export const retributionMultiplier = (elapsedMs, kind = RETRIBUTION_KIND.JUGGERNAUT) =>
  1 + retributionBonusPercent(retributionStacks(elapsedMs), kind) / 100;

// port of applyRetribution L1119433-1119472: `round(thorns * (100 + bonus) / 100)` once both are positive
export function applyRetribution(thorns, stacks, kind = RETRIBUTION_KIND.JUGGERNAUT) {
  if (stacks <= 0 || thorns <= 0) return thorns;
  return Math.round((thorns * (100 + retributionBonusPercent(stacks, kind))) / 100);
}

// port of retributionFullBlockReflect L1119474-1119481: from 25 stacks a block reflects full thorns
export const retributionFullBlockReflect = (stacks) => stacks >= C.fullReflectStacks;

// port of resolveRetributionKind L1119327-1119358 with isJuggernautRetributionActive L1119103-1119149 and
// isDruidRetributionActive L1119151-1119211. The two server rollouts are 'all' in the client's config
// (server feature defaults L873697-873698) and assumed on here (combat-pve.md §23).
/**
 * @param {Object} state  sigilStateOf output
 * @param {string} playerClass
 * @param {string|null} spec
 * @returns {'JUGGERNAUT'|'DRUID'|null}
 */
export function resolveRetributionKind(state, playerClass, spec) {
  if (state == null) return null;
  if (getEquippedStanceConfig(state, playerClass)?.species === 'JUGGERNAUT_STANCE') return RETRIBUTION_KIND.JUGGERNAUT;
  if (playerClass === 'MYSTIC' && spec === 'MYSTIC_DRUID' && state.druidUtilitySlotSpecies === 'DIRE_URSINE'
    && getEquippedFormConfig(state, playerClass, spec)?.form === 'BEAR') return RETRIBUTION_KIND.DRUID;
  return null;
}

// port of createRetributionState L1119524-1119546; `elapsedMs` counts fight ticks only (combat-pve.md §23)
export const createRetributionState = (kind = RETRIBUTION_KIND.JUGGERNAUT) => ({ kind, elapsedMs: 0, reportedStacks: 0 });
