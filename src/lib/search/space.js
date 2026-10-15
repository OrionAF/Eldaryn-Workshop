// search/space.js (A2): what a searchable build is and every legal value of each search block
// (redesign plan A.3). It replaced the retired search/candidates.js.
//
// The Candidate shape, its canonical form and the block domains are specified in
// docs/Reference/simulation.md §Build space. Merging engine-identical values is search/effect.js.
import { buildFighter } from '../build/fighter.js';
import { applyResidual } from '../build/residual.js';
import { relicsForClass, relicById } from '../game/relics.js';
import { isSigilSpeciesActiveForSpec } from '../game/sigils.js';
import { talentSpec } from '../game/talents.js';
import { stableStringify } from '../engine/metrics.js';
import { sanitiseAllocation, pointsSpent } from '../model/talents.js';
import {
  genericSigils, utilitySigils, ancientSigils, sigilConditionOptions, SELF_CONDITIONS, DEFAULT_CONDITION,
} from '../model/sigils.js';
import { glyphSocketable, activeMajorGlyphs, emptyMountSockets, MOUNT_GLYPH_SOCKETS } from '../model/mounts.js';
import { glyphTypeInfo, glyphStatLabel, GLYPH_TIERS } from '../model/glyphs.js';
import { PRESET_SIGIL_CAP } from '../model/presets.js';
import {
  relicSlotCap, talentPointsForLevel, sigilSlotCap, sigilsUnlocked, dualEquipUnlocked, dualTalentsUnlocked,
  mountsUnlocked, conditionsUnlocked, resolveTranscendencePreset, ancientActive, UNLOCK_LEVELS,
} from '../model/legality.js';
import { applyCandidate, candidateWrites } from './patch.js';
import { subsetsUpTo } from './combinatorics.js';

/** Search blocks in their fixed order (A.3). */
export const BLOCKS = Object.freeze([
  'spec', 'equipmentSet', 'sigils', 'utility', 'ancient', 'conditions', 'relics', 'pet', 'mount',
  'transcendence', 'minorGlyphs', 'majorGlyphs', 'talents',
]);

/** Block toggles (all on by default). */
export const SPACE_DEFAULTS = Object.freeze(Object.fromEntries(BLOCKS.map((b) => [b, true])));

/** What a block writes (data-model.md §2). */
export const BLOCK_SCOPE = Object.freeze({
  spec: 'preset', equipmentSet: 'preset', sigils: 'preset', utility: 'preset', ancient: 'preset',
  conditions: 'character', relics: 'preset', pet: 'preset', mount: 'preset', transcendence: 'preset',
  minorGlyphs: 'mount', majorGlyphs: 'mount', talents: 'character',
});

export { candidateWrites as candidatePatch };

const byString = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniq = (list) => [...new Set((list ?? []).filter((x) => typeof x === 'string' && x))];
const LEVEL = (character) => (Number.isFinite(character?.level) ? character.level : 100);

function presetOf(character, presetOrId) {
  const id = typeof presetOrId === 'string' ? presetOrId : presetOrId?.id;
  const p = (character.presets ?? []).find((x) => x.id === id);
  if (!p) throw new Error(`Unknown preset ${id}`);
  return p;
}

/** Kept entries in saved order, then the new ones sorted. */
function arrangeList(saved, desired) {
  const want = new Set(desired);
  const kept = (saved ?? []).filter((x) => want.has(x));
  const keptSet = new Set(kept);
  return [...kept, ...[...want].filter((x) => !keptSet.has(x)).sort(byString)];
}

/** Saved glyphs stay in their saved sockets; new ones fill the free sockets left to right, sorted. */
function arrangeRow(savedRow, desired, size) {
  const want = new Set(desired);
  const row = Array.from({ length: size }, (_, i) => (want.has(savedRow?.[i]) ? savedRow[i] : null));
  const placed = new Set(row.filter(Boolean));
  const added = [...want].filter((x) => !placed.has(x)).sort(byString);
  for (let i = 0; i < size && added.length; i++) if (row[i] == null) row[i] = added.shift();
  return row;
}

const allocEntries = (a) => Object.entries(a ?? {}).filter(([, r]) => r > 0).sort(([x], [y]) => byString(x, y));
const allocOf = (a) => Object.fromEntries(allocEntries(a));
/** Two talent allocations spend the same ranks (zero ranks and key order do not count). */
export const sameAlloc = (a, b) => JSON.stringify(allocEntries(a)) === JSON.stringify(allocEntries(b));

/** Saved sockets of a mount (empty sockets for an unknown mount). */
export function savedSockets(character, mountId) {
  return (character.mounts ?? []).find((m) => m.id === mountId)?.glyphs ?? emptyMountSockets();
}

/** The board a candidate stands for (a transcendence preset object, or null). */
export function boardOf(character, cand) {
  return resolveTranscendencePreset(character, { transcendencePresetId: cand.transcendencePresetId ?? null });
}

/** The character-wide condition of a sigil (ON_COOLDOWN when none is stored). */
export const storedCondition = (character, sp) => character.sigils?.owned?.[sp]?.condition ?? DEFAULT_CONDITION;

/** The condition a candidate gives an equipped sigil: its override, else the character-wide value. */
export const conditionOf = (character, cand, sp) => cand.sigilConditions?.[sp] ?? storedCondition(character, sp);

/** Every species the candidate equips (generic, utility, Ancient). */
export const equippedOf = (cand) => [...cand.sigilSpecies, cand.utilitySigilSpecies, cand.ancientSigilSpecies].filter(Boolean);

/** The candidate's effective sockets on its mount. */
export const socketsOf = (character, cand) => (cand.mountId ? cand.mountGlyphs ?? savedSockets(character, cand.mountId) : null);

/** The candidate that reproduces the saved preset exactly. */
export function candidateOf(character, presetOrId) {
  const p = presetOf(character, presetOrId);
  return {
    equipmentSet: p.equipmentSet === 2 ? 2 : 1,
    talentSet: p.talentSet === 1 ? 1 : 0,
    talentAllocation: null,
    petId: p.petId ?? null,
    mountId: p.mountId ?? null,
    mountGlyphs: null,
    relicIds: [...(p.relicIds ?? [])],
    sigilSpecies: [...(p.sigilSpecies ?? [])],
    utilitySigilSpecies: p.utilitySigilSpecies ?? null,
    ancientSigilSpecies: p.ancientSigilSpecies ?? null,
    transcendencePresetId: resolveTranscendencePreset(character, p)?.id ?? null,
    sigilConditions: {},
  };
}

/**
 * The canonical form of a candidate relative to the saved preset (see the header). Pure form, no
 * legality: an illegal choice stays illegal (search/legality.js reports it).
 */
export function canonical(character, presetOrId, cand) {
  const p = presetOf(character, presetOrId);
  const talentSet = cand.talentSet === 1 ? 1 : 0;
  const savedAlloc = character.talentSets?.[talentSet]?.allocation ?? {};
  const talentAllocation = cand.talentAllocation && !sameAlloc(cand.talentAllocation, savedAlloc) ? allocOf(cand.talentAllocation) : null;
  const mountId = cand.mountId ?? null;
  let mountGlyphs = null;
  if (mountId && cand.mountGlyphs) {
    const saved = savedSockets(character, mountId);
    const rows = {};
    let same = true;
    for (const tier of GLYPH_TIERS) {
      const want = uniq(cand.mountGlyphs[tier]);
      const have = uniq(saved[tier]);
      if (want.length !== have.length || want.some((id) => !have.includes(id))) same = false;
      rows[tier] = arrangeRow(saved[tier], want, MOUNT_GLYPH_SOCKETS[tier]);
    }
    mountGlyphs = same ? null : rows;
  }
  const out = {
    equipmentSet: cand.equipmentSet === 2 ? 2 : 1,
    talentSet,
    talentAllocation,
    petId: cand.petId ?? null,
    mountId,
    mountGlyphs,
    relicIds: arrangeList(p.relicIds, uniq(cand.relicIds)),
    sigilSpecies: arrangeList(p.sigilSpecies, uniq(cand.sigilSpecies)),
    utilitySigilSpecies: cand.utilitySigilSpecies ?? null,
    ancientSigilSpecies: cand.ancientSigilSpecies ?? null,
    transcendencePresetId: boardOf(character, cand)?.id ?? null,
    sigilConditions: {},
  };
  const equipped = new Set(equippedOf(out));
  for (const sp of Object.keys(cand.sigilConditions ?? {}).sort(byString)) {
    const v = cand.sigilConditions[sp] || DEFAULT_CONDITION;
    if (equipped.has(sp) && v !== storedCondition(character, sp)) out.sigilConditions[sp] = v;
  }
  return out;
}

/** The character the candidate stands for: search/patch.js applyCandidate with every scope. */
export function materialise(character, presetOrId, cand) {
  return applyCandidate(character, presetOf(character, presetOrId).id, cand);
}

/**
 * Major glyph ids on a socket row that act for this spec and these running sigils: model/mounts.js
 * activeMajorGlyphs (class, requiredSpec, sigil equipped, one per glyph type keeping the highest
 * rarity), mapped back to the first socketed instance of each active entry.
 */
export function activeMajorIds(character, majorRow, spec, running) {
  const mount = { glyphs: { minor: [], major: majorRow ?? [], mythic: [] } };
  const byId = new Map((character.glyphs ?? []).map((g) => [g.id, g]));
  const out = new Set();
  for (const a of activeMajorGlyphs(character, mount, spec, running).active) {
    const id = (majorRow ?? []).find((x) => x && byId.get(x)?.glyphType === a.glyphType && byId.get(x)?.rarity === a.rarity);
    if (id) out.add(id);
  }
  return out;
}

/**
 * The sigils the Fighter runs for a candidate: owned, usable on the spec, and the Ancient only while the
 * candidate's board allocates its node (Q3 strict, sigils.md §9).
 */
export function runningSigils(character, cand) {
  const spec = character.talentSets?.[cand.talentSet]?.spec ?? null;
  const own = character.sigils?.owned ?? {};
  const out = cand.sigilSpecies.filter((sp) => own[sp]);
  if (cand.utilitySigilSpecies && own[cand.utilitySigilSpecies]) out.push(cand.utilitySigilSpecies);
  const anc = cand.ancientSigilSpecies;
  if (anc && own[anc] && isSigilSpeciesActiveForSpec(anc, character.class, spec) && ancientActive(anc, boardOf(character, cand))) out.push(anc);
  return out;
}

/** Condition options a search mode explores (#51 #62): PVP every option; PVE only the self (MY_HP_BELOW) ones. */
export function conditionOptionsFor(species, spec, mode) {
  const all = sigilConditionOptions(species, spec);
  return mode === 'pvp' ? all : all.filter((o) => o === DEFAULT_CONDITION || SELF_CONDITIONS.includes(o));
}

/**
 * The search space of one preset.
 * @param {Object} character  a normalised v2 Character
 * @param {Object|string} presetOrId
 * @param {{realm?: 'base'|'oblivion', mode?: 'pve'|'pvp', residual?: Object, toggles?: Object}} [o]
 *   `mode` follows the target (`target.kind === 'pvp'`); `residual` is the preset's sheet residual
 *   (build/residual.js), added to every candidate's computed stats
 */
export function createBuildSpace(character, presetOrId, { realm = 'base', mode = 'pve', residual = {}, toggles } = {}) {
  const preset = presetOf(character, presetOrId);
  const presetId = preset.id;
  const on = { ...SPACE_DEFAULTS };
  for (const b of BLOCKS) if (toggles && b in toggles) on[b] = !!toggles[b];
  const cls = character.class;
  const L = LEVEL(character);
  const slots = cls && sigilsUnlocked(L, cls) ? Math.min(PRESET_SIGIL_CAP, sigilSlotCap(L, cls)) : 0;
  const relicCap = relicSlotCap(L, character.extraRelicSlots);
  const talentCap = talentPointsForLevel(L);
  const owned = character.sigils?.owned ?? {};
  const glyphById = new Map((character.glyphs ?? []).map((g) => [g.id, g]));
  const mountIds = new Set((character.mounts ?? []).map((m) => m.id));
  const petIds = new Set((character.pets?.owned ?? []).map((p) => p.id));
  const boardIds = (character.transcendence?.presets ?? []).map((p) => p.id);
  const classRelics = new Set(relicsForClass(cls).map((r) => r.id));

  const canon = (c) => canonical(character, preset, c);
  const key = (c) => stableStringify(canon(c));
  const specOf = (c) => character.talentSets?.[c.talentSet === 1 ? 1 : 0]?.spec ?? null;
  const allocOfCand = (c) => c.talentAllocation ?? character.talentSets?.[c.talentSet]?.allocation ?? {};

  /**
   * The nearest legal candidate after a change: the repairs model reconcile would make (picks owned and
   * usable on the spec, slot caps, the Ancient on its board) plus the search's own: conditions valid for
   * the spec, and changed major glyphs that would be inert are taken back out (#47 #50 #55).
   */
  function legalise(c0) {
    const c = canon(c0);
    const spec = specOf(c);
    if (c.talentAllocation) {
      const clean = sanitiseAllocation(c.talentAllocation, spec, talentCap);
      c.talentAllocation = sameAlloc(clean, character.talentSets?.[c.talentSet]?.allocation) ? null : allocOf(clean);
    }
    const generic = new Set(genericSigils(cls, spec).map((s) => s.species));
    const utility = new Set(utilitySigils(cls, spec).map((s) => s.species));
    const ancient = new Set(ancientSigils(cls).map((s) => s.species));
    c.sigilSpecies = c.sigilSpecies.filter((sp) => owned[sp] && generic.has(sp)).slice(0, slots);
    if (!(slots > 0 && owned[c.utilitySigilSpecies] && utility.has(c.utilitySigilSpecies))) c.utilitySigilSpecies = null;
    if (!boardIds.includes(c.transcendencePresetId)) c.transcendencePresetId = boardOf(character, { transcendencePresetId: null })?.id ?? null;
    const anc = c.ancientSigilSpecies;
    if (!(slots > 0 && owned[anc] && ancient.has(anc) && isSigilSpeciesActiveForSpec(anc, cls, spec) && ancientActive(anc, boardOf(character, c)))) {
      c.ancientSigilSpecies = null;
    }
    c.relicIds = c.relicIds.filter((id) => classRelics.has(id) && character.relics?.[id] > 0).slice(0, relicCap);
    if (c.petId && !petIds.has(c.petId)) c.petId = null;
    if (c.mountId && !(mountIds.has(c.mountId) && mountsUnlocked(L))) {
      c.mountId = null;
      c.mountGlyphs = null;
    }
    // conditions (sigils.md §7): only from level 54, and only options the spec offers
    const conds = {};
    for (const sp of equippedOf(c)) {
      const over = c.sigilConditions[sp];
      if (!conditionsUnlocked(L)) {
        if (over === DEFAULT_CONDITION) conds[sp] = over;
        continue;
      }
      const v = over ?? storedCondition(character, sp);
      if (v !== DEFAULT_CONDITION && !sigilConditionOptions(sp, spec).includes(v)) conds[sp] = DEFAULT_CONDITION;
      else if (over) conds[sp] = over;
    }
    c.sigilConditions = conds;
    if (c.mountId && c.mountGlyphs) {
      const saved = savedSockets(character, c.mountId);
      const rows = {};
      const used = new Set();
      for (const tier of GLYPH_TIERS) {
        rows[tier] = c.mountGlyphs[tier].map((id) => {
          if (!id || used.has(id) || !glyphSocketable(character, glyphById.get(id), tier)) return null;
          used.add(id);
          return id;
        });
      }
      const live = activeMajorIds(character, rows.major, spec, runningSigils(character, c));
      const savedMajor = saved.major ?? [];
      const dropped = rows.major.filter((id) => id && !savedMajor.includes(id) && !live.has(id));
      if (dropped.length) {
        const back = savedMajor.filter((id) => id && !rows.major.includes(id) && glyphSocketable(character, glyphById.get(id), 'major'));
        const keep = rows.major.filter((id) => id && !dropped.includes(id));
        rows.major = [...keep, ...back.slice(0, dropped.length)];
      }
      c.mountGlyphs = rows;
    }
    return canon(c);
  }

  /** Distinct canonical values (by key), without `c`'s own. */
  const distinct = (c, list) => {
    const seen = new Set([key(c)]);
    const out = [];
    for (const x of list) {
      const k = key(x);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  };

  // --- block domains --------------------------------------------------------------------------
  const domains = {
    // Compound: the switch plus its legality bundle; the inner ascent over the spec's picks is the driver's.
    spec(c) {
      const other = c.talentSet === 1 ? 0 : 1;
      if (!dualTalentsUnlocked(L) || !character.talentSets?.[other]?.spec) return [];
      return [legalise({ ...c, talentSet: other, talentAllocation: null })];
    },
    equipmentSet(c) {
      if (realm === 'oblivion') return [];
      return (dualEquipUnlocked(L) ? [1, 2] : [1]).map((equipmentSet) => legalise({ ...c, equipmentSet }));
    },
    sigils(c) {
      if (slots === 0) return [];
      const spec = specOf(c);
      const pool = genericSigils(cls, spec).map((s) => s.species).filter((sp) => owned[sp]);
      return subsetsUpTo(pool, slots).map((sigilSpecies) => legalise({ ...c, sigilSpecies }));
    },
    utility(c) {
      if (slots === 0) return [];
      const pool = utilitySigils(cls, specOf(c)).map((s) => s.species).filter((sp) => owned[sp]);
      return [null, ...pool].map((utilitySigilSpecies) => legalise({ ...c, utilitySigilSpecies }));
    },
    ancient(c) {
      if (slots === 0) return [];
      const spec = specOf(c);
      const board = boardOf(character, c);
      const pool = ancientSigils(cls).map((s) => s.species)
        .filter((sp) => owned[sp] && isSigilSpeciesActiveForSpec(sp, cls, spec) && ancientActive(sp, board));
      return [null, ...pool].map((ancientSigilSpecies) => legalise({ ...c, ancientSigilSpecies }));
    },
    conditions(c) {
      if (!conditionsUnlocked(L)) return [];
      const spec = specOf(c);
      const species = runningSigils(character, c);
      let combos = [{}];
      for (const sp of species) {
        const cur = conditionOf(character, c, sp);
        const opts = [...new Set([cur, ...conditionOptionsFor(sp, spec, mode)])];
        combos = combos.flatMap((o) => opts.map((v) => ({ ...o, [sp]: v })));
      }
      return combos.map((sigilConditions) => legalise({ ...c, sigilConditions }));
    },
    relics(c) {
      if (relicCap === 0) return [];
      const pool = relicsForClass(cls).map((r) => r.id).filter((id) => character.relics?.[id] > 0);
      return subsetsUpTo(pool, relicCap).map((relicIds) => legalise({ ...c, relicIds }));
    },
    pet(c) {
      return [null, ...petIds].map((petId) => legalise({ ...c, petId }));
    },
    // Compound: each mount with its saved sockets; the inner socket ascent is the driver's.
    mount(c) {
      return [null, ...(mountsUnlocked(L) ? mountIds : [])].map((mountId) => legalise({ ...c, mountId, mountGlyphs: null }));
    },
    transcendence(c) {
      if (L < UNLOCK_LEVELS.TRANSCENDENCE_PRESETS) return []; // linking needs level 58 (transcendence.md §9)
      return boardIds.map((transcendencePresetId) => legalise({ ...c, transcendencePresetId }));
    },
    minorGlyphs(c) {
      const cur = socketsOf(character, c);
      if (!cur) return [];
      // every unsealed instance (identical twins included, #58); one without a secondary adds nothing,
      // so it is only kept where it already sits
      const pool = (character.glyphs ?? [])
        .filter((g) => glyphSocketable(character, g, 'minor') && (g.secondary || cur.minor.includes(g.id)))
        .map((g) => g.id).filter((id) => !cur.major.includes(id) && !cur.mythic.includes(id));
      return subsetsUpTo(pool, MOUNT_GLYPH_SOCKETS.minor).map((set) => legalise({ ...c, mountGlyphs: { ...cur, minor: set } }));
    },
    majorGlyphs(c) {
      const cur = socketsOf(character, c);
      if (!cur) return [];
      const spec = specOf(c);
      const running = runningSigils(character, c);
      // a major acts only for its class and spec while its sigil runs (#47); the current ones stay choosable
      const pool = (character.glyphs ?? [])
        .filter((g) => glyphSocketable(character, g, 'major') && (cur.major.includes(g.id) || activeMajorIds(character, [g.id], spec, running).size))
        .map((g) => g.id).filter((id) => !cur.minor.includes(id) && !cur.mythic.includes(id));
      const typeOf = (id) => glyphById.get(id)?.glyphType;
      return subsetsUpTo(pool, MOUNT_GLYPH_SOCKETS.major)
        .filter((set) => new Set(set.map(typeOf)).size === set.length) // two of a type never stack (mounts-glyphs.md §10)
        .map((set) => legalise({ ...c, mountGlyphs: { ...cur, major: set } }));
    },
    talents(c) {
      return talentMoves(c).map((talentAllocation) => legalise({ ...c, talentAllocation }));
    },
  };

  /**
   * Local talent moves on the candidate's set (A.7): +1, -1, move 1 or k points between two talents,
   * and every redistribution of one tier's points within that tier. Capped by the level's points (#48);
   * a move that breaks a tier threshold is dropped.
   */
  function talentMoves(c) {
    const specKey = specOf(c);
    const spec = talentSpec(specKey);
    if (!spec || talentCap === 0) return [];
    const alloc = allocOf(allocOfCand(c));
    const spent = pointsSpent(alloc);
    const talents = spec.tiers.flatMap((t) => t.talents);
    const out = [];
    const push = (next, expect) => {
      const clean = sanitiseAllocation(next, specKey, talentCap);
      if (pointsSpent(clean) === expect) out.push(clean);
    };
    const rank = (id) => alloc[id] || 0;
    for (const t of talents) {
      if (spent < talentCap && rank(t.id) < t.maxRank) push({ ...alloc, [t.id]: rank(t.id) + 1 }, spent + 1);
      if (rank(t.id) > 0) push({ ...alloc, [t.id]: rank(t.id) - 1 }, spent - 1);
    }
    for (const from of talents) {
      for (const to of talents) {
        if (from.id === to.id) continue;
        const most = Math.min(rank(from.id), to.maxRank - rank(to.id));
        for (let k = 1; k <= most; k++) push({ ...alloc, [from.id]: rank(from.id) - k, [to.id]: rank(to.id) + k }, spent);
      }
    }
    for (const tier of spec.tiers) {
      const points = tier.talents.reduce((s, t) => s + rank(t.id), 0);
      if (points === 0) continue;
      const fill = (i, left, acc) => {
        if (i === tier.talents.length) {
          if (left === 0) push({ ...alloc, ...acc }, spent);
          return;
        }
        const t = tier.talents[i];
        for (let r = Math.min(t.maxRank, left); r >= 0; r--) fill(i + 1, left - r, { ...acc, [t.id]: r });
      };
      fill(0, points, {});
    }
    return out;
  }

  const blocks = BLOCKS.map((id) => ({
    id,
    enabled: on[id],
    scope: BLOCK_SCOPE[id],
    domain: (c) => (on[id] ? distinct(c, domains[id](canon(c))) : []),
  }));

  // --- fighter ----------------------------------------------------------------------------------
  /** The candidate's character with the sheets cleared: a candidate is computed, never a sheet. */
  const overlay = (c) => {
    const m = materialise(character, preset, c);
    return {
      ...m,
      presets: m.presets.map((p) => (p.id === presetId ? { ...p, sheet: null } : p)),
      oblivion: { ...m.oblivion, sheet: null },
    };
  };
  const fighterOf = (c) => {
    const f = buildFighter(overlay(c), presetId, { realm });
    f.stats = applyResidual(f.stats, residual);
    f.source = 'computed';
    return f;
  };
  const describeArgs = (c) => {
    const m = overlay(c);
    return [m, m.presets.find((p) => p.id === presetId), { realm }];
  };

  return {
    character,
    preset,
    presetId,
    realm,
    mode,
    toggles: on,
    start: candidateOf(character, preset),
    blocks,
    key,
    canonical: canon,
    legalise,
    specOf,
    fighterOf,
    describeArgs,
    /** Per enabled block, the number of values (the current one included) given `c`. */
    domainSizes: (c) => Object.fromEntries(blocks.filter((b) => b.enabled).map((b) => [b.id, b.domain(c).length + 1])),
  };
}

/** A relic's name (labels for changes). */
export const relicName = (id) => relicById(id)?.name ?? id;
/** A glyph instance's label. */
export const glyphLabel = (character, id) => {
  const g = (character.glyphs ?? []).find((x) => x.id === id);
  if (!g) return 'Empty';
  const name = glyphTypeInfo(g.glyphType)?.name ?? g.glyphType;
  return g.secondary ? `${name} (${g.rarity}, ${glyphStatLabel(g.secondary.stat)})` : `${name} (${g.rarity})`;
};
