// ui/optimiserSetup.js - the Optimiser page's setup (preset, fight, objective, allowed-to-change toggles,
// Combat Power floor, effort, seed): defaults, validation of a stored or re-run setup against the live character, and the
// worker request it stands for. Pure. The setup is kept per character in the UI key (uiState.js).
import { resolveTarget, objectiveKindsFor, goalRetired, WIN_RATE_TARGET, PUSH_TARGET } from '../search/objectives.js';
import { SPACE_DEFAULTS, normalisePowerFloor } from '../search/space.js';
import { EFFORT_LEVELS } from '../search/search.js';
import { PVP_MAX_OPPONENTS, PVP_SEATS } from '../search/pvpObjective.js';
import { CELESTIAL_TARGET_KIND, rosterPartnerFor } from '../search/celestialObjective.js';
import { metricKey } from '../engine/metrics.js';
import { jobSignature } from '../jobs.svelte.js';
import { crusadePowerRequirement } from '../game/pveContent.js';
import { formatFlat } from '../format.js';

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
  powerFloor: null,
  effort: EFFORT_LEVELS.includes(defaultEffort) ? defaultEffort : 'standard',
  seed: 1,
});

/** The roster's characters other than `character` (the Celestial partner picker). */
export const otherCharacters = (character, characters = []) => (characters ?? []).filter((c) => c && c.id !== character?.id);

/**
 * What resolveTarget needs beside the spec: the character and, for a Celestial roster partner, that partner
 * resolved from `characters` (null when it is gone; resolveTarget then says so).
 */
export const targetContext = (target, character, characters = []) => ({ character, partner: rosterPartnerFor(target, characters) });

/**
 * A Celestial fight whose partner is gone (character, preset or opponent deleted) -> the same fight solo,
 * with tank and starter back on their defaults. `characters` undefined: roster partners are not checked.
 */
function celestialWithoutDanglingPartner(t, character, characters) {
  const ref = t.partner;
  let gone = false;
  if (ref && typeof ref === 'object') {
    if (ref.source === 'opponent') gone = !(character?.opponents ?? []).some((o) => o.id === ref.opponentId);
    else if (ref.source === 'character' && characters) gone = !rosterPartnerFor(t, characters);
  }
  if (!gone) return t;
  return { ...t, partner: null, tank: t.tank === 'partner' ? 'auto' : t.tank, starter: t.starter === 'partner' ? 'me' : t.starter };
}

/**
 * Any value -> a setup that is valid for `character`: an unknown preset falls back to the active one,
 * a target that does not resolve (or an objective it cannot score) to the defaults, deleted
 * opponents drop out of a PVP target, a deleted Celestial partner leaves the fight solo. Unknown keys
 * are ignored. `characters` is the roster's characters (for a Celestial roster partner).
 */
export function normaliseSetup(raw, character, defaultEffort = 'standard', characters = undefined) {
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
    if (t.kind === CELESTIAL_TARGET_KIND) t = celestialWithoutDanglingPartner(t, character, characters);
    try {
      // without the roster a roster partner cannot be resolved here; the spec is checked solo instead
      const check = t.kind === CELESTIAL_TARGET_KIND && t.partner?.source === 'character' && !characters
        ? { ...t, partner: null, tank: 'auto', starter: 'me' }
        : t;
      if (t.kind !== 'pvp') resolveTarget(check, targetContext(check, character, characters));
      out.target = t;
    } catch {
      // keep the default target
    }
  }
  const allowed = objectiveKindsFor(out.target.kind, out.target.kind === 'pvp' ? null : out.target);
  const o = r.objective && typeof r.objective === 'object' ? strip(r.objective, OBJECTIVE_ECHO) : null;
  out.objective = o && allowed.includes(o.kind) ? o : { kind: allowed[0] };
  if (out.objective.kind === 'survival' && !(Number.isFinite(out.objective.seconds) && out.objective.seconds >= 5)) delete out.objective.seconds;
  if (out.objective.kind === 'win-chance') out.objective = { kind: 'win-chance' }; // no target: it maximises the clear rate
  const bound = out.objective.kind === 'push' ? PUSH_TARGET : WIN_RATE_TARGET;
  if ((out.objective.kind === 'win-rate' || out.objective.kind === 'push') && !(Number.isFinite(out.objective.target) && out.objective.target >= bound.min && out.objective.target <= bound.max)) delete out.objective.target;

  if (r.space && typeof r.space === 'object') {
    for (const k of Object.keys(SPACE_DEFAULTS)) if (typeof r.space[k] === 'boolean') out.space[k] = r.space[k];
  }
  out.powerFloor = normalisePowerFloor(r.powerFloor);
  if (EFFORT_LEVELS.includes(r.effort)) out.effort = r.effort;
  if (Number.isInteger(r.seed) && r.seed >= 1) out.seed = r.seed;
  return out;
}

/** Mythic+ levels offered as Combat Power floor quick picks. */
export const POWER_FLOOR_MYTHIC_PLUS = 10;

const gatePick = (label, value) => ({ value, label: `${label} (${formatFlat(value)})` });

/**
 * The highest Hell Crusade gate a Power meets (Hard, Mythic or Mythic+N with no upper N), as a pick, or
 * null below Hard. The guard's default: a suggestion then never costs the player their current gate.
 */
export function currentCrusadeGate(power) {
  if (!(Number.isFinite(power) && power >= crusadePowerRequirement('HARD'))) return null;
  if (power < crusadePowerRequirement('MYTHIC')) return gatePick('Crusade Hard', crusadePowerRequirement('HARD'));
  let n = 0;
  while (crusadePowerRequirement('MYTHIC', n + 1) <= power) n += 1;
  return gatePick(n === 0 ? 'Crusade Mythic' : `Crusade Mythic+${n}`, crusadePowerRequirement('MYTHIC', n));
}

/**
 * Quick picks for the Combat Power floor ({value, label}): the preset's current Power (when known), its
 * current Crusade gate when that is above Mythic+10, then the Hell Crusade gates Hard, Mythic and
 * Mythic+1..10 (Game/pve-content.md §5).
 */
export function powerFloorPicks(currentPower = null) {
  const out = [];
  if (Number.isFinite(currentPower) && currentPower >= 1) out.push({ value: Math.round(currentPower), label: `Current Power (${formatFlat(currentPower)})` });
  const gates = [gatePick('Crusade Hard', crusadePowerRequirement('HARD')), gatePick('Crusade Mythic', crusadePowerRequirement('MYTHIC'))];
  for (let n = 1; n <= POWER_FLOOR_MYTHIC_PLUS; n++) gates.push(gatePick(`Crusade Mythic+${n}`, crusadePowerRequirement('MYTHIC', n)));
  const gate = currentCrusadeGate(currentPower);
  if (gate && !gates.some((g) => g.value === gate.value)) out.push(gate);
  return [...out, ...gates];
}

/** Why a retired goal cannot be run again. */
export const RETIRED_GOAL_REASON = 'This goal was retired.';

/**
 * '' when the goal of a saved run or of a job request ({target, objective}) can still be run, else
 * RETIRED_GOAL_REASON. Drives the disabled state of Re-run with settings, Run more and Resume; the
 * saved run itself stays viewable.
 */
export function retiredGoalBlock(spec) {
  const t = spec?.target?.kind;
  const o = spec?.objective?.kind;
  return t && o && goalRetired(t, o) ? RETIRED_GOAL_REASON : '';
}

/** The setup a saved run was made with ("Re-run with settings"), validated against today's character. */
export function setupFromRun(run, character, defaultEffort = 'standard', characters = undefined) {
  const level = run.budget?.level;
  return normaliseSetup(
    {
      presetId: run.presetId,
      target: run.target,
      objective: run.objective,
      space: run.space,
      powerFloor: run.powerFloor,
      effort: EFFORT_LEVELS.includes(level) ? level : undefined,
      seed: run.seed,
    },
    character,
    defaultEffort,
    characters,
  );
}

/** The character the search sees: the saved run history is not an input and must not move the characterKey. */
export const searchCharacter = (character) => ({ ...JSON.parse(JSON.stringify(character)), runs: [] });

/**
 * Is a saved run out of date against the character as it is now? A run is measured on one snapshot (its
 * `characterKey`); once any search input has changed the stored candidates may no longer mean what they
 * did. A run without a key cannot be checked and counts as stale.
 */
export const runIsStale = (run, character) => !run?.characterKey || !character || run.characterKey !== metricKey('character', searchCharacter(character));

/**
 * Why a saved run cannot be applied right now, or '' when it can: its preset is gone, the character moved on
 * since it was measured, or it was saved before the write groups were kept (re-run to get them).
 */
export function runApplyBlock(run, character) {
  if (!run || !character) return 'Nothing to apply.';
  if (!character.presets.some((p) => p.id === run.presetId)) return 'That preset no longer exists.';
  if (run.schema !== 2) return 'This run was saved before it could be applied. Re-run with settings.';
  if (runIsStale(run, character)) return 'The character changed since this run. Re-run with settings before applying.';
  return '';
}

/**
 * The `optimize` worker request for a setup. A Celestial roster partner is resolved here from `characters`
 * into `partner` (plain JSON): the worker never sees the roster.
 */
export function requestOf(setup, character, characters = []) {
  const partner = rosterPartnerFor(setup.target, characters);
  return {
    mode: 'optimize',
    character: searchCharacter(character),
    ...(partner ? { partner } : {}),
    presetId: setup.presetId,
    target: JSON.parse(JSON.stringify(setup.target)),
    objective: JSON.parse(JSON.stringify(setup.objective)),
    space: { ...setup.space },
    ...(setup.powerFloor != null ? { powerFloor: setup.powerFloor } : {}),
    effort: setup.effort,
    seed: setup.seed,
  };
}

/** Staleness signature of a run: the preset and the character snapshot the search sees. */
export function signatureOf(character, presetId) {
  if (!character) return null;
  return jobSignature({ characterKey: character.id, presetId, inputs: metricKey('character', searchCharacter(character)) });
}
