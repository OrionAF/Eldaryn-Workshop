// model/dropCheck.js: Drop Check's goals. Persisted character field: dropCheck (data-model.md, Drop Check goals).
//
//   dropCheck = { profiles: [{ id, name, goals: Goal[] }], activeProfileId }
//   Goal      = { id, target: TargetSpec, objective: ObjectiveSpec,   (search/objectives.js plain JSON)
//                 role: 'judge'|'guard', guard?: {target: 0.01..1}, presetIds: string[]|null }
//
// A goal is what Drop Check judges a drop by (an Optimiser fight and what "better" means there). A judge's
// change counts toward up or down; a guard is a clear rate the after-build must keep (simulation.md §Drop
// Check). `presetIds` limits a goal to the presets built for it (null: every preset). Profiles are
// character-wide: presets carry no goal (data-model.md §2).
//
// Normalisation here is structural only (L3 imports L1 only): a target and an objective are plain objects
// with a string `kind`. Whether a goal can run (its target resolves, the objective can score it) is checked
// where it is used (ui/dropGoals.js), so a goal whose content changes is shown as broken, never dropped.
// Domain contract: see model/index.js (default/normalise/migrate/reconcile).
import { newId } from './character.js';

/** Goals per profile and profiles per character. */
export const DROP_GOAL_MAX = 8;
export const DROP_PROFILE_MAX = 8;
const DEFAULT_PROFILE_ID = 'goals';
/** Keys a stored spec may carry from a result echo; never part of the spec. */
const ECHO = ['label', 'key', 'mode', 'fidelity', 'assumptions', 'unit', 'higherIsBetter', 'statistic', 'q', 'deltaKind'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

export const DROP_GOAL_ROLES = Object.freeze(['judge', 'guard']);
/** A guard's clear rate: the default and the allowed range (the Optimiser's win-rate target). */
export const GUARD_TARGET = Object.freeze({ default: 0.95, min: 0.01, max: 1 });
const PROFILE_NAME_MAX = 40;

/** Any value -> a guard target in range (the default when it is not a number). */
export function guardTarget(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return GUARD_TARGET.default;
  return Math.min(GUARD_TARGET.max, Math.max(GUARD_TARGET.min, v));
}

/** Any value -> a profile name (trimmed, at most 40 characters), or `fallback` when blank. */
export const profileName = (v, fallback = 'Goals') => (typeof v === 'string' && v.trim() ? v.trim().slice(0, PROFILE_NAME_MAX) : fallback);

export const defaultDropCheck = () => ({
  dropCheck: { profiles: [{ id: DEFAULT_PROFILE_ID, name: 'Goals', goals: [] }], activeProfileId: DEFAULT_PROFILE_ID },
});

/** A plain-JSON copy of a spec without echo keys, or null when it is not a `{kind: string}` object. */
function specOf(raw) {
  if (!isObj(raw) || typeof raw.kind !== 'string' || !raw.kind) return null;
  let copy;
  try {
    copy = JSON.parse(JSON.stringify(raw));
  } catch {
    return null;
  }
  for (const k of ECHO) delete copy[k];
  return copy;
}

/** Any value -> a valid goal or null. A missing id gets a new one; a missing role is a judge on every preset. */
export function normaliseDropGoal(raw) {
  if (!isObj(raw)) return null;
  const target = specOf(raw.target);
  const objective = specOf(raw.objective);
  if (!target || !objective) return null;
  const role = raw.role === 'guard' ? 'guard' : 'judge';
  const presetIds = Array.isArray(raw.presetIds) ? [...new Set(raw.presetIds.filter((id) => typeof id === 'string' && id))] : null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('g'),
    target,
    objective,
    role,
    ...(role === 'guard' ? { guard: { target: guardTarget(raw.guard?.target) } } : {}),
    presetIds,
  };
}

/** Any list -> valid goals: bad entries dropped, ids made unique, at most DROP_GOAL_MAX. */
export function normaliseDropGoals(list) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const g = normaliseDropGoal(raw);
    if (!g) continue;
    if (seen.has(g.id)) g.id = newId('g');
    seen.add(g.id);
    out.push(g);
    if (out.length >= DROP_GOAL_MAX) break;
  }
  return out;
}

/** Any value -> a valid dropCheck slice. Idempotent. There is always at least one profile. */
export function normaliseDropCheck(rawCharacter) {
  const raw = rawCharacter?.dropCheck;
  if (!isObj(raw)) return defaultDropCheck();
  const profiles = [];
  const seen = new Set();
  for (const p of Array.isArray(raw.profiles) ? raw.profiles : []) {
    if (!isObj(p)) continue;
    let id = typeof p.id === 'string' && p.id ? p.id : newId('p');
    if (seen.has(id)) id = newId('p');
    seen.add(id);
    const name = profileName(p.name);
    profiles.push({ id, name, goals: normaliseDropGoals(p.goals) });
    if (profiles.length >= DROP_PROFILE_MAX) break;
  }
  if (!profiles.length) return defaultDropCheck();
  const activeProfileId = profiles.some((p) => p.id === raw.activeProfileId) ? raw.activeProfileId : profiles[0].id;
  return { dropCheck: { profiles, activeProfileId } };
}

/** The active profile (normalised characters always have one). */
export function activeDropProfile(character) {
  const dc = character?.dropCheck;
  return dc?.profiles?.find((p) => p.id === dc.activeProfileId) ?? dc?.profiles?.[0] ?? null;
}

// v1 had no Drop Check goals.
// eslint-disable-next-line no-unused-vars
export function migrateDropCheckFromV1(v1Character) {
  return { value: defaultDropCheck(), idMap: {} };
}

/**
 * Cross-references: a PVP goal keeps only opponents that still exist, and a Celestial goal whose opponent
 * partner was deleted fights solo (tank and starter back to their defaults, as the Optimiser setup does).
 * `presetIds` keeps only presets that exist; a goal left with none stays (it then judges no preset, and says
 * so) rather than silently judging every preset. Roster partners (other characters) are checked where the
 * roster is known (ui/dropGoals.js).
 */
export function reconcileDropCheck(character) {
  const known = new Set((character.opponents ?? []).map((o) => o.id));
  const presets = new Set((character.presets ?? []).map((p) => p.id));
  for (const p of character.dropCheck?.profiles ?? []) {
    for (const g of p.goals) {
      if (Array.isArray(g.presetIds)) g.presetIds = g.presetIds.filter((id) => presets.has(id));
      const t = g.target;
      if (t.kind === 'pvp' && Array.isArray(t.opponentIds)) t.opponentIds = t.opponentIds.filter((id) => known.has(id));
      if (t.kind === 'celestial' && t.partner?.source === 'opponent' && !known.has(t.partner.opponentId)) {
        g.target = { ...t, partner: null, tank: t.tank === 'partner' ? 'auto' : t.tank, starter: t.starter === 'partner' ? 'me' : t.starter };
      }
    }
  }
}
