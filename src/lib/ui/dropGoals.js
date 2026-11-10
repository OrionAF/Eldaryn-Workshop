// ui/dropGoals.js - Drop Check's goals on the page: resolved against today's character and roster, filtered to
// the drop's realm, turned into the dropCheck request's `goals`, and imported once from the old Measure settings.
// Pure. The goals themselves are persisted on the character (model/dropCheck.js); what a goal measures is
// simulation.md §Drop Check.
import { goalObjective, goalIsDamageOnly, DROP_OBJECTIVE_KINDS, GUARD_OBJECTIVE_KINDS } from '../features/swap.js';
import { objectiveKindsFor } from '../search/objectives.js';
import { rosterPartnerFor } from '../search/celestialObjective.js';
import { PVP_MAX_OPPONENTS } from '../search/pvpObjective.js';
import { OBJECTIVE_LABEL, TARGET_KIND_LABEL } from './optimiserView.js';

/**
 * Objective kinds a target kind offers in Drop Check (the Optimiser's list without the ones a swap cannot use);
 * a guard only the rates it can hold to a target.
 */
export function dropObjectiveKinds(targetKind, rawTarget = null, role = 'judge') {
  const kinds = role === 'guard' ? GUARD_OBJECTIVE_KINDS : DROP_OBJECTIVE_KINDS;
  return objectiveKindsFor(targetKind, rawTarget).filter((k) => kinds.includes(k));
}

/** A new goal's starting point (the Add goal editor). */
export const NEW_GOAL = Object.freeze({ target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' }, role: 'judge', presetIds: null });

/**
 * One saved goal, checked against today's character: deleted PVP opponents and presets drop out, a Celestial
 * roster partner is looked up in `characters`. A goal that no longer runs keeps its place with the reason; one
 * scoped to presets that are all gone runs on none and says so (`error`), never silently on every preset.
 * @returns {{goal: Object, ok: boolean, error: string, realm: 'base'|'oblivion'|null, label: string, partner: Object|null,
 *   role: 'judge'|'guard', presetIds: string[]|null}}
 */
export function resolveDropGoal(goal, character, characters = []) {
  let target = goal.target;
  if (target?.kind === 'pvp') {
    const known = new Set((character?.opponents ?? []).map((o) => o.id));
    target = { ...target, opponentIds: (target.opponentIds ?? []).filter((id) => known.has(id)) };
  }
  const role = goal.role === 'guard' ? 'guard' : 'judge';
  const presets = new Set((character?.presets ?? []).map((p) => p.id));
  const presetIds = Array.isArray(goal.presetIds) ? goal.presetIds.filter((id) => presets.has(id)) : null;
  const fixed = { ...goal, target, role, presetIds };
  const scope = { role, presetIds };
  if (presetIds && !presetIds.length) {
    const label = `${TARGET_KIND_LABEL[target?.kind] ?? target?.kind ?? 'Goal'}: ${OBJECTIVE_LABEL[goal.objective?.kind] ?? goal.objective?.kind ?? ''}`;
    return { goal: fixed, ok: false, error: 'Judges no preset: pick one', realm: null, label, partner: null, ...scope };
  }
  const partner = target?.kind === 'celestial' ? rosterPartnerFor(target, characters) : null;
  try {
    const { target: t, objective } = goalObjective(fixed, { character, partner });
    return { goal: fixed, ok: true, error: '', realm: t.realm ?? 'base', label: `${t.label}: ${objective.label}`, partner, damageOnly: goalIsDamageOnly(t, objective), ...scope };
  } catch (e) {
    const label = `${TARGET_KIND_LABEL[target?.kind] ?? target?.kind ?? 'Goal'}: ${OBJECTIVE_LABEL[goal.objective?.kind] ?? goal.objective?.kind ?? ''}`;
    return { goal: fixed, ok: false, error: e?.message ?? String(e), realm: null, label, partner: null, ...scope };
  }
}

/** Every goal of a list, resolved (resolveDropGoal). */
export const resolveDropGoals = (goals, character, characters = []) => (goals ?? []).map((g) => resolveDropGoal(g, character, characters));

/** The resolved goals a drop in `realm` is judged by: the ones that run, in that realm. */
export const goalsForRealm = (resolved, realm) => resolved.filter((r) => r.ok && r.realm === realm);

/** The request's `goals` (plain JSON; a Celestial roster partner rides along, the worker never sees the roster). */
export function requestGoals(resolved) {
  return resolved.filter((r) => r.ok).map((r) => ({
    id: r.goal.id,
    target: JSON.parse(JSON.stringify(r.goal.target)),
    objective: JSON.parse(JSON.stringify(r.goal.objective)),
    ...(r.role === 'guard' ? { role: 'guard', guard: { target: r.goal.guard?.target ?? 0.95 } } : {}),
    ...(r.partner ? { partner: r.partner } : {}),
  }));
}

/** True when a resolved goal judges `presetId` (no preset list: every preset). */
export const goalJudgesPreset = (r, presetId) => !r.presetIds || r.presetIds.includes(presetId);

/** The goal ids a drop in `realm` meets on one preset: its realm's goals scoped to that preset. */
export const goalIdsFor = (resolved, realm, presetId) => goalsForRealm(resolved, realm).filter((r) => goalJudgesPreset(r, presetId)).map((r) => r.goal.id);

/** True when a goal that runs can see defence (a guard, or a fight that hits back): the loot-bag screen then counts HP. */
export const goalsSeeDefence = (resolved) => resolved.some((r) => r.ok && (r.role === 'guard' || !r.damageOnly));

/** The goal ids each realm's drops are judged by (before preset scoping). */
export const goalIdsByRealm = (resolved) => ({
  base: goalsForRealm(resolved, 'base').map((r) => r.goal.id),
  oblivion: goalsForRealm(resolved, 'oblivion').map((r) => r.goal.id),
});

/**
 * The goals the old Measure settings stood for (UI key `dropSetups`, before 2026-11-10): DPS against the
 * dummy, survival against an enemy (now its clear chance, decision D4) and PVP against saved opponents.
 * Only settings the user changed were ever stored, so an untouched page imports nothing (decision D1).
 * @returns {Array<{target: Object, objective: Object}>}
 */
export function legacyDropGoals(raw) {
  if (!raw || typeof raw !== 'object' || raw.goalsImported) return [];
  const out = [];
  if (raw.simOn === true) out.push({ target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' } });
  const e = raw.enemySpec;
  if (raw.survivalOn === true && e && typeof e === 'object') {
    const target = e.kind === 'campaign' ? { kind: 'chapter', chapter: e.chapter, level: e.level }
      : e.kind === 'dungeon' ? { kind: 'dungeon', id: e.id, step: e.step }
        : e.kind === 'raid' ? { kind: 'raid', id: e.id, step: e.step }
          : e.kind === 'oblivion' ? { kind: 'oblivion', floor: e.floor }
            : null;
    if (target) out.push({ target, objective: { kind: 'win-chance' } });
  }
  if (raw.pvpOn === true) {
    out.push({ target: { kind: 'pvp', opponentIds: Array.isArray(raw.pvpIds) ? raw.pvpIds : [], seats: 'attacker', allOpponents: raw.pvpIds == null }, objective: { kind: 'pvp-winrate' } });
  }
  return out;
}

/** A legacy PVP goal that meant "every saved opponent" gets today's opponent list (up to the Optimiser's cap). */
export function expandLegacyGoals(goals, character, maxOpponents = PVP_MAX_OPPONENTS) {
  return goals.map((g) => {
    if (g.target.kind !== 'pvp') return g;
    const { allOpponents, ...t } = g.target;
    return { ...g, target: allOpponents ? { ...t, opponentIds: (character?.opponents ?? []).slice(0, maxOpponents).map((o) => o.id) } : t };
  });
}
