/**
 * linkingSetup.js - "is this character ready for the linking simulation?"
 *
 * The Simulations Dashboard's setup section walks the user through
 * finishing the two required LINKED presets (goals/linking redesign,
 * docs/Reference/Notes/goals-linking-redesign-notes.md) before the one-time linking
 * simulation makes sense to run. These checks are advisory UI state, not
 * hard gates - they never block a simulation from running.
 */

/** The presets the linking simulation will read: the ones flagged linked. */
export function linkedPresets(character) {
  return character.presets.filter((p) => p.goal?.linked === true);
}

const hasAnyStat = (stats) =>
  stats && typeof stats === 'object' && Object.values(stats).some((v) => Number(v) > 0);

/**
 * Per-preset setup checklist: [{ key, label, done, optional }].
 * `optional` marks steps that can't be completed yet for structural reasons
 * (no pets owned) - they render greyed, not failing.
 */
export function presetSetupChecks(character, preset) {
  const loadout = character.loadouts[preset.loadout];
  const talentSet = character.talentSets[preset.talentSet];
  const talentPoints = Object.values(talentSet?.allocation || {}).reduce((a, b) => a + (Number(b) || 0), 0);
  const ownsPets = character.pets.length > 0;
  return [
    { key: 'goal', label: 'Goal assigned', done: (preset.goal?.kind ?? null) !== null, optional: false },
    {
      key: 'gear',
      label: 'Gear entered on its loadout',
      done: Object.values(loadout?.gear || {}).some(hasAnyStat),
      optional: false,
    },
    {
      key: 'talents',
      label: 'Talent points allocated',
      done: (talentSet?.spec ?? null) !== null && talentPoints > 0,
      optional: false,
    },
    { key: 'pet', label: 'Pet equipped', done: preset.petId !== null, optional: !ownsPets },
  ];
}

/** True when every non-optional check passes on every linked preset (and there are at least two). */
export function linkingSetupReady(character) {
  const linked = linkedPresets(character);
  if (linked.length < 2) return false;
  return linked.every((p) => presetSetupChecks(character, p).every((c) => c.done || c.optional));
}
