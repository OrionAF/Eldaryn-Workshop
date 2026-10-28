// ui/runPhases.js - one plain sentence per Optimiser run phase, for the RunProgress labels and the
// Optimiser page's "What the steps mean" list. Wording follows simulation.md §Seeds and phases,
// §Racing, §Minimise and confirm and §Push. Other tools' phase ids have no entry and get no hint.
export const RUN_PHASES = [
  { id: 'screen', label: 'Screen', text: 'Checks your current build and takes its first measurements. Every other build is compared with it.' },
  { id: 'search', label: 'Search', text: 'Tries other builds, one part of your build at a time, and pits each against the best so far. Builds that clearly lose stop early.' },
  { id: 'minimise', label: 'Minimise', text: 'For each best build, undoes the changes that do not clearly help, so you change as little as possible.' },
  { id: 'confirm', label: 'Confirm', text: 'Tests each remaining build against your current one on fresh fights, so a gain is not just luck.' },
  { id: 'attribute', label: 'Attribute', text: 'Works out what each kept change adds on its own, and which ones only help together.' },
];

/** A Push run's phases (push.js PUSH_PHASES): its Screen and Confirm mean something else there. */
export const PUSH_RUN_PHASES = [
  { id: 'climb', label: 'Climb', text: 'Tests your build step after step to find the deepest step it clears at your win-rate goal.' },
  { id: 'screen', label: 'Screen', text: 'Checks whether the next step is in reach before searching it. If no build can clear it, the run stops there.' },
  { id: 'optimise', label: 'Optimise', text: 'Searches for the build with the fewest changes that clears the next step, then climbs with it.' },
  { id: 'confirm', label: 'Confirm', text: 'Retests the deepest step reached on fresh fights, step by step from the start, so it is not just luck.' },
];

const isPush = (ids) => ids.includes('climb');

/** Every phase of the kind of run that shows these phase ids, in run order (a Push run has its own). */
export const phasesFor = (ids = []) => (isPush(ids) ? PUSH_RUN_PHASES : RUN_PHASES);

/** The explanation for a phase id among a run's ids, or '' for an id this module does not know. */
export const phaseHint = (id, ids = []) => (isPush(ids) ? PUSH_RUN_PHASES : RUN_PHASES).find((p) => p.id === id)?.text ?? '';
