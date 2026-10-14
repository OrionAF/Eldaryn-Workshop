// model/pets.js - the Pets domain (B3). Persisted character field: pets. Shape: rebuild-plan §3 pets.
//
//   pets: { altar: { level: 1..50, tier: 1..8 },                 ONE altar for the whole collection
//           owned: [{ id, species, rarity, secondaries: [{type, value}] }] }
//
// `species` is a game/pets.js id (FLAME_TOAD ...); `rarity` is catalogue data (copied in so a consumer
// need not look it up, always re-derived on load). `type` is a stats.json enumName (ATTACK_PERCENT ...)
// and `value` is the BASE ROLL in display units (percentage points; attack speed too, as the game shows
// it). Altar scaling (x(1 + 0.02 (level-1)), Game/pets.md §5) is applied by the engine, never stored.
//
// Domain contract (§3 "Normalisation layout"), all functions trade in PARTIAL CHARACTERS:
//   defaultPets() / normalisePets(rawCharacter, {class, spec}) (idempotent) /
//   migratePetsFromV1(v1Character) -> { value, idMap: v1 pet id -> owned pet id } / reconcilePets(character)
import { PET_SPECIES, petSpeciesById } from '../game/pets.js';
import { available } from '../game/classes.js';
import { newId } from './character.js';

export const PET_MAX_LEVEL = 50; // Game/pets.md §1 MAX_ALTAR_LEVEL
export const PET_MAX_TIER = 8; // Game/pets.md §1 PET_ASCEND_CONSTANTS.MAX_TIER
export const MAX_OWNED_PETS = 100; // Game/pets.md §1

/**
 * Secondary types a pet can carry (the 26 the client's bonus calculator accepts, Game/pets.md §5)
 * with the slider envelope the v1 tool observed. The envelope is OBSERVED data (combat-model
 * provenance), a UI aid only; `manual` types have no trustworthy max and are typed, not slid.
 */
export const PET_SECONDARY_RANGES = {
  ATTACK_PERCENT: { min: 0.1, max: 21.0, step: 0.1 },
  HEALTH_PERCENT: { min: 0.1, max: 22.6, step: 0.1 },
  CRIT_CHANCE: { min: 0.1, max: 7.3, step: 0.1 },
  CRIT_DAMAGE: { min: 1, max: 48, step: 1 },
  DOUBLE_HIT: { min: 1.0, max: 12.1, step: 0.1 },
  ATTACK_SPEED: { min: 0.1, max: 32.0, step: 0.1 },
  LIFESTEAL: { min: 0.2, max: 12.1, step: 0.1 },
  PENETRATION: { min: 0, step: 0.1, manual: true },
  HP_REGEN: { min: 0.1, max: 5.2, step: 0.1 },
  SPELL_DAMAGE: { min: 2.6, max: 30.7, step: 0.1 },
  BLOCK_CHANCE: { min: 1.0, max: 5.6, step: 0.1 },
  DAMAGE_REDUCTION: { min: 0.5, max: 6.1, step: 0.1 },
  SPELL_RESIST: { min: 1.0, max: 11.1, step: 0.1 },
  MISS_CHANCE: { min: 0.4, max: 7.7, step: 0.1 },
  BLIND_CHANCE: { min: 0.1, max: 7.3, step: 0.1 },
  PARALYZE_CHANCE: { min: 0.2, max: 1.2, step: 0.1 },
  // Accepted by the game but never observed on a pet: typed by hand (no envelope).
  SPELL_CRIT_CHANCE: { min: 0, step: 0.1, manual: true },
  SPELL_VAMP: { min: 0, step: 0.1, manual: true },
  DISRUPTION_CHANCE: { min: 0, step: 0.1, manual: true },
  FEAR_CHANCE: { min: 0, step: 0.1, manual: true },
  MINION_ATTACK: { min: 0, step: 0.1, manual: true },
  MINION_HEALTH: { min: 0, step: 0.1, manual: true },
  MINION_CRIT_CHANCE: { min: 0, step: 0.1, manual: true },
  MINION_LIFESTEAL: { min: 0, step: 0.1, manual: true },
  SOUL_LINK: { min: 0, step: 0.1, manual: true },
  MINION_ATTACK_SPEED: { min: 0, step: 0.1, manual: true },
};
export const PET_SECONDARY_TYPES = Object.keys(PET_SECONDARY_RANGES);

/** v1 the v1 pet catalogue statKey -> stats.json enumName, for migration. */
const V1_STAT_KEY_TO_TYPE = {
  attack_pct: 'ATTACK_PERCENT', health_pct: 'HEALTH_PERCENT', crit: 'CRIT_CHANCE', crit_mult: 'CRIT_DAMAGE',
  double_hit: 'DOUBLE_HIT', speed: 'ATTACK_SPEED', lifesteal: 'LIFESTEAL', penetration: 'PENETRATION',
  hp_regen: 'HP_REGEN', spell_damage: 'SPELL_DAMAGE', block_chance: 'BLOCK_CHANCE',
  dmg_reduction: 'DAMAGE_REDUCTION', spell_resist: 'SPELL_RESIST', miss_chance: 'MISS_CHANCE',
  blind_chance: 'BLIND_CHANCE', paralyze_chance: 'PARALYZE_CHANCE',
};

/** v1 companion id ('pyretoad', 'flametoad') -> species id: base and evolved names both resolve. */
const flat = (s) => String(s).toLowerCase().replace(/[^a-z]/g, '');
const V1_COMPANION_TO_SPECIES = new Map(
  PET_SPECIES.flatMap((s) => [[flat(s.name), s.id], [flat(s.evolvedName), s.id]]),
);

const clampInt = (v, min, max) => Math.max(min, Math.min(Math.round(Number(v)) || min, max));
const round3 = (n) => Math.round(n * 1000) / 1000;

export function defaultAltar() {
  return { level: 1, tier: 1 };
}

export function normaliseAltar(raw) {
  return { level: clampInt(raw?.level, 1, PET_MAX_LEVEL), tier: clampInt(raw?.tier, 1, PET_MAX_TIER) };
}

/** Max secondary slots of a species (catalogue `secondaryStatCount`). */
export function secondarySlots(speciesId) {
  return petSpeciesById(speciesId)?.secondaryStatCount ?? 0;
}

/** Secondary types a class may roll: pet-eligible AND class-available (game/classes.available). */
export function secondaryTypesFor(cls) {
  return PET_SECONDARY_TYPES.filter((t) => available(t, cls ?? 'WARRIOR'));
}

/** Clamp a rolled value to its envelope and step; manual types are only floored at 0. */
export function clampSecondaryValue(type, value) {
  const r = PET_SECONDARY_RANGES[type];
  if (!r) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return r.min;
  if (r.manual) return Math.max(r.min, round3(n));
  const c = Math.max(r.min, Math.min(n, r.max));
  return round3(r.min + Math.round((c - r.min) / r.step) * r.step);
}

/** Stored value of a secondary: finite, >= 0, 3 dp. The envelope is a UI hint only, so real rolls survive. */
export function normaliseSecondaryValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? round3(n) : 0;
}

/** A fresh owned pet of `speciesId` (null for an unknown species). */
export function newPet(speciesId, id = newId('pet')) {
  const s = petSpeciesById(speciesId);
  return s ? { id, species: s.id, rarity: s.rarity, secondaries: [] } : null;
}

function normaliseSecondaries(raw, species, cls) {
  const out = [];
  const seen = new Set();
  for (const s of Array.isArray(raw) ? raw : []) {
    if (out.length >= species.secondaryStatCount) break;
    const type = s?.type;
    if (!PET_SECONDARY_RANGES[type] || seen.has(type)) continue;
    if (cls && !available(type, cls)) continue;
    seen.add(type);
    out.push({ type, value: normaliseSecondaryValue(s.value) });
  }
  return out;
}

export function defaultPets() {
  return { pets: { altar: defaultAltar(), owned: [] } };
}

export function normalisePets(rawCharacter, ctx) {
  const raw = rawCharacter?.pets;
  const cls = ctx?.class ?? null;
  const seen = new Set();
  const owned = [];
  for (const p of Array.isArray(raw?.owned) ? raw.owned : []) {
    if (owned.length >= MAX_OWNED_PETS) break;
    const species = petSpeciesById(p?.species);
    if (!species || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    owned.push({ id: p.id, species: species.id, rarity: species.rarity, secondaries: normaliseSecondaries(p.secondaries, species, cls) });
  }
  return { pets: { altar: normaliseAltar(raw?.altar), owned } };
}

/**
 * v1 -> v2. Catalogue pets (companionId set) keep their id and become owned pets of the matching
 * species; custom/legacy hand-entered pets have no species and are dropped (their presets get no
 * pet). The v1 altar carried tier up to 10; v2 caps at 8, so it clamps. Secondary statKeys map to
 * enum types; class gating is applied afterwards by normalisePets.
 */
export function migratePetsFromV1(v1Character) {
  const owned = [];
  const idMap = {};
  const seen = new Set();
  for (const p of Array.isArray(v1Character?.pets) ? v1Character.pets : []) {
    const speciesId = V1_COMPANION_TO_SPECIES.get(flat(p?.companionId ?? ''));
    if (!speciesId || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const secondaries = (Array.isArray(p.secondaries) ? p.secondaries : [])
      .map((s) => ({ type: V1_STAT_KEY_TO_TYPE[s?.statKey], value: s?.value }))
      .filter((s) => s.type);
    owned.push({ id: p.id, species: speciesId, secondaries });
    idMap[p.id] = p.id;
  }
  const value = { pets: { altar: normaliseAltar(v1Character?.petAltar), owned } };
  return { value, idMap };
}

/** Drop secondaries the character's class cannot roll (e.g. after a class change). */
export function reconcilePets(character) {
  const cls = character?.class;
  if (!cls || !character.pets) return;
  for (const p of character.pets.owned) {
    const kept = (p.secondaries ?? []).filter((s) => available(s.type, cls));
    if (kept.length !== (p.secondaries ?? []).length) p.secondaries = kept;
  }
}
