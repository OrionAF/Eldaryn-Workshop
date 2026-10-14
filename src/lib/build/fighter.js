// build/fighter.js (C1a): Character + preset + realm -> the engine's Fighter (engine/types.js).
// A Fighter is plain data (structured-cloneable, so it crosses the worker boundary unchanged).
import { sigilBySpecies } from '../game/sigils.js';
import { mountGlyphLoadout } from '../model/mounts.js';
import { DEFAULT_CONDITION, SIGIL_CONDITIONS_LEVEL } from '../model/sigils.js';
import { computePresetStats } from './stats.js';

/** {species, level} for an owned sigil, or null (unowned or unknown species). */
function sigilEntry(character, species) {
  const own = species ? character.sigils?.owned?.[species] : null;
  return own && sigilBySpecies(species) ? { species, level: own.level } : null;
}

/**
 * Condition per equipped species. Activation conditions only take effect from character level 54
 * (sigils.md §7); below that every sigil fires ON_COOLDOWN whatever the preset stores. Whether
 * damage/debuff conditions apply (PvP only) is the combat engine's call, not stored here.
 */
function conditionsFor(character, preset, species) {
  const gated = (character.level ?? 100) >= SIGIL_CONDITIONS_LEVEL;
  const out = {};
  for (const sp of species) out[sp] = (gated && preset.sigilConditions?.[sp]) || DEFAULT_CONDITION;
  return out;
}

/**
 * Major glyphs on the ridden mount that act: a major glyph is inert unless its sigil is equipped
 * (CLAUDE.md BigReworkV1). Duplicates and class/spec filtering come from mountGlyphLoadout.
 */
function glyphModsFor(character, preset, spec, equipped) {
  const mount = preset.mountId ? (character.mounts ?? []).find((m) => m.id === preset.mountId) : null;
  if (!mount) return [];
  const on = new Set(equipped);
  return mountGlyphLoadout(character, mount, spec)
    .majors.filter((g) => on.has(g.sigilSpecies))
    .map((g) => ({ glyphType: g.glyphType, rarity: g.rarity }));
}

/**
 * Build the Fighter for one preset.
 *
 * Fields beyond engine/types.js `Fighter` (all additive): `formKind` ('BEAR'|'WOLF'|null, the equipped
 * Form sigil's form), `formConfig` (that sigil's spell object, the same one passed to
 * calculateTotalStats), `realm`, `presetId`, `source` ('sheet'|'computed').
 * @param {Object} character  a normalised v2 Character
 * @param {string} [presetId]  default: the active preset
 * @param {{realm?: 'base'|'oblivion'}} [opts]
 * @returns {import('../engine/types.js').Fighter}
 */
export function buildFighter(character, presetId, { realm = 'base' } = {}) {
  const res = computePresetStats(character, presetId, { realm });
  const { preset, spec } = res;
  const sigils = (preset.sigilSpecies ?? []).map((sp) => sigilEntry(character, sp)).filter(Boolean);
  const utility = sigilEntry(character, preset.utilitySigilSpecies);
  const ancient = sigilEntry(character, preset.ancientSigilSpecies);
  const equipped = [...sigils, utility, ancient].filter(Boolean).map((s) => s.species);
  return {
    stats: res.effective,
    class: character.class,
    spec,
    level: character.level,
    sigils,
    utility,
    ancient,
    conditions: conditionsFor(character, preset, equipped),
    glyphMods: glyphModsFor(character, preset, spec, equipped),
    altarTier: character.sigils?.altarTier ?? 1,
    formKind: res.formKind,
    formConfig: res.ctx.formConfig,
    realm,
    presetId: preset.id,
    source: res.source,
  };
}
