// model/mounts.js - owned by B4. Persisted character field: mounts (owned mount instances + their glyph sockets).
// Shape (rebuild-plan §3): mounts: [{ id, species, rarity, baseHp, baseAtk, level: 1..5,
//                                     glyphs: {minor: [id|null x3], major: [id|null x2], mythic: [id|null x1]} }].
// Game facts: Game/mounts-glyphs.md §2 (state), §3 (catalogue/roll), §4 (level), §5 (stat contribution), §8 (sockets).
// "Which mount is ridden" is per-preset (preset.mountId), reconciled in model/presets.js.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER:
//   defaultMounts()                    -> { mounts: [] }
//   normaliseMounts(rawCharacter, ctx) -> partial; idempotent
//   migrateMountsFromV1(v1Character)   -> { value, idMap }  idMap: v1 mount id (e.g. 'night_wolf') -> owned mount id
//   reconcileMounts(character)         -> void; clears sockets that no longer hold a usable glyph
import { MOUNT_RARITY_STAT_RANGE, MOUNT_SPECIES, mountBySpecies } from '../game/mountsGlyphs.js';
import { newId } from './character.js';
import {
  FREE_GLYPH_RARITIES,
  GLYPH_TIERS,
  MOUNT_GLYPH_SOCKETS,
  characterSpecs,
  convertV1Glyphs,
  glyphSecondaryValue,
  glyphTypeInfo,
  majorGlyphAllowed,
  majorEffectAtRarity,
} from './glyphs.js';

/** Doc §4 MOUNT_MAX_LEVEL / MOUNT_LEVEL_STAT_BONUS. */
export const MOUNT_MAX_LEVEL = 5;
export const MOUNT_LEVEL_STAT_BONUS = 0.1;
export { MOUNT_GLYPH_SOCKETS };

/** Doc §5: factor = 1 + 0.1 * (level - 1). */
export const mountLevelFactor = (level) => 1 + MOUNT_LEVEL_STAT_BONUS * (level - 1);

/** Doc §5: effective percent points the ridden mount adds (JS Math.round). */
export function mountEffectiveStats(mount) {
  const f = mountLevelFactor(mount.level);
  return { hpPercent: Math.round(mount.baseHp * f), attackPercent: Math.round(mount.baseAtk * f) };
}

/** Level-1 rolls the species can have (doc §3 `level1Roll`, DERIVED): { hp: [lo, hi], atk: [lo, hi] }. */
export function mountRollBounds(species) {
  const s = mountBySpecies(species);
  return s ? { hp: [...s.level1Roll.hp], atk: [...s.level1Roll.atk] } : null;
}

export function emptyMountSockets() {
  return { minor: Array(MOUNT_GLYPH_SOCKETS.minor).fill(null), major: Array(MOUNT_GLYPH_SOCKETS.major).fill(null), mythic: Array(MOUNT_GLYPH_SOCKETS.mythic).fill(null) };
}

function normaliseSockets(raw) {
  const out = emptyMountSockets();
  const taken = new Set();
  for (const tier of GLYPH_TIERS) {
    const row = Array.isArray(raw?.[tier]) ? raw[tier] : [];
    for (let i = 0; i < out[tier].length; i++) {
      const id = row[i];
      if (typeof id === 'string' && id && !taken.has(id)) {
        out[tier][i] = id;
        taken.add(id);
      }
    }
  }
  return out;
}

/** Whole-number percent points in [0, rarity ceiling]. The sliders use the tighter per-species envelope. */
function normaliseRoll(raw, rarity) {
  const range = MOUNT_RARITY_STAT_RANGE[rarity];
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return 0;
  return Math.min(range ? range[1] : 100, Math.max(0, n));
}

/** One raw mount -> a valid mount, or null when its species is not in the catalogue. */
export function normaliseMount(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const species = mountBySpecies(raw.species);
  if (!species) return null;
  const level = Math.floor(Number(raw.level));
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId('m'),
    species: species.species,
    rarity: species.rarity, // an instance's rarity is its species' rarity (a summon rolls within the altar tier)
    baseHp: normaliseRoll(raw.baseHp, species.rarity),
    baseAtk: normaliseRoll(raw.baseAtk, species.rarity),
    level: Number.isFinite(level) ? Math.min(MOUNT_MAX_LEVEL, Math.max(1, level)) : 1,
    glyphs: normaliseSockets(raw.glyphs),
  };
}

/** A new mount at the species' lowest level-1 roll unless rolls are given. */
export function newMount({ species, level = 1, baseHp, baseAtk } = {}) {
  const bounds = mountRollBounds(species);
  return normaliseMount({
    id: newId('m'),
    species,
    level,
    baseHp: baseHp ?? bounds?.hp[0],
    baseAtk: baseAtk ?? bounds?.atk[0],
  });
}

export function defaultMounts() {
  return { mounts: [] };
}

export function normaliseMounts(rawCharacter) {
  const list = Array.isArray(rawCharacter?.mounts) ? rawCharacter.mounts : [];
  const seen = new Set();
  const mounts = [];
  for (const raw of list) {
    const m = normaliseMount(raw);
    if (!m) continue;
    if (seen.has(m.id)) m.id = newId('m');
    seen.add(m.id);
    mounts.push(m);
  }
  return { mounts };
}

/**
 * Can this glyph sit in a socket of `tier` on a mount of this character? Exists, unsealed (doc §8), the right row,
 * and (majors) allowed for the class and the talent-set specs. Used by reconcile and by the socket mutator.
 */
export function glyphSocketable(character, glyph, tier) {
  if (!glyph || glyph.sealed) return false;
  const info = glyphTypeInfo(glyph.glyphType);
  if (!info || info.tier !== tier) return false;
  return tier !== 'major' || majorGlyphAllowed(glyph.glyphType, character.class, characterSpecs(character));
}

export function reconcileMounts(character) {
  const byId = new Map((character.glyphs ?? []).map((g) => [g.id, g]));
  const used = new Set(); // one glyph instance fits one socket
  for (const mount of character.mounts ?? []) {
    for (const tier of GLYPH_TIERS) {
      mount.glyphs[tier] = mount.glyphs[tier].map((id) => {
        if (!id || used.has(id) || !glyphSocketable(character, byId.get(id), tier)) return null;
        used.add(id);
        return id;
      });
    }
  }
}

/**
 * What a mount's sockets contribute (doc §9-§10), ready for the build layer.
 *  - minors: [{stat, value}] for every unlocked minor glyph with a rolled secondary (stat = pool key, e.g. 'critChance')
 *  - majors: [{glyphType, rarity, sigilSpecies, kind, values}] deduplicated by glyphType keeping the highest rarity,
 *    filtered by class and `spec` (requiredSpec null or equal); two copies of one type do not stack
 *  - mythics: [{glyphType, rarity}] (descriptive only, doc §11)
 */
export function mountGlyphLoadout(character, mount, spec = null) {
  const byId = new Map((character.glyphs ?? []).map((g) => [g.id, g]));
  const at = (tier) => mount.glyphs[tier].map((id) => byId.get(id)).filter((g) => g && !g.sealed);
  const minors = at('minor')
    .filter((g) => g.secondary)
    .map((g) => ({ stat: g.secondary.stat, value: glyphSecondaryValue(g.secondary) }));
  const best = new Map();
  for (const g of at('major')) {
    const def = glyphTypeInfo(g.glyphType)?.def;
    if (!def || def.playerClass !== character.class) continue;
    if (def.requiredSpec != null && def.requiredSpec !== spec) continue;
    const prev = best.get(g.glyphType);
    if (!prev || rank(g.rarity) > rank(prev.rarity)) best.set(g.glyphType, g);
  }
  const majors = [...best.values()].map((g) => {
    const def = glyphTypeInfo(g.glyphType).def;
    const eff = majorEffectAtRarity(g.glyphType, g.rarity);
    return { glyphType: g.glyphType, rarity: g.rarity, sigilSpecies: def.sigilSpecies, kind: eff?.kind ?? def.effectKind, values: eff?.values ?? {} };
  });
  const mythics = at('mythic').map((g) => ({ glyphType: g.glyphType, rarity: g.rarity }));
  return { minors, majors, mythics };
}
const rank = (r) => FREE_GLYPH_RARITIES.indexOf(r);

// --- v1 migration ---

/**
 * v1 mounts were a fixed catalogue with `star` (0 = not owned) and the star's effective hpPct/atkPct. Each owned
 * entry becomes one instance: level = star, base = effective / factor (0 when the value is missing; doc §5).
 * Sockets come from the same conversion as the glyph migration so the ids agree.
 */
export function migrateMountsFromV1(v1Character) {
  const entries = Array.isArray(v1Character?.mounts?.entries) ? v1Character.mounts.entries : [];
  const { glyphs, socketIds } = convertV1Glyphs(v1Character);
  const glyphTypeById = new Map(glyphs.map((g) => [g.id, g.glyphType]));
  const mounts = [];
  const idMap = {};
  for (const e of entries) {
    if (!e || typeof e.id !== 'string' || !(Number(e.star) > 0)) continue;
    const species = MOUNT_SPECIES.find((s) => s.species === e.id.toUpperCase());
    if (!species) continue;
    const level = Math.min(MOUNT_MAX_LEVEL, Math.max(1, Math.floor(Number(e.star))));
    const f = mountLevelFactor(level);
    const back = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v) / f) : 0);
    const sockets = emptyMountSockets();
    for (const gid of socketIds[e.id] ?? []) {
      const tier = glyphTypeInfo(glyphTypeById.get(gid))?.tier;
      const slot = tier ? sockets[tier].indexOf(null) : -1;
      if (slot >= 0) sockets[tier][slot] = gid;
    }
    const id = newId('m');
    mounts.push({ id, species: species.species, rarity: species.rarity, baseHp: back(e.hpPct), baseAtk: back(e.atkPct), level, glyphs: sockets });
    idMap[e.id] = id;
  }
  return { value: { mounts }, idMap };
}
