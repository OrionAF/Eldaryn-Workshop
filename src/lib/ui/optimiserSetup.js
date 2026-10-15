// ui/optimiserSetup.js - the Optimiser page's setup (preset, fight, objective, allowed-to-change toggles,
// effort, seed): defaults, validation of a stored or re-run setup against the live character, and the
// worker request it stands for. Pure. The setup is kept per character in the UI key (uiState.js).
import { resolveTarget, objectiveKindsFor } from '../search/objectives.js';
import { SPACE_DEFAULTS } from '../search/space.js';
import { EFFORT_LEVELS } from '../search/search.js';
import { PVP_MAX_OPPONENTS, PVP_SEATS } from '../search/pvpObjective.js';
import { metricKey } from '../engine/metrics.js';
import { jobSignature } from '../jobs.svelte.js';

/** Keys a stored target/objective carries beyond the spec itself (the result's echo adds them). */
const TARGET_ECHO = ['label', 'key', 'mode', 'fidelity', 'assumptions'];
const OBJECTIVE_ECHO = ['label', 'unit', 'higherIsBetter', 'statistic', 'q', 'deltaKind'];

const strip = (obj, keys) => {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out;
};

export const defaultSetup = (defaultEffort = 'standard') => ({
  presetId: null,
  target: { kind: 'dummy', seconds: 60 },
  objective: { kind: 'dps' },
  space: { ...SPACE_DEFAULTS },
  effort: EFFORT_LEVELS.includes(defaultEffort) ? defaultEffort : 'standard',
  seed: 1,
});

/**
 * Any value -> a setup that is valid for `character`: an unknown preset falls back to the active one,
 * a target that does not resolve (or an objective it cannot score) to the defaults, deleted
 * opponents drop out of a PVP target. Unknown keys are ignored.
 */
export function normaliseSetup(raw, character, defaultEffort = 'standard') {
  const out = defaultSetup(defaultEffort);
  const r = raw && typeof raw === 'object' ? raw : {};
  const presets = character?.presets ?? [];
  out.presetId = presets.some((p) => p.id === r.presetId) ? r.presetId : (presets.find((p) => p.id === character?.activePresetId) ?? presets[0])?.id ?? null;

  if (r.target && typeof r.target === 'object') {
    let t = strip(r.target, TARGET_ECHO);
    if (t.kind === 'pvp') {
      const known = new Set((character?.opponents ?? []).map((o) => o.id));
      const ids = (Array.isArray(t.opponentIds) ? t.opponentIds : []).filter((id) => known.has(id)).slice(0, PVP_MAX_OPPONENTS);
      t = { kind: 'pvp', opponentIds: ids, seats: PVP_SEATS.includes(t.seats) ? t.seats : 'attacker' };
    }
    try {
      if (t.kind !== 'pvp') resolveTarget(t, { character });
      out.target = t;
    } catch {
      // keep the default target
    }
  }
  const allowed = objectiveKindsFor(out.target.kind, out.target.kind === 'pvp' ? null : out.target);
  const o = r.objective && typeof r.objective === 'object' ? strip(r.objective, OBJECTIVE_ECHO) : null;
  out.objective = o && allowed.includes(o.kind) ? o : { kind: allowed[0] };
  if (out.objective.kind === 'survival' && !(Number.isFinite(out.objective.seconds) && out.objective.seconds >= 5)) delete out.objective.seconds;

  if (r.space && typeof r.space === 'object') {
    for (const k of Object.keys(SPACE_DEFAULTS)) if (typeof r.space[k] === 'boolean') out.space[k] = r.space[k];
  }
  if (EFFORT_LEVELS.includes(r.effort)) out.effort = r.effort;
  if (Number.isInteger(r.seed) && r.seed >= 1) out.seed = r.seed;
  return out;
}

/** The setup a saved run was made with ("Re-run with settings"), validated against today's character. */
export function setupFromRun(run, character, defaultEffort = 'standard') {
  const level = run.budget?.level;
  return normaliseSetup(
    {
      presetId: run.presetId,
      target: run.target,
      objective: run.objective,
      space: run.space,
      effort: EFFORT_LEVELS.includes(level) ? level : undefined,
      seed: run.seed,
    },
    character,
    defaultEffort,
  );
}

/** The character the search sees: the saved run history is not an input and must not move the characterKey. */
export const searchCharacter = (character) => ({ ...JSON.parse(JSON.stringify(character)), runs: [] });

/** The `optimize` worker request for a setup. */
export function requestOf(setup, character) {
  return {
    mode: 'optimize',
    character: searchCharacter(character),
    presetId: setup.presetId,
    target: JSON.parse(JSON.stringify(setup.target)),
    objective: JSON.parse(JSON.stringify(setup.objective)),
    space: { ...setup.space },
    effort: setup.effort,
    seed: setup.seed,
  };
}

/** Staleness signature of a run: the preset and the character snapshot the search sees. */
export function signatureOf(character, presetId) {
  if (!character) return null;
  return jobSignature({ characterKey: character.id, presetId, inputs: metricKey('character', searchCharacter(character)) });
}
