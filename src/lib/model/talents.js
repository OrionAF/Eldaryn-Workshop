// model/talents.js - persisted talentSets (rebuild-plan §3 TalentSet; Game/talents.md §1-§5).
// talentSets = [TalentSet, TalentSet], TalentSet = { spec: SpecKey|null, allocation: Record<talentId, rank> }.
// Pure; imports L1 only. Domain contract (§3 "Normalisation layout"): every function deals in a partial
// character; normaliseTalents is idempotent and runs FIRST so ctx.spec can be derived from its result.
import { TALENT_CONSTANTS, talentSpec, tierPointsRequired } from '../game/talents.js';

export const TALENT_SET_COUNT = 2;
/** talents.md §2: points available at max level (cap per set; each set may use all of them). */
export const TALENT_POINT_CAP = TALENT_CONSTANTS.totalTalentPoints;

export function emptyTalentSet() {
  return { spec: null, allocation: {} };
}

export function defaultTalents() {
  return { talentSets: [emptyTalentSet(), emptyTalentSet()] };
}

/** Points spent in one spec tier, given an allocation. */
export function tierPointsSpent(tier, allocation) {
  return tier.talents.reduce((s, t) => s + (allocation[t.id] || 0), 0);
}

/** Total points in an allocation. */
export function pointsSpent(allocation) {
  return Object.values(allocation || {}).reduce((s, r) => s + r, 0);
}

/**
 * Repair an allocation against one spec: unknown ids and other specs' talents dropped, ranks clamped
 * to maxRank, tiers whose threshold (points in all earlier KEPT tiers) is unmet cleared, and the total
 * trimmed to the cap. Idempotent.
 */
export function sanitiseAllocation(rawAllocation, specKey) {
  const spec = talentSpec(specKey);
  if (!spec || !rawAllocation || typeof rawAllocation !== 'object') return {};
  const out = {};
  let spent = 0;
  for (const tier of spec.tiers) {
    if (spent < tierPointsRequired(tier.tier)) continue;
    for (const t of tier.talents) {
      const rank = Math.min(Math.floor(Number(rawAllocation[t.id]) || 0), t.maxRank);
      if (rank <= 0) continue;
      const take = Math.min(rank, TALENT_POINT_CAP - spent);
      if (take <= 0) continue;
      out[t.id] = take;
      spent += take;
    }
  }
  return out;
}

function normaliseSet(raw, cls) {
  const spec = typeof raw?.spec === 'string' && cls && talentSpec(raw.spec)?.class === cls ? raw.spec : null;
  return { spec, allocation: spec ? sanitiseAllocation(raw?.allocation, spec) : {} };
}

export function normaliseTalents(rawCharacter, ctx) {
  const list = Array.isArray(rawCharacter?.talentSets) ? rawCharacter.talentSets : [];
  return { talentSets: [normaliseSet(list[0], ctx?.class), normaliseSet(list[1], ctx?.class)] };
}

// v1 spec keys -> v2 (plan §4 migration table)
const V1_SPEC = {
  arms: 'WARRIOR_DPS',
  protection: 'WARRIOR_TANK',
  marksmanship: 'SENTINEL_MARKSMANSHIP',
  disruption: 'SENTINEL_DISRUPTION',
};
const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * v1 talents were `<spec>_t<n>_<snake_name>` ids with their own trees; match by name against the v2
 * tree of the mapped spec (talents.json). Unmatched talents are dropped; normalise gates the rest.
 */
export function migrateTalentsFromV1(v1Character) {
  const list = Array.isArray(v1Character?.talentSets) ? v1Character.talentSets : [];
  const sets = [0, 1].map((i) => {
    const raw = list[i];
    const spec = V1_SPEC[raw?.spec] ?? null;
    if (!spec) return emptyTalentSet();
    const byName = new Map();
    for (const tier of talentSpec(spec).tiers) for (const t of tier.talents) byName.set(squash(t.name), t);
    const allocation = {};
    for (const [oldId, rank] of Object.entries(raw.allocation ?? {})) {
      const m = /^[a-z]+_t\d+_(.+)$/.exec(oldId);
      const hit = byName.get(squash(m ? m[1] : oldId));
      if (hit) allocation[hit.id] = Math.max(allocation[hit.id] || 0, Number(rank) || 0);
    }
    return { spec, allocation };
  });
  return { value: { talentSets: sets }, idMap: {} };
}

export function reconcileTalents(character) {
  if (!Array.isArray(character.talentSets)) character.talentSets = defaultTalents().talentSets;
}
