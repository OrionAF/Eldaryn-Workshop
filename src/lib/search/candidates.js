// search/candidates.js (F2a): what a searchable build is, how it becomes a Fighter, and the
// neighbour moves of each search dimension.
//
// A Candidate is a plain-JSON choice block applied on top of ONE preset of a character:
//   {
//     equipmentSet: 1|2,                 gear set (ignored in the Oblivion realm: that realm has one set)
//     talentSet: 0|1,                    which saved talent set
//     talentAllocation: {id: rank}|null  full allocation override for that set; null = the saved one
//     petId: string|null,  mountId: string|null,
//     mountGlyphs: {minor: (id|null)[3], major: (id|null)[2], mythic: (id|null)[1]}|null
//                                        socket override on the chosen mount; null = as saved
//     relicIds: string[],                sigilSpecies: string[]   (generic),
//     utilitySigilSpecies: string|null,  ancientSigilSpecies: string|null,
//     transcendencePresetId: string|null,
//     sigilConditions: Record<species, conditionId>,   activation conditions of the equipped sigils
//   }
// Everything else (gear contents, stones, relic levels, sigil levels, awakening, fortress, pet and mount
// stats) is fixed. Only the self conditions (MY_HP_BELOW_*) are searched: in PVE, damage and debuff
// sigils cast on cooldown whatever their condition, so ENEMY_HP_BELOW_* is inert (combat-pve.md §10.1),
// while self conditions still read the fighter's real HP. Conditions only apply from level 54.
//
// Building a candidate: a shallow overlay of the character (nothing is cloned or mutated), then
// build/fighter.js with the sheets cleared, then the current preset's residual (build/residual.js
// applyResidual), so a candidate is scored on "computed + what the in-game sheet adds on top".
import { buildFighter } from '../build/fighter.js';
import { applyResidual } from '../build/residual.js';
import { relicsForClass } from '../game/relics.js';
import { isSigilSpeciesActiveForSpec } from '../game/sigils.js';
import { talentSpec, TALENT_CONSTANTS } from '../game/talents.js';
import { sanitiseAllocation, pointsSpent } from '../model/talents.js';
import {
  genericSigils, utilitySigils, ancientSigils, maxSigilSlots, sigilConditionOptions, SELF_CONDITIONS, DEFAULT_CONDITION,
  SIGIL_CONDITIONS_LEVEL,
} from '../model/sigils.js';
import { glyphSocketable } from '../model/mounts.js';
import { PRESET_RELIC_CAP, PRESET_SIGIL_CAP } from '../model/presets.js';
import { choose, combinations } from './combinatorics.js';

/** Dimension toggles (all on by default) and the relic slot count the search may fill. */
export const SPACE_DEFAULTS = {
  equipmentSet: true,
  talentSet: true,
  talents: true,
  pet: true,
  mount: true,
  glyphs: true,
  relics: true,
  sigils: true,
  utility: true,
  ancient: true,
  conditions: true,
  transcendence: true,
  relicSlots: PRESET_RELIC_CAP,
};

/** Search order of the dimensions within a pass. */
export const DIMENSION_ORDER = ['sigils', 'utility', 'ancient', 'conditions', 'relics', 'pet', 'mount', 'glyphs', 'transcendence', 'equipmentSet', 'talentSet', 'talents'];

/** Exhaustive subset enumeration stops at this many subsets; beyond it the dimension uses single swaps. */
const ENUMERATE_LIMIT = 2500;

const sorted = (a) => [...a].sort();
const emptySockets = () => ({ minor: [], major: [], mythic: [] });

/** The candidate that reproduces `preset` exactly. */
export function candidateOf(character, preset) {
  return {
    equipmentSet: preset.equipmentSet === 2 ? 2 : 1,
    talentSet: preset.talentSet === 1 ? 1 : 0,
    talentAllocation: null,
    petId: preset.petId ?? null,
    mountId: preset.mountId ?? null,
    mountGlyphs: null,
    relicIds: [...(preset.relicIds ?? [])],
    sigilSpecies: [...(preset.sigilSpecies ?? [])],
    utilitySigilSpecies: preset.utilitySigilSpecies ?? null,
    ancientSigilSpecies: preset.ancientSigilSpecies ?? null,
    transcendencePresetId: preset.transcendencePresetId ?? null,
    sigilConditions: { ...(preset.sigilConditions ?? {}) },
  };
}

/**
 * What applying a candidate means in persisted terms (for the UI's "Apply to preset"):
 * the preset fields to write, the talent-set allocation to write (or null), and the mount sockets to
 * write (or null). Glyph instances that the sockets take from another mount must be unsocketed there.
 */
export function candidatePatch(candidate) {
  return {
    preset: {
      equipmentSet: candidate.equipmentSet, talentSet: candidate.talentSet, petId: candidate.petId,
      mountId: candidate.mountId, relicIds: [...candidate.relicIds], sigilSpecies: [...candidate.sigilSpecies],
      utilitySigilSpecies: candidate.utilitySigilSpecies, ancientSigilSpecies: candidate.ancientSigilSpecies,
      transcendencePresetId: candidate.transcendencePresetId, sigilConditions: { ...candidate.sigilConditions },
    },
    talentAllocation: candidate.talentAllocation ? { talentSet: candidate.talentSet, allocation: { ...candidate.talentAllocation } } : null,
    mountGlyphs: candidate.mountGlyphs && candidate.mountId ? { mountId: candidate.mountId, glyphs: structuredCloneSockets(candidate.mountGlyphs) } : null,
  };
}

const structuredCloneSockets = (g) => ({ minor: [...g.minor], major: [...g.major], mythic: [...g.mythic] });

/**
 * The preset-shaped object and character overlay a candidate stands for. The overlay shares every
 * untouched piece with `character` (it is read-only to the build layer). Sheets are cleared: a
 * candidate's stats are computed, not the sheet of the build it replaces.
 * @returns {{character: Object, preset: Object}}
 */
export function materialise(character, preset, candidate) {
  const mp = {
    ...preset,
    equipmentSet: candidate.equipmentSet,
    talentSet: candidate.talentSet,
    petId: candidate.petId,
    mountId: candidate.mountId,
    relicIds: candidate.relicIds,
    sigilSpecies: candidate.sigilSpecies,
    utilitySigilSpecies: candidate.utilitySigilSpecies,
    ancientSigilSpecies: candidate.ancientSigilSpecies,
    transcendencePresetId: candidate.transcendencePresetId,
    sigilConditions: candidate.sigilConditions,
    sheet: null,
  };
  const out = { ...character, presets: [mp], activePresetId: mp.id, oblivion: { ...character.oblivion, sheet: null } };
  if (candidate.talentAllocation) {
    out.talentSets = character.talentSets.map((s, i) => (i === candidate.talentSet ? { ...s, allocation: candidate.talentAllocation } : s));
  }
  if (candidate.mountGlyphs && candidate.mountId) {
    out.mounts = character.mounts.map((m) => (m.id === candidate.mountId ? { ...m, glyphs: candidate.mountGlyphs } : m));
  }
  return { character: out, preset: mp };
}

/**
 * Everything the optimiser needs about the search space of one preset.
 * @param {Object} character
 * @param {Object} preset
 * @param {{realm?: 'base'|'oblivion', residual?: Object, space?: Object}} [o]
 */
export function createBuildSpace(character, preset, { realm = 'base', residual = {}, space } = {}) {
  const toggles = { ...SPACE_DEFAULTS };
  for (const k of Object.keys(SPACE_DEFAULTS)) {
    if (space && k in space) toggles[k] = k === 'relicSlots' ? Math.max(1, Math.min(PRESET_RELIC_CAP, Math.floor(Number(space[k])) || 1)) : !!space[k];
  }
  const cls = character.class;
  const start = candidateOf(character, preset);
  const mountById = (id) => (character.mounts ?? []).find((m) => m.id === id) ?? null;
  const savedAllocation = (c) => character.talentSets?.[c.talentSet]?.allocation ?? {};
  const effAllocation = (c) => c.talentAllocation ?? savedAllocation(c);
  const effSockets = (c) => c.mountGlyphs ?? mountById(c.mountId)?.glyphs ?? emptySockets();
  const specOf = (c) => character.talentSets?.[c.talentSet]?.spec ?? null;

  const gated = (character.level ?? 100) >= SIGIL_CONDITIONS_LEVEL;
  const equippedOf = (c) => [...c.sigilSpecies, c.utilitySigilSpecies, c.ancientSigilSpecies].filter(Boolean);
  const condOf = (c, sp) => (gated && c.sigilConditions?.[sp]) || DEFAULT_CONDITION;
  const conditionsKey = (c) => sorted(equippedOf(c)).map((sp) => condOf(c, sp)).join('|');

  // --- identity -----------------------------------------------------------------------------
  const allocKey = (a) => Object.entries(a).filter(([, r]) => r > 0).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0));
  const key = (c) => JSON.stringify([
    realm === 'oblivion' ? 0 : c.equipmentSet, c.talentSet, allocKey(effAllocation(c)), c.petId, c.mountId,
    c.mountId ? [sorted(effSockets(c).minor.filter(Boolean)), sorted(effSockets(c).major.filter(Boolean))] : null,
    sorted(c.relicIds), sorted(c.sigilSpecies), c.utilitySigilSpecies, c.ancientSigilSpecies, c.transcendencePresetId,
    conditionsKey(c),
  ]);
  // The spell kit: what the closed-form screen cannot rank, so the screen keeps some of every kit.
  const kitKey = (c) => JSON.stringify([
    sorted(c.sigilSpecies), c.utilitySigilSpecies, c.ancientSigilSpecies, c.mountId,
    c.mountId ? sorted(effSockets(c).major.filter(Boolean)) : null, c.talentSet, conditionsKey(c),
  ]);

  // How far a candidate is from the current build: one per changed set element, per changed single
  // choice and per talent point moved. Ties between equally good builds go to the smaller distance.
  const startAlloc = effAllocation(start);
  const startSockets = effSockets(start);
  const symDiff = (a, b) => a.filter((x) => !b.includes(x)).length + b.filter((x) => !a.includes(x)).length;
  const distance = (c) => {
    let d = 0;
    if (realm !== 'oblivion' && c.equipmentSet !== start.equipmentSet) d++;
    if (c.talentSet !== start.talentSet) d++;
    const a = effAllocation(c);
    for (const id of new Set([...Object.keys(a), ...Object.keys(startAlloc)])) d += Math.abs((a[id] || 0) - (startAlloc[id] || 0)) / 2;
    for (const f of ['petId', 'mountId', 'utilitySigilSpecies', 'ancientSigilSpecies', 'transcendencePresetId']) if (c[f] !== start[f]) d++;
    for (const sp of equippedOf(c)) if (condOf(c, sp) !== condOf(start, sp)) d++;
    d += symDiff(c.relicIds, start.relicIds) / 2 + symDiff(c.sigilSpecies, start.sigilSpecies) / 2;
    if (c.mountId && c.mountId === start.mountId) {
      const s = effSockets(c);
      d += symDiff(s.minor.filter(Boolean), startSockets.minor.filter(Boolean)) / 2 + symDiff(s.major.filter(Boolean), startSockets.major.filter(Boolean)) / 2;
    }
    return d;
  };

  // --- fighter ------------------------------------------------------------------------------
  const fighterOf = (c) => {
    const m = materialise(character, preset, c);
    const f = buildFighter(m.character, m.preset.id, { realm });
    f.stats = applyResidual(f.stats, residual);
    f.source = 'computed';
    return f;
  };
  const describeArgs = (c) => {
    const m = materialise(character, preset, c);
    return [m.character, m.preset, { realm }];
  };

  // --- moves --------------------------------------------------------------------------------
  const owned = (map, id) => !!map?.[id];

  /** Subsets of `pool` of size k: all of them when few, else single swaps (and an add when short). */
  const setMoves = (current, pool, k) => {
    const have = current.filter((x) => pool.includes(x));
    if (pool.length === 0 || k <= 0) return [];
    if (choose(pool.length, Math.min(k, pool.length)) <= ENUMERATE_LIMIT) return combinations(pool, k);
    const out = [];
    if (have.length < k) for (const p of pool) if (!have.includes(p)) out.push([...have, p]);
    for (let i = 0; i < have.length; i++) {
      for (const p of pool) if (!have.includes(p)) out.push(have.map((x, j) => (j === i ? p : x)));
    }
    return out;
  };

  const dimensions = [];
  const add = (id, enabled, neighbours) => {
    if (enabled) dimensions.push({ id, neighbours });
  };

  add('equipmentSet', toggles.equipmentSet && realm !== 'oblivion', (c) => [{ ...c, equipmentSet: c.equipmentSet === 1 ? 2 : 1 }]);

  add('talentSet', toggles.talentSet, (c) => {
    const other = c.talentSet === 1 ? 0 : 1;
    return character.talentSets?.[other]?.spec ? [{ ...c, talentSet: other, talentAllocation: null }] : [];
  });

  add('talents', toggles.talents, (c) => {
    const specKey = specOf(c);
    const spec = talentSpec(specKey);
    if (!spec) return [];
    const alloc = effAllocation(c);
    const spent = pointsSpent(alloc);
    const talents = spec.tiers.flatMap((t) => t.talents);
    const saved = allocKey(savedAllocation(c));
    const out = [];
    const push = (next, expectSpent) => {
      const clean = sanitiseAllocation(next, specKey);
      if (pointsSpent(clean) !== expectSpent) return; // a tier lost its unlock threshold
      const same = JSON.stringify(allocKey(clean)) === JSON.stringify(saved);
      out.push({ ...c, talentAllocation: same ? null : clean });
    };
    for (const to of talents) {
      if ((alloc[to.id] || 0) >= to.maxRank) continue;
      if (spent < TALENT_CONSTANTS.totalTalentPoints) push({ ...alloc, [to.id]: (alloc[to.id] || 0) + 1 }, spent + 1);
      for (const from of talents) {
        if (from.id === to.id || !(alloc[from.id] > 0)) continue;
        push({ ...alloc, [from.id]: alloc[from.id] - 1, [to.id]: (alloc[to.id] || 0) + 1 }, spent);
      }
    }
    return out;
  });

  add('pet', toggles.pet, (c) => [null, ...(character.pets?.owned ?? []).map((p) => p.id)]
    .filter((id) => id !== c.petId).map((id) => ({ ...c, petId: id })));

  add('mount', toggles.mount, (c) => [null, ...(character.mounts ?? []).map((m) => m.id)]
    .filter((id) => id !== c.mountId).map((id) => ({ ...c, mountId: id, mountGlyphs: null })));

  add('glyphs', toggles.glyphs, (c) => {
    const mount = mountById(c.mountId);
    if (!mount) return [];
    const sockets = effSockets(c);
    // A glyph socketed on another mount can be socketed here too (Game/mounts-glyphs.md §8);
    // only a repeat within this mount is ruled out (the `cur.includes` check below).
    const out = [];
    for (const tier of ['minor', 'major']) {
      const seen = new Set();
      const pool = [];
      for (const g of character.glyphs ?? []) {
        if (!glyphSocketable(character, g, tier)) continue;
        const sig = JSON.stringify([g.glyphType, g.rarity, g.secondary?.stat ?? null, g.secondary?.quality ?? null]);
        if (seen.has(sig)) continue;
        seen.add(sig);
        pool.push(g.id);
      }
      const cur = sockets[tier] ?? [];
      for (let i = 0; i < cur.length; i++) {
        for (const id of [...pool, null]) {
          if (id === cur[i] || (id && cur.includes(id))) continue;
          const next = structuredCloneSockets({ ...emptySockets(), ...sockets });
          next[tier][i] = id;
          out.push({ ...c, mountGlyphs: next });
        }
      }
    }
    return out;
  });

  add('relics', toggles.relics, (c) => {
    const pool = relicsForClass(cls).map((r) => r.id).filter((id) => (character.relics?.[id] ?? 0) > 0);
    return setMoves(c.relicIds, pool, toggles.relicSlots).map((relicIds) => ({ ...c, relicIds }));
  });

  add('sigils', toggles.sigils, (c) => {
    const spec = specOf(c);
    const pool = genericSigils(cls, spec).map((s) => s.species).filter((sp) => owned(character.sigils?.owned, sp));
    const k = Math.min(PRESET_SIGIL_CAP, Math.max(maxSigilSlots(character.level ?? 100, cls), c.sigilSpecies.length));
    return setMoves(c.sigilSpecies, pool, k).map((sigilSpecies) => ({ ...c, sigilSpecies }));
  });

  add('utility', toggles.utility, (c) => {
    const spec = specOf(c);
    const pool = utilitySigils(cls, spec).map((s) => s.species).filter((sp) => owned(character.sigils?.owned, sp));
    if (pool.length === 0 && !c.utilitySigilSpecies) return [];
    return [null, ...pool].filter((sp) => sp !== c.utilitySigilSpecies).map((sp) => ({ ...c, utilitySigilSpecies: sp }));
  });

  add('ancient', toggles.ancient, (c) => {
    const spec = specOf(c);
    const pool = ancientSigils(cls).map((s) => s.species)
      .filter((sp) => owned(character.sigils?.owned, sp) && isSigilSpeciesActiveForSpec(sp, cls, spec));
    return [null, ...pool].filter((sp) => sp !== c.ancientSigilSpecies).map((sp) => ({ ...c, ancientSigilSpecies: sp }));
  });

  add('conditions', toggles.conditions && gated, (c) => {
    const spec = specOf(c);
    const out = [];
    for (const sp of equippedOf(c)) {
      for (const opt of sigilConditionOptions(sp, spec)) {
        if (opt !== DEFAULT_CONDITION && !SELF_CONDITIONS.includes(opt)) continue;
        if (opt === condOf(c, sp)) continue;
        out.push({ ...c, sigilConditions: { ...c.sigilConditions, [sp]: opt } });
      }
    }
    return out;
  });

  add('transcendence', toggles.transcendence, (c) => {
    const ids = (character.transcendence?.presets ?? []).map((p) => p.id);
    return ids.filter((id) => id !== c.transcendencePresetId).map((id) => ({ ...c, transcendencePresetId: id }));
  });

  // Cheap, high-impact dimensions first, so a truncated budget has already spent itself on them.
  dimensions.sort((a, b) => DIMENSION_ORDER.indexOf(a.id) - DIMENSION_ORDER.indexOf(b.id));
  return { start, key, kitKey, distance, fighterOf, describeArgs, dimensions, toggles, specOf };
}
