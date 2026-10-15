// search/effect.js (A2): the effect oracle (redesign plan A.5, invariant I2). Deterministic, no
// simulation: two builds are engine-identical when the engine reads exactly the same inputs.
//   engineKey(fighter, mode)     fingerprint of what the engine reads
//   changesOf(space, B, X)       atomic changes from baseline B to X, with scope and side effects
//   revert / addChange           move one change between two candidates
//   canonicalise(space, B, X)    revert every change that leaves the engine inputs unchanged
//   mergeByEngine(space, arms)   one arm per engineKey, the one with the fewest changes kept
//   writesOf(space, B, X)        the changes grouped as Apply review shows them (A.11)
import { metricKey } from '../engine/metrics.js';
import { preparePveFighter } from '../engine/pve/fight.js';
import { fighterDuelArgs } from '../engine/pvp/resolver.js';
import { sigilBySpecies } from '../game/sigils.js';
import { petDisplayName } from '../game/pets.js';
import { mountBySpecies } from '../game/mountsGlyphs.js';
import { specsForClass } from '../game/classes.js';
import { talentById } from '../game/talents.js';
import { DEFAULT_CONDITION } from '../model/sigils.js';
import { GLYPH_TIERS, MOUNT_GLYPH_SOCKETS } from '../model/glyphs.js';
import { EngineInputError } from '../engine/validate.js';
import { savedSockets, conditionOf, relicName, glyphLabel, sameAlloc } from './space.js';
import { legalityOf } from './legality.js';

// PVE casts DAMAGE and DEBUFF spells on cooldown whatever their condition (combat-pve.md §10.1), and a
// TRANSFORM never passes the cast check, so their stored condition is not an input there.
const PVE_UNCONDITIONED = new Set(['DAMAGE', 'DEBUFF', 'TRANSFORM']);

/**
 * Fingerprint of everything the engine reads for this fighter. PVE: `preparePveFighter(f).inputs` (E1:
 * `fresh()` reads only these), with conditions the PVE spell pass ignores left out, plus the Oblivion
 * power an Oblivion fight reads from the stats. PVP: `fighterDuelArgs(f)` (the resolver's arguments).
 * @param {import('../engine/types.js').Fighter} fighter
 * @param {'pve'|'pvp'} mode
 * @throws EngineInputError when the fighter cannot fight (engine/validate.js)
 */
export function engineKey(fighter, mode) {
  if (mode === 'pvp') return metricKey('engine-pvp', fighterDuelArgs(fighter));
  const { inputs } = preparePveFighter(fighter);
  const spells = inputs.spells.map((s) => {
    const { activationCondition, ...rest } = s;
    return PVE_UNCONDITIONED.has(s.spell?.spellType) ? rest : { ...rest, activationCondition: activationCondition ?? DEFAULT_CONDITION };
  });
  const oblivionPower = fighter.realm === 'oblivion' ? Math.round(Number(fighter.stats?.totalOblivionPower) || 0) : null;
  return metricKey('engine-pve', { ...inputs, spells }, oblivionPower);
}

/** engineKey of a candidate, memoised per space and mode. */
const engineKeys = new WeakMap();
export function candidateEngineKey(space, cand, mode = space.mode) {
  if (!engineKeys.has(space)) engineKeys.set(space, new Map());
  const memo = engineKeys.get(space);
  const k = `${mode}|${space.key(cand)}`;
  if (!memo.has(k)) memo.set(k, engineKey(space.fighterOf(cand), mode));
  return memo.get(k);
}

// --- labels --------------------------------------------------------------------------------------
const NONE = 'None';
const sigilName = (sp) => (sp ? sigilBySpecies(sp)?.name ?? sp : NONE);
const listLabel = (list, name) => (list.length ? list.map(name).join(', ') : NONE);
function specLabel(character, set) {
  const spec = character.talentSets?.[set]?.spec ?? null;
  const name = spec ? specsForClass(character.class).find((s) => s.key === spec)?.name ?? spec : 'No spec';
  return `Set ${set + 1} (${name})`;
}
function allocLabel(alloc) {
  const parts = Object.entries(alloc ?? {}).filter(([, r]) => r > 0).map(([id, r]) => `${talentById(id)?.name ?? id} ${r}`);
  return parts.length ? parts.join(', ') : NONE;
}
const petLabel = (character, id) => {
  const pet = (character.pets?.owned ?? []).find((p) => p.id === id);
  return pet ? petDisplayName(pet.species, (character.pets?.altar?.tier ?? 1) >= 2) ?? pet.species : NONE;
};
const mountLabel = (character, id) => {
  const m = (character.mounts ?? []).find((x) => x.id === id);
  return m ? mountBySpecies(m.species)?.name ?? m.species : NONE;
};
const boardLabel = (character, id) => (character.transcendence?.presets ?? []).find((p) => p.id === id)?.name ?? NONE;

// --- changes ------------------------------------------------------------------------------------
const setEq = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const allocFor = (character, c, set) => (c.talentSet === set && c.talentAllocation ? c.talentAllocation : character.talentSets?.[set]?.allocation ?? {});
/** Sockets of mount `m` in candidate `c` (its saved sockets unless `c` rides `m` with an override). */
const socketsOn = (character, c, m) => (c.mountId === m && c.mountGlyphs ? c.mountGlyphs : savedSockets(character, m));

function otherPresets(space, test, reason) {
  return space.character.presets
    .filter((p) => p.id !== space.presetId && test(p))
    .map((p) => ({ presetId: p.id, name: p.name, reason }));
}

/**
 * Atomic changes from B to X (both candidates of `space`), in a stable order. Each is a Change of the
 * result contract (A.9) without its statistics: {id, dimension, label, from, to, scope, owner,
 * sideEffects, bundle}. `bundle` lists the changes legality forces along with it (`legalise(B + c)`).
 * @returns {Object[]}
 */
export function changesOf(space, B0, X0, { bundles = true } = {}) {
  const { character } = space;
  const B = space.canonical(B0);
  const X = space.canonical(X0);
  const out = [];
  const push = (id, dimension, label, from, to, scope, owner, sideEffects = []) => {
    out.push({ id, dimension, label, from, to, scope, owner, sideEffects, bundle: [] });
  };
  const presetOwner = { presetId: space.presetId };
  if (space.realm !== 'oblivion' && X.equipmentSet !== B.equipmentSet) {
    push('equipmentSet', 'equipmentSet', 'Gear set', `Set ${B.equipmentSet}`, `Set ${X.equipmentSet}`, 'preset', presetOwner);
  }
  if (X.talentSet !== B.talentSet) {
    push('spec', 'spec', 'Talent set', specLabel(character, B.talentSet), specLabel(character, X.talentSet), 'preset', presetOwner);
  }
  const sets = new Set([X.talentAllocation ? X.talentSet : null, B.talentAllocation ? B.talentSet : null].filter((s) => s != null));
  for (const set of [...sets].sort()) {
    const from = allocFor(character, B, set);
    const to = allocFor(character, X, set);
    if (sameAlloc(from, to)) continue;
    push(`talents:${set}`, 'talents', `Talents (set ${set + 1})`, allocLabel(from), allocLabel(to), 'character', { talentSet: set },
      otherPresets(space, (p) => (p.talentSet === 1 ? 1 : 0) === set, `also uses talent set ${set + 1}`));
  }
  if (X.petId !== B.petId) push('pet', 'pet', 'Pet', petLabel(character, B.petId), petLabel(character, X.petId), 'preset', presetOwner);
  if (X.mountId !== B.mountId) push('mount', 'mount', 'Mount', mountLabel(character, B.mountId), mountLabel(character, X.mountId), 'preset', presetOwner);
  if (!setEq(X.relicIds, B.relicIds)) {
    push('relics', 'relics', 'Relics', listLabel(B.relicIds, relicName), listLabel(X.relicIds, relicName), 'preset', presetOwner);
  }
  if (!setEq(X.sigilSpecies, B.sigilSpecies)) {
    push('sigils', 'sigils', 'Sigils', listLabel(B.sigilSpecies, sigilName), listLabel(X.sigilSpecies, sigilName), 'preset', presetOwner);
  }
  if (X.utilitySigilSpecies !== B.utilitySigilSpecies) {
    push('utility', 'utility', 'Utility sigil', sigilName(B.utilitySigilSpecies), sigilName(X.utilitySigilSpecies), 'preset', presetOwner);
  }
  if (X.ancientSigilSpecies !== B.ancientSigilSpecies) {
    push('ancient', 'ancient', 'Ancient sigil', sigilName(B.ancientSigilSpecies), sigilName(X.ancientSigilSpecies), 'preset', presetOwner);
  }
  if (X.transcendencePresetId !== B.transcendencePresetId) {
    push('transcendence', 'transcendence', 'Transcendence', boardLabel(character, B.transcendencePresetId), boardLabel(character, X.transcendencePresetId), 'preset', presetOwner);
  }
  // Conditions are character-wide (sigils.md §7): every other preset equipping the sigil changes too.
  const condSpecies = [...new Set([...Object.keys(B.sigilConditions), ...Object.keys(X.sigilConditions)])].sort();
  for (const sp of condSpecies) {
    const from = conditionOf(character, B, sp);
    const to = conditionOf(character, X, sp);
    if (from === to) continue;
    push(`condition:${sp}`, 'conditions', `${sigilName(sp)} condition`, from, to, 'character', { species: sp },
      otherPresets(space, (p) => [...(p.sigilSpecies ?? []), p.utilitySigilSpecies, p.ancientSigilSpecies].includes(sp), `also equips ${sigilName(sp)}`));
  }
  // Sockets are per mount: every other preset riding the mount changes too.
  if (X.mountId) {
    const m = X.mountId;
    const from = socketsOn(character, B, m);
    const to = socketsOn(character, X, m);
    for (const tier of GLYPH_TIERS) {
      for (let i = 0; i < MOUNT_GLYPH_SOCKETS[tier]; i++) {
        const a = from[tier]?.[i] ?? null;
        const b = to[tier]?.[i] ?? null;
        if (a === b) continue;
        push(`glyph:${m}:${tier}:${i}`, `${tier}Glyphs`, `${mountLabel(character, m)} ${tier} socket ${i + 1}`,
          glyphLabel(character, a), glyphLabel(character, b), 'mount', { mountId: m },
          otherPresets(space, (p) => p.mountId === m, `also rides ${mountLabel(character, m)}`));
      }
    }
  }
  if (bundles) {
    for (const c of out) {
      const alone = space.legalise(addChange(space, B, X, c));
      c.bundle = changesOf(space, B, alone, { bundles: false }).map((d) => d.id).filter((id) => id !== c.id);
    }
  }
  return out;
}

/** `target` with the part named by change id `id` taken from `source` (both candidates of `space`). */
function withPart(space, target0, source0, id) {
  const { character } = space;
  const t = space.canonical(target0);
  const s = space.canonical(source0);
  const field = { equipmentSet: 'equipmentSet', pet: 'petId', relics: 'relicIds', sigils: 'sigilSpecies', utility: 'utilitySigilSpecies', ancient: 'ancientSigilSpecies', transcendence: 'transcendencePresetId' }[id];
  if (field) return { ...t, [field]: s[field] };
  if (id === 'spec') return { ...t, talentSet: s.talentSet, talentAllocation: s.talentAllocation };
  if (id === 'mount') return { ...t, mountId: s.mountId, mountGlyphs: s.mountGlyphs };
  if (id.startsWith('talents:')) {
    const set = Number(id.slice(8));
    if (t.talentSet !== set) return t;
    const a = allocFor(character, s, set);
    return { ...t, talentAllocation: { ...a } };
  }
  if (id.startsWith('condition:')) {
    const sp = id.slice(10);
    const conds = { ...t.sigilConditions };
    if (sp in s.sigilConditions) conds[sp] = s.sigilConditions[sp];
    else conds[sp] = conditionOf(character, s, sp);
    return { ...t, sigilConditions: conds };
  }
  if (id.startsWith('glyph:')) {
    const [, m, tier, i] = id.split(':');
    if (t.mountId !== m) return t;
    const rows = socketsOn(character, t, m);
    const next = { ...rows, [tier]: [...rows[tier]] };
    const v = socketsOn(character, s, m)[tier]?.[Number(i)] ?? null;
    next[tier] = next[tier].map((x) => (x === v ? null : x)); // one instance per mount
    next[tier][Number(i)] = v;
    return { ...t, mountGlyphs: next };
  }
  throw new Error(`Unknown change ${id}`);
}

/** X with change `c` undone (taken back from B). Not legalised. */
export const revert = (space, B, X, c) => space.canonical(withPart(space, X, B, c.id ?? c));
/** B with change `c` of X applied. Not legalised. */
export const addChange = (space, B, X, c) => space.canonical(withPart(space, B, X, c.id ?? c));

/**
 * Revert every change of X (relative to B) that leaves the engine inputs unchanged, one at a time,
 * until none does (A.5). A revert is kept only when the legalised result is legal and engine-identical.
 * @param {Object} space  createBuildSpace(...)
 * @param {{mode?: 'pve'|'pvp', keyOf?: (cand: Object) => string}} [o]
 * @returns {{candidate: Object, inert: Object[]}}  `inert`: the changes reverted, in order
 */
export function canonicalise(space, B, X0, { mode = space.mode, keyOf } = {}) {
  const key = keyOf ?? ((c) => candidateEngineKey(space, c, mode));
  let X = space.canonical(X0);
  const target = key(X);
  const inert = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const c of changesOf(space, B, X, { bundles: false })) {
      const Y = space.legalise(revert(space, B, X, c));
      if (space.key(Y) === space.key(X)) continue;
      if (!legalityOf(space.character, space.presetId, Y, { roundTrip: false }).ok) continue;
      if (key(Y) !== target) continue;
      inert.push(c);
      X = Y;
      changed = true;
      break;
    }
  }
  return { candidate: X, inert };
}

/**
 * One arm per engineKey: of engine-identical arms the one with the fewest changes from `base` is kept
 * (ties: the first). Arms whose fighter cannot fight (EngineInputError) are kept apart, never merged.
 * @returns {{arms: Object[], merged: number}}
 */
export function mergeByEngine(space, arms, { mode = space.mode, base = space.start } = {}) {
  const best = new Map();
  const order = [];
  for (const a of arms) {
    let k;
    try {
      k = candidateEngineKey(space, a, mode);
    } catch (e) {
      if (!(e instanceof EngineInputError)) throw e;
      k = `unfightable:${order.length}`; // nothing to compare it with: its own arm
    }
    const n = changesOf(space, base, a, { bundles: false }).length;
    const prev = best.get(k);
    if (!prev) {
      best.set(k, { a, n });
      order.push(k);
    } else if (n < prev.n) best.set(k, { a, n });
  }
  return { arms: order.map((k) => best.get(k).a), merged: arms.length - order.length };
}

/**
 * The changes grouped into write groups (Apply review, A.11): the preset's own choices, each
 * character-wide write and each mount's sockets, with the other presets each group also changes.
 * @returns {Array<{scope: string, title: string, owner: Object, changeIds: string[], sideEffects: Object[]}>}
 */
export function writesOf(space, B, X, changes = changesOf(space, B, X, { bundles: false })) {
  const groups = new Map();
  for (const c of changes) {
    const k = c.scope === 'preset' ? 'preset' : c.scope === 'mount' ? `mount:${c.owner.mountId}` : c.id.startsWith('talents:') ? c.id : 'conditions';
    if (!groups.has(k)) {
      const title = c.scope === 'preset' ? `Preset ${space.preset.name}`
        : c.scope === 'mount' ? `${mountLabel(space.character, c.owner.mountId)} sockets`
          : c.id.startsWith('talents:') ? c.label : 'Sigil conditions';
      const owner = c.scope === 'preset' ? { presetId: space.presetId } : k === 'conditions' ? { species: [] } : { ...c.owner };
      groups.set(k, { scope: c.scope, title, owner, changeIds: [], sideEffects: [] });
    }
    const g = groups.get(k);
    if (k === 'conditions') g.owner.species.push(c.owner.species);
    g.changeIds.push(c.id);
    for (const s of c.sideEffects) if (!g.sideEffects.some((x) => x.presetId === s.presetId && x.reason === s.reason)) g.sideEffects.push(s);
  }
  return [...groups.values()];
}
