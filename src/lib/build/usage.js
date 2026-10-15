// build/usage.js (L4): "who uses this?" lookups for the Character pages (C6-C10). Pure; read-only.
// Pages name presets explicitly instead of hinting at a hidden active one (ia.md §4.1).
import { buildFighter } from './fighter.js';
import { effectiveTranscendencePreset } from '../model/legality.js';
import { activeMajorGlyphs } from '../model/mounts.js';
import { petDisplayName } from '../game/pets.js';

/**
 * What a pet-altar tier change destroys: every owned pet, and the pet of every preset that has one.
 * @returns {{pets: {id: string, name: string}[], presets: string[]}}
 */
export function tierChangeLosses(character) {
  const evolved = (character.pets?.altar?.tier ?? 1) >= 2;
  return {
    pets: (character.pets?.owned ?? []).map((p) => ({ id: p.id, name: petDisplayName(p.species, evolved) })),
    presets: (character.presets ?? []).filter((p) => p.petId).map((p) => p.name),
  };
}

/**
 * Presets that run a transcendence board, split by how: `linked` chose it, `following` has no (valid)
 * link (or is below level 58) and so uses the active board; none below 55 (effectiveTranscendencePreset, transcendence.md §1, §9).
 * @returns {{linked: string[], following: string[]}}
 */
export function boardUsers(character, boardId) {
  const out = { linked: [], following: [] };
  for (const p of character.presets ?? []) {
    if (effectiveTranscendencePreset(character, p)?.id !== boardId) continue;
    (p.transcendencePresetId === boardId ? out.linked : out.following).push(p.name);
  }
  return out;
}

/** Names of the presets that equip a relic. */
export const relicUsers = (character, relicId) => (character.presets ?? []).filter((p) => p.relicIds.includes(relicId)).map((p) => p.name);

/**
 * Major glyphs that do nothing in the presets that ride their mount, by the same rule the Fighter
 * uses (model/mounts.js activeMajorGlyphs over the species the Fighter really runs).
 * @returns {Map<string, string[]>} glyph id -> preset names where it is inert
 */
export function inertGlyphPresets(character) {
  const out = new Map();
  if (!character?.class) return out;
  const mounts = new Map((character.mounts ?? []).map((m) => [m.id, m]));
  const glyphs = new Map((character.glyphs ?? []).map((g) => [g.id, g]));
  for (const preset of character.presets ?? []) {
    const mount = preset.mountId ? mounts.get(preset.mountId) : null;
    if (!mount) continue;
    const f = buildFighter(character, preset.id);
    const equipped = [...f.sigils, f.utility, f.ancient].filter(Boolean).map((s) => s.species);
    const inert = new Set(activeMajorGlyphs(character, mount, f.spec, equipped).inert.map((g) => g.glyphType));
    for (const id of mount.glyphs.major) {
      const g = glyphs.get(id);
      if (!g || g.sealed || !inert.has(g.glyphType)) continue;
      out.set(id, [...new Set([...(out.get(id) ?? []), preset.name])]);
    }
  }
  return out;
}
