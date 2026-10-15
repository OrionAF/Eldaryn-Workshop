// search/space.js (A2): what a searchable build is and every legal value of each search block
// (redesign plan A.3). It replaced the retired search/candidates.js.
//
// The Candidate shape, its canonical form and the block domains are specified in
// docs/Reference/simulation.md §Build space. Merging engine-identical values is search/effect.js.
import { buildFighter } from '../build/fighter.js';
import { applyResidual } from '../build/residual.js';
import { presetPower } from '../build/power.js';
import { relicsForClass, relicById } from '../game/relics.js';
import { isSigilSpeciesActiveForSpec } from '../game/sigils.js';
import { talentSpec } from '../game/talents.js';
import { stableStringify } from '../engine/metrics.js';
import { sanitiseAllocation, pointsSpent } from '../model/talents.js';
import {
  genericSigils, utilitySigils, ancientSigils, sigilConditionOptions, SELF_CONDITIONS, DEFAULT_CONDITION,
} from '../model/sigils.js';
import { glyphSocketable, activeMajorGlyphs, emptyMountSockets, mountEffectiveStats, MOUNT_GLYPH_SOCKETS } from '../model/mounts.js';
import { glyphText } from '../build/statText.js';
import { glyphTypeInfo, glyphSecondaryValue, GLYPH_TIERS, GLYPH_RARITY_LADDER } from '../model/glyphs.js';
import { PRESET_SIGIL_CAP } from '../model/presets.js';
import {
  relicSlotCap, talentPointsForLevel, sigilSlotCap, sigilsUnlocked, dualEquipUnlocked, dualTalentsUnlocked,
  mountsUnlocked, conditionsUnlocked, resolveTranscendencePreset, effectiveTranscendencePreset, ancientActive, UNLOCK_LEVELS,
} from '../model/legality.js';
import { applyCandidate, candidateWrites } from './patch.js';
import { subsetsUpTo } from './combinatorics.js';
import { engineView, paretoFilter } from './dominance.js';
import { EngineInputError } from '../engine/validate.js';

/** Search blocks in their fixed order (A.3). */
export const BLOCKS = Object.freeze([
  'spec', 'equipmentSet', 'sigils', 'utility', 'ancient', 'conditions', 'relics', 'pet', 'mount',
  'transcendence', 'minorGlyphs', 'majorGlyphs', 'talents',
]);

/** Blocks whose values the stat-dominance filter prunes (simulation.md §Build space, Dominance). */
export const DOMINANCE_BLOCKS = Object.freeze(['sigils', 'utility', 'conditions', 'relics', 'pet', 'talents']);

/** The part of a candidate a block changes (what a pruned entry names). */
const BLOCK_VALUE = {
  sigils: (c) => c.sigilSpecies, utility: (c) => c.utilitySigilSpecies, conditions: (c) => c.sigilConditions,
  relics: (c) => c.relicIds, pet: (c) => c.petId, talents: (c) => c.talentAllocation,
};

/** No dominance assumption: every stat compared, no damage-only projection (search/dominance.js dominanceContextOf). */
const NO_DOMINANCE_CONTEXT = Object.freeze({ harmless: false, fortressMaxDamage: null, otherThorns: null });

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

const cmpKeys = (a, b) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return 0;
};

/**
 * The minor-glyph rows worth trying (glyph dominance, simulation.md Build space / Blocks). Usable glyphs are the
 * unsealed minors with a rolled secondary. Per stat they are ordered by value, best first (of equal values the
 * socketed one, else the lowest id: twins are interchangeable and never swapped); a row takes the top m of a
 * stat. Rows are full: min(sockets, usable) glyphs, split over the stats in every way.
 * @returns {string[][]} id sets (the current row's own set may be among them; callers drop it by key)
 */
export function minorRowsFor(character, cur) {
  const byStat = new Map();
  for (const g of character.glyphs ?? []) {
    if (!g.secondary || !glyphSocketable(character, g, 'minor') || cur.major.includes(g.id) || cur.mythic.includes(g.id)) continue;
    if (!byStat.has(g.secondary.stat)) byStat.set(g.secondary.stat, []);
    byStat.get(g.secondary.stat).push({ id: g.id, value: glyphSecondaryValue(g.secondary) });
  }
  const socketed = (id) => (cur.minor.includes(id) ? 0 : 1);
  const lists = [...byStat.entries()].sort(([a], [b]) => byString(a, b)).map(([, list]) => list
    .sort((x, y) => y.value - x.value || socketed(x.id) - socketed(y.id) || byString(x.id, y.id))
    .map((x) => x.id));
  const size = Math.min(MOUNT_GLYPH_SOCKETS.minor, lists.reduce((n, l) => n + l.length, 0));
  if (size === 0) return [];
  const rows = [];
  const pick = [];
  const go = (i, left) => {
    if (left === 0) {
      rows.push([...pick]);
      return;
    }
    if (i === lists.length) return;
    for (let m = Math.min(left, lists[i].length); m >= 0; m--) {
      for (let k = 0; k < m; k++) pick.push(lists[i][k]);
      go(i + 1, left - m);
      pick.length -= m;
    }
  };
  go(0, size);
  return rows;
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

/** The board a candidate's stats run on: boardOf with the level gates applied, as the build does. */
export function runningBoardOf(character, cand) {
  return effectiveTranscendencePreset(character, { transcendencePresetId: cand.transcendencePresetId ?? null });
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
  if (anc && own[anc] && isSigilSpeciesActiveForSpec(anc, character.class, spec) && ancientActive(anc, runningBoardOf(character, cand))) out.push(anc);
  return out;
}

/** Condition options a search mode explores (#51 #62): PVP every option; PVE and the Fortress boss only the self (MY_HP_BELOW) ones. */
export function conditionOptionsFor(species, spec, mode) {
  const all = sigilConditionOptions(species, spec);
  return mode === 'pvp' ? all : all.filter((o) => o === DEFAULT_CONDITION || SELF_CONDITIONS.includes(o));
}

/**
 * The search space of one preset.
 * @param {Object} character  a normalised v2 Character
 * @param {Object|string} presetOrId
 * @param {{realm?: 'base'|'oblivion', mode?: 'pve'|'pvp'|'fortress', residual?: Object, toggles?: Object, powerFloor?: number|null,
 *   dominance?: Object}} [o]
 *   `mode` follows the target (`target.kind === 'pvp'`); `residual` is the preset's sheet residual
 *   (build/residual.js), added to every candidate's computed stats; `powerFloor` is the Combat Power
 *   guard (simulation.md §Build space): a candidate below it is not admissible; `dominance` is the target's
 *   dominance context (search/dominance.js dominanceContextOf), default: no target assumption
 */
export function createBuildSpace(character, presetOrId, {
  realm = 'base', mode = 'pve', residual = {}, toggles, powerFloor = null, dominance = NO_DOMINANCE_CONTEXT,
} = {}) {
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
  const mountStats = new Map((character.mounts ?? []).map((m) => [m.id, mountEffectiveStats(m)]));
  const petIds = new Set((character.pets?.owned ?? []).map((p) => p.id));
  const boardIds = (character.transcendence?.presets ?? []).map((p) => p.id);
  const classRelics = new Set(relicsForClass(cls).map((r) => r.id));

  const canon = (c) => canonical(character, preset, c);
  const key = (c) => stableStringify(canon(c));
  const floor = normalisePowerFloor(powerFloor);
  const powerMemo = new Map();
  /** Combat Power of the candidate's build (build/power.js), memoised by canonical key. */
  const powerOf = (c) => {
    const k = key(c);
    if (!powerMemo.has(k)) powerMemo.set(k, presetPower(materialise(character, preset, canon(c)), presetId, { realm }).power);
    return powerMemo.get(k);
  };
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
    if (!(slots > 0 && owned[anc] && ancient.has(anc) && isSigilSpeciesActiveForSpec(anc, cls, spec) && ancientActive(anc, runningBoardOf(character, c)))) {
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

  // --- mount dominance (simulation.md Build space / Blocks) -------------------------------------
  /**
   * Owned mounts a rival matches or beats on both effective attack and HP (mounts-glyphs.md §1, §5): every mount
   * has the same sockets, so a dominated one can never improve an objective. Of equal twins the current mount,
   * else the first owned, is kept. The candidate's own mount is kept as the baseline by `distinct`, not here.
   * @returns {Map<string, string>} dominated mount id -> id of the mount that dominates it
   */
  const dominatedMounts = (currentId) => {
    const ids = [...mountIds];
    const ge = (a, b) => a.attackPercent >= b.attackPercent && a.hpPercent >= b.hpPercent;
    const rank = (id) => (id === currentId ? -1 : ids.indexOf(id)); // equal twins: lowest rank is kept
    const out = new Map();
    for (const id of ids) {
      const me = mountStats.get(id);
      const by = ids.find((o) => {
        if (o === id) return false;
        const rv = mountStats.get(o);
        if (!ge(rv, me)) return false;
        return !ge(me, rv) || rank(o) < rank(id); // strictly better, or an equal twin that is kept
      });
      if (by) out.set(id, by);
    }
    return out;
  };
  const mountsToTry = (currentId) => {
    const dom = dominatedMounts(currentId);
    return [...mountIds].filter((id) => !dom.has(id));
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
      const board = runningBoardOf(character, c);
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
      // full sets only: every relic bonus is a positive stat (Game/relics.md §2, §7), so a free slot never beats one more relic
      const full = Math.min(relicCap, pool.length);
      return subsetsUpTo(pool, full).filter((s) => s.length === full).map((relicIds) => legalise({ ...c, relicIds }));
    },
    pet(c) {
      // never "no pet" while one is owned: a pet adds positive flat Attack and HP and has no ability (Game/pets.md §4)
      return (petIds.size ? [...petIds] : [null]).map((petId) => legalise({ ...c, petId }));
    },
    // Compound: each non-dominated mount with its saved sockets; the inner socket ascent is the driver's.
    mount(c) {
      return [null, ...(mountsUnlocked(L) ? mountsToTry(c.mountId) : [])].map((mountId) => legalise({ ...c, mountId, mountGlyphs: null }));
    },
    transcendence(c) {
      if (L < UNLOCK_LEVELS.TRANSCENDENCE_PRESETS) return []; // linking needs level 58 (transcendence.md §9)
      return boardIds.map((transcendencePresetId) => legalise({ ...c, transcendencePresetId }));
    },
    minorGlyphs(c) {
      const cur = socketsOf(character, c);
      if (!cur) return [];
      // glyph dominance (simulation.md Build space / Blocks): per stat the top m by value, full rows only
      return minorRowsFor(character, cur).map((set) => legalise({ ...c, mountGlyphs: { ...cur, minor: set } }));
    },
    majorGlyphs(c) {
      const cur = socketsOf(character, c);
      if (!cur) return [];
      const spec = specOf(c);
      const running = runningSigils(character, c);
      // a major acts only for its class and spec while its sigil runs (#47); the current ones stay choosable
      const live = (character.glyphs ?? [])
        .filter((g) => glyphSocketable(character, g, 'major') && (cur.major.includes(g.id) || activeMajorIds(character, [g.id], spec, running).size))
        .filter((g) => !cur.minor.includes(g.id) && !cur.mythic.includes(g.id));
      // glyph dominance: per type only the best instance (highest rarity; of equals the socketed one, else the
      // lowest id), because two of a type never stack (mounts-glyphs.md §10)
      const best = new Map();
      const order = (g) => [-GLYPH_RARITY_LADDER.indexOf(g.rarity), cur.major.includes(g.id) ? 0 : 1, g.id];
      for (const g of live) {
        const b = best.get(g.glyphType);
        if (!b || cmpKeys(order(g), order(b)) < 0) best.set(g.glyphType, g);
      }
      const pool = [...best.values()].map((g) => g.id).sort(byString);
      return subsetsUpTo(pool, MOUNT_GLYPH_SOCKETS.major).map((set) => legalise({ ...c, mountGlyphs: { ...cur, major: set } }));
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

  // --- stat dominance (simulation.md Build space / Dominance) -------------------------------------
  const viewMemo = new Map();
  /** The engine's view of a candidate (search/dominance.js engineView), null when it cannot fight. */
  const viewOf = (c) => {
    const k = key(c);
    if (!viewMemo.has(k)) {
      let v = null;
      try {
        v = engineView(fighterOf(c), mode);
      } catch (e) {
        if (!(e instanceof EngineInputError)) throw e;
      }
      viewMemo.set(k, v);
    }
    return viewMemo.get(k);
  };
  const domainMemo = new Map();
  /** A block's values for `c` after the dominance filter, and what it dropped: {values, pruned}. */
  const visit = (id, c) => {
    const mk = `${id}|${key(c)}`;
    if (!domainMemo.has(mk)) {
      const values = distinct(c, domains[id](canon(c)));
      if (!DOMINANCE_BLOCKS.includes(id) || values.length === 0) domainMemo.set(mk, { values, pruned: [] });
      else {
        // an illegal incumbent (a saved preset legality would repair) dominates nothing
        const incumbent = key(legalise(c)) === key(c) ? viewOf(c) : null;
        const { kept, pruned } = paretoFilter(values.map((v) => ({ value: v, view: viewOf(v) })), incumbent, dominance);
        const name = BLOCK_VALUE[id];
        domainMemo.set(mk, { values: kept, pruned: pruned.map((p) => ({ id: name(p.value), by: p.by ? name(p.by) : null, reason: 'dominated' })) });
      }
    }
    return domainMemo.get(mk);
  };

  const blocks = BLOCKS.map((id) => ({
    id,
    enabled: on[id],
    scope: BLOCK_SCOPE[id],
    domain: (c) => (on[id] ? visit(id, c).values : []),
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
    powerFloor: floor,
    powerOf,
    /** False only when a Combat Power floor is set and the candidate's Power is below it. */
    admissible: (c) => floor == null || powerOf(c) >= floor,
    /** Owned mounts the mount block never tries because another owned mount dominates them: [{id, by}]. */
    prunedMounts: (c) => {
      if (!(on.mount && mountsUnlocked(L))) return [];
      const cur = canon(c).mountId ?? null; // a dominated current mount stays the baseline, so it is not reported
      return [...dominatedMounts(cur)].filter(([id]) => id !== cur).map(([id, by]) => ({ id, by }));
    },
    /**
     * Values a block's visit at `c` never tries because another value of the visit, or `c` itself (`by: null`),
     * dominates them: [{id, by, reason: 'dominated'}], `id`/`by` the block's part of the candidate. Mounts:
     * prunedMounts' entries with the same reason.
     */
    pruned: (blockId, c) => {
      if (blockId === 'mount') {
        if (!(on.mount && mountsUnlocked(L))) return [];
        const cur = canon(c).mountId ?? null;
        return [...dominatedMounts(cur)].filter(([id]) => id !== cur).map(([id, by]) => ({ id, by, reason: 'dominated' }));
      }
      return on[blockId] && DOMINANCE_BLOCKS.includes(blockId) ? visit(blockId, c).pruned : [];
    },
    /** Per enabled block, the number of values (the current one included) given `c`. Mount stats do not depend on realm. */
    domainSizes: (c) => Object.fromEntries(blocks.filter((b) => b.enabled).map((b) => [b.id, b.domain(c).length + 1])),
  };
}

/** A Combat Power floor: a positive whole number, else null (no guard). */
export function normalisePowerFloor(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : null;
}

/** A relic's name (labels for changes). */
export const relicName = (id) => relicById(id)?.name ?? id;
/** A glyph instance's label: type, rarity and rolled stat (build/statText.js), 'Empty' for an empty socket. */
export const glyphLabel = (character, id) => glyphText(character, (character.glyphs ?? []).find((x) => x.id === id) ?? null);
