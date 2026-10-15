// model/glyphs.js - owned by B4. Persisted character field: glyphs (the character-wide inventory).
// Shape (rebuild-plan §3): glyphs: [{ id, glyphType, rarity, sealed, secondary: {stat, quality}|null }].
// Equip state is NOT here: sockets live on the mount (model/mounts.js), glyph effects follow the ridden mount.
// Game facts: Game/mounts-glyphs.md §8 (architecture), §9 (minor secondary), §10 (major), §11 (mythic).
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER:
//   defaultGlyphs()                    -> { glyphs: [] }
//   normaliseGlyphs(rawCharacter, ctx) -> partial; ctx = { class, spec }; idempotent
//   migrateGlyphsFromV1(v1Character)   -> { value: partial, idMap: {} }   (presets never reference glyphs)
//   reconcileGlyphs(character)         -> void; a glyph has no outgoing references, so nothing to repair
//
// Gating, and why it is split in two:
//  - normalise drops a MAJOR glyph whose class is not the character's class (the game never lets one
//    exist) but keeps the other spec's majors: the active spec flips with the active preset, and the
//    game itself filters at resolve time rather than deleting (doc §10 step 3).
//  - SOCKETING is gated by class and by the specs the character's talent sets actually use
//    (majorGlyphAllowed); that rule lives here so the store, reconcile and the UI share it.
import {
  MAJOR_GLYPHS,
  MINOR_GLYPH_TYPES,
  MYTHIC_GLYPH_TYPES,
  GLYPH_SECONDARY_POOL,
  GLYPH_QUALITY_BANDS,
} from '../game/mountsGlyphs.js';
import { available } from '../game/classes.js';
import { newId } from './character.js';

/** Doc §8: rarity ladder for minor/major/mythic glyphs. Minor types fix their rarity; others pick per instance. */
export const GLYPH_RARITY_LADDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
/** Rarities a major or mythic-tier glyph can have (doc §8: top reachable is Legendary). Indexes perRarity arrays. */
export const FREE_GLYPH_RARITIES = GLYPH_RARITY_LADDER.slice(0, 5);
export const GLYPH_TIERS = ['minor', 'major', 'mythic'];
/** Doc §8 MOUNT_GLYPH_SOCKETS. */
export const MOUNT_GLYPH_SOCKETS = { minor: 3, major: 2, mythic: 1 };

const minorById = new Map(MINOR_GLYPH_TYPES.map((t) => [t.id, t]));
const majorById = new Map(MAJOR_GLYPHS.map((t) => [t.id, t]));
const mythicById = new Map(MYTHIC_GLYPH_TYPES.map((t) => [t.id, t]));
const poolByStat = new Map(GLYPH_SECONDARY_POOL.map((s) => [s.stat, s]));

export const GLYPH_SECONDARY_STATS = GLYPH_SECONDARY_POOL.map((s) => s.stat);

/**
 * Catalogue entry for a glyph type id, as `{ id, name, tier: 'minor'|'major'|'mythic', rarity, def }`.
 * `rarity` is the fixed rarity of a minor type and null for major and mythic types. Null if unknown.
 */
export function glyphTypeInfo(glyphType) {
  const minor = minorById.get(glyphType);
  if (minor) return { id: minor.id, name: minor.name, tier: 'minor', rarity: minor.rarity, def: minor };
  const major = majorById.get(glyphType);
  if (major) return { id: major.id, name: major.name, tier: 'major', rarity: null, def: major };
  const mythic = mythicById.get(glyphType);
  if (mythic) return { id: mythic.id, name: mythic.name, tier: 'mythic', rarity: null, def: mythic };
  return null;
}

export const glyphTier = (glyphType) => glyphTypeInfo(glyphType)?.tier ?? null;

/** Rarities an instance of this type can take (a single entry for minor types). */
export function glyphRarityOptions(glyphType) {
  const info = glyphTypeInfo(glyphType);
  if (!info) return [];
  return info.rarity ? [info.rarity] : FREE_GLYPH_RARITIES;
}

/**
 * Can a major glyph of this type be used by this class (and, when known, by one of these specs)?
 * `specs` = the non-null specs the character's talent sets use; empty/undefined means "unknown", so only the
 * class gate applies. Non-major types are always allowed. Doc §10 step 3.
 */
export function majorGlyphAllowed(glyphType, playerClass, specs = []) {
  const info = glyphTypeInfo(glyphType);
  if (!info) return false;
  if (info.tier !== 'major') return true;
  if (playerClass && info.def.playerClass !== playerClass) return false;
  const known = (specs ?? []).filter(Boolean);
  if (info.def.requiredSpec == null || known.length === 0) return true;
  return known.includes(info.def.requiredSpec);
}

/** Specs used by the character's talent sets (non-null, distinct). */
export function characterSpecs(character) {
  return [...new Set((character?.talentSets ?? []).map((t) => t?.spec).filter(Boolean))];
}

/** Value of a rolled secondary: parseFloat((min + (max-min)*quality).toFixed(decimals)). Doc §9. */
export function glyphSecondaryValue(secondary) {
  const def = poolByStat.get(secondary?.stat);
  if (!def) return 0;
  const q = Math.min(1, Math.max(0, Number(secondary.quality) || 0));
  return parseFloat((def.minValue + (def.maxValue - def.minValue) * q).toFixed(def.decimals));
}

/** Inverse of glyphSecondaryValue: the quality (0..1) that gives `value`, clamped. */
export function glyphSecondaryQuality(stat, value) {
  const def = poolByStat.get(stat);
  const v = Number(value);
  if (!def || !Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, (v - def.minValue) / (def.maxValue - def.minValue)));
}

export const glyphSecondaryDef = (stat) => poolByStat.get(stat) ?? null;

/**
 * Effect of a major glyph at a rarity: `{ kind, values }` where values maps each perRarity field to the number at
 * that rarity (Common..Legendary = 0..4). Null for non-major types or a rarity outside the five.
 */
export function majorEffectAtRarity(glyphType, rarity) {
  const info = glyphTypeInfo(glyphType);
  const idx = FREE_GLYPH_RARITIES.indexOf(rarity);
  if (!info || info.tier !== 'major' || idx < 0) return null;
  const values = {};
  for (const [field, arr] of Object.entries(info.def.perRarity)) values[field] = arr[idx];
  return { kind: info.def.effectKind, values };
}

// --- normalise ---

/** [lo, hi] quality band of a rarity (doc §9; unknown rarity falls back to Common like the client). */
export function glyphQualityBand(rarity) {
  return GLYPH_QUALITY_BANDS[rarity] ?? GLYPH_QUALITY_BANDS.Common;
}

/**
 * Is `stat` in the class's secondary pool? The per-class lists are partly [UNRESOLVED] (doc §9), so
 * this only ever warns; normalisation keeps a stat the pool lists whatever the class.
 */
export function glyphSecondaryInClassPool(stat, cls) {
  const def = poolByStat.get(stat);
  return !!def && available(def.statEnum, cls ?? 'WARRIOR');
}

function normaliseSecondary(raw, rarity) {
  if (!raw || typeof raw !== 'object' || !poolByStat.has(raw.stat)) return null;
  const q = Number(raw.quality);
  const [lo, hi] = glyphQualityBand(rarity);
  return { stat: raw.stat, quality: Number.isFinite(q) ? Math.min(hi, Math.max(lo, q)) : lo };
}

/** One raw glyph -> a valid glyph, or null when its type does not resolve (or is another class's major). */
export function normaliseGlyph(raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const info = glyphTypeInfo(raw.glyphType);
  if (!info) return null;
  if (info.tier === 'major' && ctx.class && info.def.playerClass !== ctx.class) return null;
  const rarity = info.rarity ?? (FREE_GLYPH_RARITIES.includes(raw.rarity) ? raw.rarity : 'Common');
  const sealed = raw.sealed === true;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('g'),
    glyphType: info.id,
    rarity,
    sealed,
    // Only minor glyphs roll a secondary, and only once unlocked (doc §8-§9).
    secondary: info.tier === 'minor' && !sealed ? normaliseSecondary(raw.secondary, rarity) : null,
  };
}

export function newGlyph({ glyphType, rarity, sealed = false, secondary = null } = {}, ctx = {}) {
  return normaliseGlyph({ id: newId('g'), glyphType, rarity, sealed, secondary }, ctx);
}

export function defaultGlyphs() {
  return { glyphs: [] };
}

export function normaliseGlyphs(rawCharacter, ctx = {}) {
  const list = Array.isArray(rawCharacter?.glyphs) ? rawCharacter.glyphs : [];
  const seen = new Set();
  const glyphs = [];
  for (const raw of list) {
    const g = normaliseGlyph(raw, ctx);
    if (!g) continue;
    if (seen.has(g.id)) g.id = newId('g');
    seen.add(g.id);
    glyphs.push(g);
  }
  return { glyphs };
}

// --- v1 migration ---

/** v1 STAT_FIELDS key -> glyph secondary pool stat. Flat attack/health and PVP stats have no pool entry. */
const V1_STAT_TO_POOL = {
  attack_pct: 'attackPercent',
  health_pct: 'healthPercent',
  speed: 'attackSpeed',
  crit: 'critChance',
  crit_mult: 'critDamage',
  double_hit: 'doubleHit',
  spell_damage: 'spellDamage',
  lifesteal: 'lifesteal',
  hp_regen: 'hpRegen',
  miss_chance: 'missChance',
  blind_chance: 'blindChance',
  paralyze_chance: 'paralyzeChance',
  dmg_reduction: 'damageReduction',
  spell_resist: 'spellResist',
  block_chance: 'blockChance',
  penetration: 'penetration',
};
// v1 typed these two in percent points (Attack Speed 12 = +12%); the client pool stores them as fractions.
const V1_PERCENT_POINT_STATS = new Set(['speed', 'crit_mult']);

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const majorBySlug = new Map(MAJOR_GLYPHS.map((g) => [slug(g.name), g]));
// v1 remapped its pre-catalogue 'ember-curse-glyph' special to Emberhoard Sigil.
const V1_SPECIAL_ALIASES = { 'ember-curse-glyph': 'emberhoard-sigil' };

function cap(s) {
  return typeof s === 'string' && s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
}

function convertV1Glyph(e) {
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !e.id) return null;
  const id = e.id;
  if (typeof e.special === 'string' && e.special) {
    const [key, rarityPart] = e.special.split(':');
    const def = majorBySlug.get(V1_SPECIAL_ALIASES[key] ?? key);
    if (!def) return null;
    const rarity = FREE_GLYPH_RARITIES.includes(cap(rarityPart)) ? cap(rarityPart) : FREE_GLYPH_RARITIES.includes(e.rarity) ? e.rarity : 'Common';
    return { id, glyphType: def.id, rarity, sealed: false, secondary: null };
  }
  if (e.tier === 'mythic') return { id, glyphType: MYTHIC_GLYPH_TYPES[0].id, rarity: 'Common', sealed: false, secondary: null };
  if (e.tier === 'major') return null; // a major without a catalogue special has no meaning
  // Minor: the type name carries no stat (doc §8), so any type of the right rarity stands in.
  const type = MINOR_GLYPH_TYPES.find((t) => t.rarity === e.rarity) ?? MINOR_GLYPH_TYPES[0];
  const stat = V1_STAT_TO_POOL[e.statKey];
  let secondary = null;
  if (stat) {
    const value = Number(e.value) / (V1_PERCENT_POINT_STATS.has(e.statKey) ? 100 : 1);
    secondary = { stat, quality: glyphSecondaryQuality(stat, value) };
  }
  return { id, glyphType: type.id, rarity: type.rarity, sealed: false, secondary };
}

/**
 * Shared by migrateGlyphsFromV1 and migrateMountsFromV1 (the two must agree on ids). v1 let one glyph sit on
 * many mounts; a v2 glyph instance fits one socket, so each extra use becomes a clone `<id>~<n>`.
 * @returns {{glyphs: object[], socketIds: Record<string, string[]>}} socketIds: v1 mount id -> v2 glyph ids
 */
export function convertV1Glyphs(v1Character) {
  const entries = Array.isArray(v1Character?.glyphs?.entries) ? v1Character.glyphs.entries : [];
  const base = new Map();
  for (const e of entries) {
    const g = convertV1Glyph(e);
    if (g && !base.has(g.id)) base.set(g.id, g);
  }
  const uses = new Map();
  const socketIds = {};
  const glyphs = [...base.values()];
  const mountEntries = Array.isArray(v1Character?.mounts?.entries) ? v1Character.mounts.entries : [];
  for (const m of mountEntries) {
    if (!m || typeof m.id !== 'string') continue;
    const ids = [];
    for (const gid of Array.isArray(m.glyphIds) ? m.glyphIds : []) {
      const g = base.get(gid);
      if (!g || ids.some((x) => x === gid || x.startsWith(`${gid}~`))) continue;
      const n = (uses.get(gid) ?? 0) + 1;
      uses.set(gid, n);
      if (n === 1) ids.push(gid);
      else {
        const clone = { ...g, id: `${gid}~${n}` };
        glyphs.push(clone);
        ids.push(clone.id);
      }
    }
    socketIds[m.id] = ids;
  }
  return { glyphs, socketIds };
}

export function migrateGlyphsFromV1(v1Character) {
  return { value: { glyphs: convertV1Glyphs(v1Character).glyphs }, idMap: {} };
}

// A glyph holds no references to other domains; sockets (the references to glyphs) are repaired by reconcileMounts.
// eslint-disable-next-line no-unused-vars
export function reconcileGlyphs(character) {}
