// ui/runPhases.js - one plain sentence per Optimiser run phase, for the RunProgress labels and the
// Optimiser page's "What the steps mean" list. Wording follows simulation.md §Seeds and phases,
// §Racing and §Minimise and confirm. Other tools' phase ids have no entry and get no hint.
export const RUN_PHASES = [
  { id: 'screen', label: 'Screen', text: 'Checks your current build and takes its first measurements. Every other build is compared with it.' },
  { id: 'search', label: 'Search', text: 'Tries other builds, one part of your build at a time, and pits each against the best so far. Builds that clearly lose stop early.' },
  { id: 'minimise', label: 'Minimise', text: 'For each best build, undoes the changes that do not clearly help, so you change as little as possible.' },
  { id: 'confirm', label: 'Confirm', text: 'Tests each remaining build against your current one on fresh fights, so a gain is not just luck.' },
  { id: 'attribute', label: 'Attribute', text: 'Works out what each kept change adds on its own, and which ones only help together.' },
];

const BY_ID = Object.fromEntries(RUN_PHASES.map((p) => [p.id, p.text]));

/** The explanation for a phase id, or '' for an id this module does not know. */
export const phaseHint = (id) => BY_ID[id] ?? '';
