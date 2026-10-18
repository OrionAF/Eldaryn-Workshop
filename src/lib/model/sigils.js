// model/sigils.js - sigil ownership and the per-preset equip rules (rebuild-plan §3 sigils; owned by B5).
// Persisted character field: sigils = { altarTier: 1..8, owned: Record<species, {level: 1..30}> }.
// Per-preset equips (sigilSpecies, utilitySigilSpecies, ancientSigilSpecies, sigilConditions) live on
// the preset (model/presets.js owns the shape and the cheap normalisation); this file owns their
// LEGALITY, enforced in `reconcileSigils` (owned, class/spec-active, slot-unlocked by level).
//
// Domain contract (§3 "Normalisation layout"): default / normalise / migrateFromV1 / reconcile, all on
// partial characters. Pure; imports L1 only. Game facts: Reference/Game/sigils.md §2 (slots), §7
// (conditions), §9 (Ancients); this file only encodes them.
import {
  SIGIL_CATALOGUE,
  SIGIL_CONSTANTS,
  SIGIL_ALTAR_CONSTANTS,
  SIGIL_SLOT_UNLOCKS,
  SIGIL_SLOT_UNLOCKS_MYSTIC,
  SIGIL_CONDITIONS_UNLOCK_LEVEL,
  sigilBySpecies,
  sigilClasses,
  sigilsForClassSpec,
  utilitySlotSpellType,
} from '../game/sigils.js';

export const MAX_SIGIL_LEVEL = SIGIL_CONSTANTS.MAX_SIGIL_LEVEL;
export const MAX_ALTAR_TIER = SIGIL_ALTAR_CONSTANTS.MAX_TIER;
/** The Altar can only be evolved up to this tier (sigils.md §3). */
export const EVOLVE_TIER_CAP = SIGIL_ALTAR_CONSTANTS.EVOLVE_TIER_CAP;
export const SIGIL_CONDITIONS_LEVEL = SIGIL_CONDITIONS_UNLOCK_LEVEL;

/** Activation condition ids (sigils.md §7). ON_COOLDOWN is the default and is never stored. */
export const DEFAULT_CONDITION = 'ON_COOLDOWN';
export const ENEMY_CONDITIONS = ['ENEMY_HP_BELOW_80', 'ENEMY_HP_BELOW_60', 'ENEMY_HP_BELOW_40', 'ENEMY_HP_BELOW_20'];
export const SELF_CONDITIONS = ['MY_HP_BELOW_80', 'MY_HP_BELOW_60', 'MY_HP_BELOW_40', 'MY_HP_BELOW_20'];

/** Display text for an activation condition id (Game/sigils.md §7): "My HP at or below 40%", "On cooldown". */
export function conditionLabel(id) {
  if (!id || id === DEFAULT_CONDITION) return 'On cooldown';
  const m = /^(ENEMY|MY)_HP_BELOW_(\d+)$/.exec(id);
  if (!m) return id;
  return `${m[1] === 'ENEMY' ? 'Enemy' : 'My'} HP at or below ${m[2]}%`;
}
const KNOWN_CONDITIONS = new Set([...ENEMY_CONDITIONS, ...SELF_CONDITIONS]);

export function defaultSigils() {
  return { sigils: { altarTier: 1, owned: {} } };
}

const clampInt = (v, lo, hi, fallback) => {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
};

const isAncient = (def) => def?.rarity === 'Ancient';

/** Is this species one the class can ever own? (class gate only; spec gating is per preset) */
export function sigilForClass(species, playerClass) {
  const def = sigilBySpecies(species);
  return !!def && !!playerClass && sigilClasses(def).includes(playerClass);
}

/** Form sigils (Druid utility slot) are granted, not forged: the game keeps them at level 1 (L1328698, L1066539). */
export function isFormSigil(species) {
  return sigilBySpecies(species)?.spellType === 'FORM';
}

/** Ancients are unique and stay level 1 (sigils.md §3, §9); so do Form sigils. */
export const isGrantedSigil = (species) => !!sigilBySpecies(species)?.granted;

export function clampSigilLevel(species, level) {
  if (isAncient(sigilBySpecies(species)) || isFormSigil(species) || isGrantedSigil(species)) return 1;
  return clampInt(level, 1, MAX_SIGIL_LEVEL, 1);
}

// port of getMaxSigilSlots L1067168-1067210 (the last unlock row whose level <= player level, else 0)
export function maxSigilSlots(level, playerClass) {
  const table = playerClass === 'MYSTIC' || playerClass === 'NECROMANCER' ? SIGIL_SLOT_UNLOCKS_MYSTIC : SIGIL_SLOT_UNLOCKS;
  let slots = 0;
  for (const row of table) if (row.level <= level) slots = row.slots;
  return slots;
}

/** Level at which generic slot `n` (1-based) unlocks for the class. */
export function slotUnlockLevel(n, playerClass) {
  const table = playerClass === 'MYSTIC' || playerClass === 'NECROMANCER' ? SIGIL_SLOT_UNLOCKS_MYSTIC : SIGIL_SLOT_UNLOCKS;
  return table.find((r) => r.slots >= n)?.level ?? null;
}

// --- Eligibility ---

/** Class-slot sigils (Stance, Summon, Shield or Form); empty for Sentinel. */
export function utilitySigils(playerClass, spec) {
  const type = utilitySlotSpellType(playerClass, spec);
  if (!type) return [];
  return sigilsForClassSpec(playerClass, spec).filter((s) => s.rarity !== 'Ancient' && s.spellType === type);
}

/** Generic (3-slot) sigils for a class/spec: everything but Ancients and the utility type. */
export function genericSigils(playerClass, spec) {
  const type = utilitySlotSpellType(playerClass, spec);
  return sigilsForClassSpec(playerClass, spec).filter((s) => s.rarity !== 'Ancient' && s.spellType !== type);
}

/** Ancient sigils the class can use. */
export function ancientSigils(playerClass) {
  return SIGIL_CATALOGUE.filter((s) => s.rarity === 'Ancient' && sigilClasses(s).includes(playerClass));
}

/** Every species a class can own (generic, utility of every spec, Ancients), catalogue order. */
export function ownableSigils(playerClass) {
  return SIGIL_CATALOGUE.filter((s) => sigilClasses(s).includes(playerClass));
}

// --- Activation conditions (sigils.md §7) ---

// A spell's condition family from its shape. Druid variant spells carry no spellType (see
// engine/sources/sigilScale spellTypeOf), so the shape decides; `fallback` is the base sigil type.
function spellFamily(spell, fallback) {
  if (!spell) return 'none';
  const t = spell.spellType ?? null;
  if (t) return familyOfType(t);
  if (spell.bonusStat !== undefined) return 'none';
  if (spell.initialAttackPercent !== undefined || spell.debuff !== undefined) return 'enemy';
  if (spell.attackPercent !== undefined || spell.baseDamage !== undefined) return fallback === 'SUMMON' ? 'none' : 'enemy';
  if (spell.healPercentPerTick !== undefined) return 'self';
  if (spell.shieldHpPercent !== undefined) return 'none';
  if (spell.effects !== undefined) return fallback === 'TRANSFORM' ? 'none' : 'self';
  return familyOfType(fallback);
}

function familyOfType(type) {
  if (type === 'DAMAGE' || type === 'DEBUFF') return 'enemy';
  if (type === 'BUFF' || type === 'HEAL' || type === 'DEFENSE') return 'self';
  return 'none';
}

/**
 * Condition ids selectable for a species on a spec (ON_COOLDOWN first). A Druid's variant spells are
 * checked in both forms and only the options valid in every form are offered.
 * @param {string} species
 * @param {string|null} spec  e.g. 'MYSTIC_DRUID'
 */
export function sigilConditionOptions(species, spec = null) {
  const def = sigilBySpecies(species);
  if (!def) return [DEFAULT_CONDITION];
  const dv = spec === 'MYSTIC_DRUID' ? def.druidVariant : null;
  let families;
  if (dv?.formSpell) families = Object.values(dv.formSpell).map((s) => spellFamily(s, def.spellType));
  else if (dv?.spell) families = [spellFamily(dv.spell, def.spellType)];
  else families = [familyOfType(def.spellType)];
  const distinct = new Set(families);
  if (distinct.size !== 1) return [DEFAULT_CONDITION];
  const [family] = distinct;
  if (family === 'enemy') return [DEFAULT_CONDITION, ...ENEMY_CONDITIONS];
  if (family === 'self') return [DEFAULT_CONDITION, ...SELF_CONDITIONS];
  return [DEFAULT_CONDITION];
}

// --- Normalise / migrate / reconcile ---

/**
 * @param {object} rawCharacter  untrusted
 * @param {{class: string|null, spec: string|null}} ctx
 * Conditions are character-wide (one per owned sigil, sigils.md §7): `owned[sp].condition`, absent for
 * ON_COOLDOWN. Pre-M1 saves kept them per preset; those are lifted here (active preset wins, else the
 * first non-default) and a conflict is reported through `ctx.report`.
 * @returns {{sigils: {altarTier: number, owned: Record<string, {level: number, condition?: string}>}}}
 */
export function normaliseSigils(rawCharacter, ctx) {
  const raw = rawCharacter?.sigils && typeof rawCharacter.sigils === 'object' ? rawCharacter.sigils : {};
  const out = defaultSigils().sigils;
  out.altarTier = clampInt(raw.altarTier, 1, MAX_ALTAR_TIER, 1);
  const rawOwned = raw.owned && typeof raw.owned === 'object' && !Array.isArray(raw.owned) ? raw.owned : {};
  const cls = ctx?.class ?? null;
  // Catalogue order, so the persisted object is stable regardless of the raw key order.
  for (const def of SIGIL_CATALOGUE) {
    if (!sigilForClass(def.species, cls)) continue;
    const entry = rawOwned[def.species];
    if (entry == null) continue;
    const level = typeof entry === 'object' ? entry.level : entry;
    const n = typeof level === 'string' ? Number(level) : level;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) continue; // 0 / junk = not owned
    out.owned[def.species] = { level: clampSigilLevel(def.species, n) };
    if (typeof entry === 'object' && KNOWN_CONDITIONS.has(entry.condition)) out.owned[def.species].condition = entry.condition;
  }
  liftPresetConditions(rawCharacter, out.owned, ctx?.report);
  return { sigils: out };
}

/** Pre-M1 `preset.sigilConditions` -> `owned[sp].condition`. A value already on the sigil is never overwritten. */
function liftPresetConditions(rawCharacter, owned, report) {
  const presets = Array.isArray(rawCharacter?.presets) ? rawCharacter.presets.filter((p) => p && typeof p === 'object') : [];
  if (presets.length === 0) return;
  const active = presets.find((p) => p.id === rawCharacter.activePresetId) ?? presets[0];
  const ordered = [active, ...presets.filter((p) => p !== active)];
  for (const sp of Object.keys(owned)) {
    if (owned[sp].condition) continue;
    const seen = [];
    for (const p of ordered) {
      const c = p.sigilConditions?.[sp];
      if (KNOWN_CONDITIONS.has(c)) seen.push(c);
    }
    if (seen.length === 0) continue;
    owned[sp].condition = seen[0];
    const dropped = [...new Set(seen.filter((c) => c !== seen[0]))];
    if (dropped.length) report?.push({ kind: 'conditionConflict', species: sp, kept: seen[0], dropped });
  }
}

// v1 ids were catalogue slugs except one historical typo (sigils.md §8).
const V1_ID_FIXES = { 'berserkt-stance': 'berserk-stance' };
const bySlug = new Map(SIGIL_CATALOGUE.map((s) => [s.id, s.species]));

/** v1 sigil id -> species, or null when it no longer resolves. */
export function sigilSpeciesFromV1Id(id) {
  if (typeof id !== 'string') return null;
  return bySlug.get(V1_ID_FIXES[id] ?? id) ?? null;
}

/**
 * v1: `sigilValues[id].level` (0 = not owned) and `sigilForgeTier`; user-typed damage values are
 * dropped. idMap (v1 sigil id -> species) covers every id seen in sigilValues or any preset's sigilIds.
 * @returns {{value: {sigils: object}, idMap: Record<string, string>}}
 */
export function migrateSigilsFromV1(v1Character) {
  const idMap = {};
  const ids = new Set();
  const values = v1Character?.sigilValues && typeof v1Character.sigilValues === 'object' ? v1Character.sigilValues : {};
  for (const id of Object.keys(values)) ids.add(id);
  for (const p of Array.isArray(v1Character?.presets) ? v1Character.presets : []) {
    for (const id of Array.isArray(p?.sigilIds) ? p.sigilIds : []) ids.add(id);
  }
  const owned = {};
  for (const id of ids) {
    const species = sigilSpeciesFromV1Id(id);
    if (!species) continue;
    idMap[id] = species;
    const level = Number(values[id]?.level);
    if (Number.isFinite(level) && level >= 1) owned[species] = { level: clampSigilLevel(species, level) };
  }
  return {
    value: { sigils: { altarTier: clampInt(v1Character?.sigilForgeTier, 1, MAX_ALTAR_TIER, 1), owned } },
    idMap,
  };
}

/** Spec of the talent set a preset uses (null when unset). */
function presetSpec(character, preset) {
  return character.talentSets?.[preset.talentSet]?.spec ?? null;
}

/**
 * Enforce equip legality on every preset (mutates): picks must be owned, usable by the class and
 * the preset's spec, in the right slot kind, and within the slots the character level unlocks.
 * v1 presets listed Ancients (and could list utility-type sigils) among their generic picks; those
 * are moved to their own slot when it is free.
 */
export function reconcileSigils(character) {
  const cls = character.class;
  const owned = character.sigils?.owned ?? {};
  const slots = cls ? maxSigilSlots(character.level ?? 100, cls) : 0;
  if (slots > 0 && character.sigils) {
    for (const def of ownableSigils(cls)) if (def.granted) owned[def.species] = { level: 1 };
  }
  for (const p of character.presets ?? []) {
    const spec = presetSpec(character, p);
    const utilityType = utilitySlotSpellType(cls, spec);
    const generic = new Set(genericSigils(cls, spec).map((s) => s.species));
    const utility = new Set(utilitySigils(cls, spec).map((s) => s.species));
    const ancient = new Set(ancientSigils(cls).map((s) => s.species));
    const ok = (sp) => slots > 0 && !!owned[sp];

    let pickUtility = p.utilitySigilSpecies;
    let pickAncient = p.ancientSigilSpecies;
    const picks = [];
    for (const sp of p.sigilSpecies ?? []) {
      if (!ok(sp)) continue;
      if (ancient.has(sp) && !pickAncient) pickAncient = sp;
      else if (utility.has(sp) && utilityType && !pickUtility) pickUtility = sp;
      else if (generic.has(sp) && !picks.includes(sp)) picks.push(sp);
    }
    p.sigilSpecies = picks.slice(0, slots);
    p.utilitySigilSpecies = pickUtility && ok(pickUtility) && utility.has(pickUtility) ? pickUtility : null;
    p.ancientSigilSpecies = pickAncient && ok(pickAncient) && ancient.has(pickAncient) ? pickAncient : null;

  }
  reconcileConditions(character);
}

// A stored condition must be selectable on at least one of the character's specs (it is one value for
// every preset); otherwise it is dropped and the sigil fires ON_COOLDOWN.
function reconcileConditions(character) {
  const specs = (character.talentSets ?? []).map((s) => s?.spec ?? null);
  const checkSpecs = specs.some(Boolean) ? specs.filter(Boolean) : [null];
  for (const [sp, own] of Object.entries(character.sigils?.owned ?? {})) {
    if (own.condition === undefined) continue;
    if (own.condition === DEFAULT_CONDITION || !checkSpecs.some((spec) => sigilConditionOptions(sp, spec).includes(own.condition))) {
      delete own.condition;
    }
  }
}
