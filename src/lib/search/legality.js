// search/legality.js (A2): the legality oracle (redesign plan A.4, invariant I1). A candidate is legal
// when it is well formed, survives the write path unchanged (materialise -> normaliseCharacter ->
// candidateOf is the identity) and passes every game gate in model/legality.js. Generators call the
// gates directly; this full check runs on reported rows and in tests.
import { normaliseCharacter } from '../model/index.js';
import {
  checkPreset, talentPointsForLevel, conditionsUnlocked, sigilSlotCap, UNLOCK_LEVELS,
} from '../model/legality.js';
import { pointsSpent } from '../model/talents.js';
import { DEFAULT_CONDITION, ENEMY_CONDITIONS, SELF_CONDITIONS } from '../model/sigils.js';
import { glyphTypeInfo, GLYPH_TIERS, MOUNT_GLYPH_SOCKETS } from '../model/glyphs.js';
import { stableStringify } from '../engine/metrics.js';
import { candidateOf, canonical, materialise, savedSockets } from './space.js';
import { stoneAssignmentViolations } from './stoneAssignments.js';
import { relicLevelViolations } from './relicProgression.js';
import { boardAllocationViolations } from './boardAllocation.js';
import { awakeningViolations } from './awakeningChoices.js';

const CONDITIONS = new Set([DEFAULT_CONDITION, ...ENEMY_CONDITIONS, ...SELF_CONDITIONS]);
// advisory checkPreset entries that are hard gates for a candidate: the optimiser never suggests an
// Ancient its board does not grant (Q3 strict, sigils.md §9)
const STRICT = new Set(['ancientBoard']);

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isStrOrNull = (v) => v === null || isStr(v);

/** Shape and reference checks; anything here would make the write path meaningless. */
function structural(character, presetId, cand, add) {
  const preset = (character.presets ?? []).find((p) => p.id === presetId);
  if (!preset) return add('structural', 'presetId', `Unknown preset ${presetId}`);
  if (!cand || typeof cand !== 'object') return add('structural', 'candidate', 'Not an object');
  for (const message of stoneAssignmentViolations(character, cand.stoneAssignment)) add('stones', 'stoneAssignment', message);
  for (const message of relicLevelViolations(character, cand)) add('relics', 'relicLevels', message);
  for (const message of boardAllocationViolations(character, cand)) add('boardAllocation', 'boardAllocation', message);
  for (const message of awakeningViolations(character, cand)) add('awakening', 'awakening', message);
  if (cand.equipmentSet !== 1 && cand.equipmentSet !== 2) add('structural', 'equipmentSet', 'Must be 1 or 2');
  if (cand.talentSet !== 0 && cand.talentSet !== 1) add('structural', 'talentSet', 'Must be 0 or 1');
  for (const f of ['petId', 'mountId', 'utilitySigilSpecies', 'ancientSigilSpecies', 'transcendencePresetId']) {
    if (!isStrOrNull(cand[f] ?? null)) add('structural', f, 'Must be an id or null');
  }
  for (const f of ['relicIds', 'sigilSpecies']) {
    if (!Array.isArray(cand[f]) || !cand[f].every(isStr)) add('structural', f, 'Must be a list of ids');
    else if (new Set(cand[f]).size !== cand[f].length) add('structural', f, 'Lists an id twice');
  }
  if (cand.petId && !(character.pets?.owned ?? []).some((p) => p.id === cand.petId)) add('owned', 'petId', `Pet ${cand.petId} is not owned`);
  if (cand.mountId && !(character.mounts ?? []).some((m) => m.id === cand.mountId)) add('owned', 'mountId', `Mount ${cand.mountId} is not owned`);
  if (cand.transcendencePresetId && !(character.transcendence?.presets ?? []).some((p) => p.id === cand.transcendencePresetId)) {
    add('structural', 'transcendencePresetId', `No transcendence preset ${cand.transcendencePresetId}`);
  }
  const a = cand.talentAllocation;
  if (a !== null && a !== undefined && (typeof a !== 'object' || Array.isArray(a) || !Object.values(a).every((r) => Number.isInteger(r) && r >= 0))) {
    add('structural', 'talentAllocation', 'Must be null or {talentId: rank}');
  }
  const sc = cand.sigilConditions ?? {};
  if (typeof sc !== 'object' || Array.isArray(sc)) add('structural', 'sigilConditions', 'Must be {species: conditionId}');
  else for (const [sp, v] of Object.entries(sc)) if (!CONDITIONS.has(v)) add('structural', 'sigilConditions', `${v} is not a condition (${sp})`);
  const g = cand.mountGlyphs;
  if (g != null) {
    if (typeof g !== 'object') add('structural', 'mountGlyphs', 'Must be null or sockets');
    else {
      const ids = new Set((character.glyphs ?? []).map((x) => x.id));
      for (const tier of GLYPH_TIERS) {
        const row = g[tier];
        if (!Array.isArray(row) || row.length > MOUNT_GLYPH_SOCKETS[tier] || !row.every(isStrOrNull)) add('structural', 'mountGlyphs', `Bad ${tier} row`);
        else for (const id of row) if (id && !ids.has(id)) add('owned', 'mountGlyphs', `Glyph ${id} is not in the inventory`);
      }
    }
  }
  return undefined;
}

/** The first difference between two plain values, as a short path string. */
function firstDiff(a, b, path = '') {
  if (stableStringify(a) === stableStringify(b)) return null;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
  }
  return `${path}: ${stableStringify(b)} became ${stableStringify(a)}`;
}

/**
 * @param {Object} character  a normalised v2 Character
 * @param {string} presetId
 * @param {Object} cand  a Candidate (search/space.js)
 * @param {{roundTrip?: boolean}} [o]  `roundTrip: false` skips step 2 (the normalise pass), for generators
 * @returns {{ok: boolean, violations: Array<{gate: string, field: string, detail: string}>,
 *   warnings: Array<{gate: string, field: string, detail: string}>}}
 */
export function legalityOf(character, presetId, cand, { roundTrip = true } = {}) {
  const violations = [];
  const warnings = [];
  const add = (gate, field, detail) => violations.push({ gate, field, detail });
  structural(character, presetId, cand, add);
  if (violations.length) return { ok: false, violations, warnings };

  // 2. round-trip: the write path and normalisation keep every choice
  const X = materialise(character, presetId, cand);
  if (roundTrip) {
    const N = normaliseCharacter(X);
    const got = candidateOf(N, presetId);
    const want = canonical(N, presetId, cand);
    const diff = firstDiff(got, want);
    if (diff) add('roundtrip', diff.split(':')[0], `Normalisation changes the candidate: ${diff}`);
  }

  // 3. game gates (model/legality.js), on the written character before any repair
  const preset = X.presets.find((p) => p.id === presetId);
  for (const v of checkPreset(X, preset)) {
    if (v.warn && !STRICT.has(v.gate)) warnings.push({ gate: v.gate, field: v.field, detail: v.detail });
    else add(v.gate, v.field, v.detail);
  }
  const L = Number.isFinite(character.level) ? character.level : 100;
  const spec = character.talentSets?.[cand.talentSet]?.spec ?? null;
  const alloc = cand.talentAllocation ?? character.talentSets?.[cand.talentSet]?.allocation ?? {};
  const cap = talentPointsForLevel(L);
  if (pointsSpent(alloc) > cap) add('talentPoints', 'talentAllocation', `${pointsSpent(alloc)} talent points spent, the level gives ${cap}`);
  if ((sigilSlotCap(L, character.class) === 0) && (preset.utilitySigilSpecies || preset.ancientSigilSpecies)) {
    add('sigilsLocked', 'utilitySigilSpecies', 'Sigils are not unlocked at this level');
  }
  for (const [sp, v] of Object.entries(canonical(character, presetId, cand).sigilConditions)) {
    if (v !== DEFAULT_CONDITION && !conditionsUnlocked(L)) add('conditions', 'sigilConditions', `${sp}: conditions unlock at level ${UNLOCK_LEVELS.CONDITIONS}`);
  }
  // glyphs the candidate places (mounts-glyphs.md §8-§10): unsealed, once per mount, majors of the class and spec
  if (cand.mountId && cand.mountGlyphs) {
    const saved = savedSockets(character, cand.mountId);
    const byId = new Map((character.glyphs ?? []).map((g) => [g.id, g]));
    const seen = new Set();
    for (const tier of GLYPH_TIERS) {
      for (const id of cand.mountGlyphs[tier] ?? []) {
        if (!id) continue;
        if (seen.has(id)) add('glyphDuplicate', 'mountGlyphs', `Glyph ${id} is socketed twice on one mount`);
        seen.add(id);
        const g = byId.get(id);
        if (g?.sealed) add('glyphSealed', 'mountGlyphs', `Glyph ${id} is sealed`);
        const info = glyphTypeInfo(g?.glyphType);
        if (info?.tier !== tier) add('glyphTier', 'mountGlyphs', `Glyph ${id} does not fit a ${tier} socket`);
        if (tier === 'major' && info?.tier === 'major' && !(saved.major ?? []).includes(id)) {
          if (info.def.playerClass !== character.class) add('glyphClass', 'mountGlyphs', `${info.name} is for another class`);
          else if (info.def.requiredSpec != null && info.def.requiredSpec !== spec) add('glyphSpec', 'mountGlyphs', `${info.name} needs ${info.def.requiredSpec}`);
        }
      }
    }
  }
  return { ok: violations.length === 0, violations, warnings };
}

/** Throws when a candidate is not legal (assertions in result assembly and tests). */
export function assertLegal(character, presetId, cand) {
  const r = legalityOf(character, presetId, cand);
  if (!r.ok) throw new Error(`Illegal candidate: ${r.violations.map((v) => `${v.gate} (${v.detail})`).join('; ')}`);
  return r;
}
