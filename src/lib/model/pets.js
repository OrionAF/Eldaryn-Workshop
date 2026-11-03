// model/pets.js - the Pets domain (B3), Pets V2 since client 2.9.1: stats come from Pet Cores, the pet's
// look carries none (Game/pet-cores.md). Persisted character field: pets.
//
//   pets: { altar: { level: 1..50, tier: 1..20 },                ONE Core Altar for every core
//           cores: [{ id, rarity, baseAttack, baseHp, secondaries: [{type, value}] }] }   max 100
//
// `rarity` is the title-case tier name (Common..Oblivion, format.js RARITY_ORDER); `baseAttack`/`baseHp`
// are the core's own rolled bases (the game shows them). `type` is a stats.json enumName and `value` is
// the BASE ROLL in display units (percentage points; Attack Speed, Crit Damage, Minion Attack Speed
// too, as the game shows them). Altar scaling is applied by the engine, never stored.
//
// V1 pets (`owned` with species, before 2.9.1) are dropped on load: the user chose not to convert them
// (docs/WIP/being-worked-on/pet-cores-port.md §6 Q1). Presets that used one lose their pet through
// reconcilePresets.
//
// Domain contract (§3 "Normalisation layout"), all functions trade in PARTIAL CHARACTERS:
//   defaultPets() / normalisePets(rawCharacter, {class, spec}) (idempotent) /
//   migratePetsFromV1(v1Character) -> { value, idMap } / reconcilePets(character)
import {
  CORE_RARITIES, CORE_BASE_STATS, CORE_MAX_OWNED, coreSecondaryCount, coreSecondaryRange, coreSecondaryTypesFor,
} from '../game/petCores.js';
import { available } from '../game/classes.js';
import { newId } from './character.js';

export const PET_MAX_LEVEL = 50; // Game/pet-cores.md §4 MAX_ALTAR_LEVEL
export const PET_MAX_TIER = 20; // the client has no cap (pet-cores.md §3); a sanity bound only
export const MAX_OWNED_CORES = 100; // pet-cores.md §6 CORE_MAX_OWNED
if (CORE_MAX_OWNED !== MAX_OWNED_CORES) throw new Error('pet-cores.json maxOwned changed');

/** Stats the client keeps as multipliers (0.2 = 20%); the model keeps them in percent points. */
const MULTIPLIER_STATS = new Set(['ATTACK_SPEED', 'CRIT_DAMAGE', 'MINION_ATTACK_SPEED']);

const TITLE = new Map(CORE_RARITIES.map((r) => [r, r[0] + r.slice(1).toLowerCase()]));
/** Title-case core rarities, Common..Oblivion. */
export const CORE_RARITY_NAMES = [...TITLE.values()];
/** 'MYTHIC' or 'Mythic' -> 'Mythic'; null for anything else. */
export const coreRarityName = (r) => TITLE.get(String(r ?? '').toUpperCase()) ?? null;
/** 'Mythic' -> 'MYTHIC' (the catalogue and engine key). */
export const coreRarityEnum = (r) => (coreRarityName(r) ? String(r).toUpperCase() : null);

/** A core's display name, "Mythic Core" (the game names cores by rarity). */
export const coreName = (core) => (core ? `${core.rarity} Core` : null);

/** Secondary slots of a core rarity (1..5). */
export const coreSlots = (rarity) => coreSecondaryCount(coreRarityEnum(rarity));

/** The rarity's unrolled base (the middle of its +-10% band). */
export const coreBaseMid = (rarity) => CORE_BASE_STATS[coreRarityEnum(rarity)] ?? null;

/**
 * Slider envelope of a secondary in model units (percent points): the core roll at item level 50
 * (Game/pet-cores.md §5), x100 for the three multiplier stats. Null for a type a core cannot roll.
 * @returns {{min:number, max:number, step:number}|null}
 */
export function coreSecondaryRangePoints(type) {
  const r = coreSecondaryRange(type);
  if (!r) return null;
  const k = MULTIPLIER_STATS.has(type) ? 100 : 1;
  const round = (n) => Math.round(n * k * 1e6) / 1e6;
  return { min: round(r.min), max: round(r.max), step: round(10 ** -r.decimals) };
}

/** Secondary types a class may roll on a core (the class-filtered gear pool). */
export function secondaryTypesFor(cls) {
  return coreSecondaryTypesFor(cls ?? 'WARRIOR');
}

const round3 = (n) => Math.round(n * 1000) / 1000;
const clampInt = (v, min, max) => Math.max(min, Math.min(Math.round(Number(v)) || min, max));

/** Clamp a value to its envelope and step (UI input). */
export function clampSecondaryValue(type, value) {
  const r = coreSecondaryRangePoints(type);
  if (!r) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return r.min;
  const c = Math.max(r.min, Math.min(n, r.max));
  return round3(r.min + Math.round((c - r.min) / r.step) * r.step);
}

/** Stored value of a secondary: finite, >= 0, 3 dp. The envelope is a UI hint only, so real rolls survive. */
export function normaliseSecondaryValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? round3(n) : 0;
}

/** A stored base stat: a whole number >= 0, else the rarity's middle. */
const normaliseBase = (v, mid) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : mid);

export function defaultAltar() {
  return { level: 1, tier: 1 };
}

export function normaliseAltar(raw) {
  return { level: clampInt(raw?.level, 1, PET_MAX_LEVEL), tier: clampInt(raw?.tier, 1, PET_MAX_TIER) };
}

/** A fresh core of `rarity` at its unrolled base (null for an unknown rarity). */
export function newCore(rarity, id = newId('core')) {
  const name = coreRarityName(rarity);
  if (!name) return null;
  const mid = coreBaseMid(name);
  return { id, rarity: name, baseAttack: mid.attack, baseHp: mid.hp, secondaries: [] };
}

function normaliseSecondaries(raw, rarity, cls) {
  const out = [];
  const seen = new Set();
  const slots = coreSlots(rarity);
  for (const s of Array.isArray(raw) ? raw : []) {
    if (out.length >= slots) break;
    const type = s?.type;
    if (!coreSecondaryRange(type) || seen.has(type)) continue;
    if (cls && !available(type, cls)) continue;
    seen.add(type);
    out.push({ type, value: normaliseSecondaryValue(s.value) });
  }
  return out;
}

export function defaultPets() {
  return { pets: { altar: defaultAltar(), cores: [] } };
}

export function normalisePets(rawCharacter, ctx) {
  const raw = rawCharacter?.pets;
  // V1 pets (no `cores` array) are dropped, and their altar with them: V1 tiers mean something else.
  if (!Array.isArray(raw?.cores)) return defaultPets();
  const cls = ctx?.class ?? null;
  const seen = new Set();
  const cores = [];
  for (const c of raw.cores) {
    if (cores.length >= MAX_OWNED_CORES) break;
    const rarity = coreRarityName(c?.rarity);
    if (!rarity || typeof c.id !== 'string' || !c.id || seen.has(c.id)) continue;
    seen.add(c.id);
    const mid = coreBaseMid(rarity);
    cores.push({
      id: c.id,
      rarity,
      baseAttack: normaliseBase(c.baseAttack, mid.attack),
      baseHp: normaliseBase(c.baseHp, mid.hp),
      secondaries: normaliseSecondaries(c.secondaries, rarity, cls),
    });
  }
  return { pets: { altar: normaliseAltar(raw.altar), cores } };
}

/** v1 saves predate Pet Cores: every pet is dropped and presets get no pet (empty idMap). */
export function migratePetsFromV1() {
  return { value: defaultPets(), idMap: {} };
}

/** Drop secondaries the character's class cannot roll (e.g. after a class change). */
export function reconcilePets(character) {
  const cls = character?.class;
  if (!cls || !character.pets) return;
  for (const c of character.pets.cores) {
    const kept = (c.secondaries ?? []).filter((s) => available(s.type, cls));
    if (kept.length !== (c.secondaries ?? []).length) c.secondaries = kept;
  }
}
