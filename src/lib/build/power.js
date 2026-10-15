// build/power.js (O2): a character + preset (or an optimiser candidate, once materialised) -> the inputs of
// the client's Combat Power (engine/power.js; Game/stats.md §8). Pure. The mapping follows the client's
// useTotalPower hook: the preset's equipment set, the ACTIVATED stones socketed in that set (each stone
// once), the equipped sigils (Ancient and utility included, whatever the board: the hook reads the equipped
// list), the sigil altar tier, the pet, the mount (level as stars), the relics, the node count of the
// preset's Transcendence board, the talent points of its talent set, the Awakening level and the player level.
import { calculatePowerBreakdown, calculateItemQuality } from '../engine/power.js';
import { sigilBySpecies } from '../game/sigils.js';
import { petSpeciesById } from '../game/pets.js';
import { mountBySpecies } from '../game/mountsGlyphs.js';
import { relicById } from '../game/relics.js';
import { pointsSpent } from '../model/talents.js';
import { effectiveTranscendencePreset } from '../model/legality.js';
import { resolvePreset, equipSetKey } from './presetInputs.js';

const upper = (s) => (typeof s === 'string' ? s.toUpperCase() : null);

/**
 * The PowerInput of one preset, plus `gaps`: what the model does not know and the input therefore
 * counts as zero ('rarity' or 'itemLevel' of a migrated item), so the figure is a lower bound.
 * @param {Object} character  a normalised v2 Character
 * @param {string} [presetId]  default: the active preset
 * @param {{realm?: 'base'|'oblivion'}} [opts]
 * @returns {{input: Object, gaps: string[]}}
 */
export function powerInputs(character, presetId, { realm = 'base' } = {}) {
  const preset = resolvePreset(character, presetId);
  const setKey = equipSetKey(preset, realm);
  const gaps = new Set();
  const itemRealm = setKey === 'oblivion' ? 'OBLIVION' : null;

  const equipment = Object.values(character.equipment?.[setKey]?.items ?? {}).map((item) => {
    if (!item) return null;
    if (item.rarity == null) gaps.add('rarity');
    if (item.itemLevel == null) gaps.add('itemLevel');
    const itemLevel = item.itemLevel ?? 0;
    return { rarity: item.rarity, itemLevel, realm: itemRealm, quality: calculateItemQuality({ secondaryStats: item.secondaryStats, itemLevel, realm: itemRealm }) };
  });

  const owned = character.sigils?.owned ?? {};
  const species = [...(preset?.sigilSpecies ?? []), preset?.ancientSigilSpecies, preset?.utilitySigilSpecies].filter((sp) => sp && owned[sp]);
  const sigils = [...new Set(species)].map((sp) => ({ rarity: upper(sigilBySpecies(sp)?.rarity), level: owned[sp].level }));

  const pool = setKey === 'oblivion' ? character.oblivionEnchantStones : character.enchantStones;
  const socketed = new Set(Object.values(character.equipment?.[setKey]?.enchantSlots ?? {}).filter(Boolean));
  const enchants = (pool ?? []).filter((s) => s.activated && socketed.has(s.id)).map((s) => ({ quality: s.quality ?? 0, amplifyLevel: s.amplifyLevel ?? 0 }));

  const pet = preset?.petId ? (character.pets?.owned ?? []).find((p) => p.id === preset.petId) : null;
  const altar = character.pets?.altar ?? { level: 1, tier: 1 };
  const mount = preset?.mountId ? (character.mounts ?? []).find((m) => m.id === preset.mountId) : null;
  const relics = (preset?.relicIds ?? []).map((id) => {
    const def = relicById(id);
    return def ? { tier: upper(def.tier), level: character.relics?.[id] ?? 1, maxLevel: def.maxLevel } : null;
  }).filter(Boolean);
  const talentSet = character.talentSets?.[preset?.talentSet === 1 ? 1 : 0];

  return {
    input: {
      level: character.level ?? 0,
      equipment,
      sigils,
      sigilAltarTier: character.sigils?.altarTier ?? 1,
      enchants,
      transcendenceNodeCount: effectiveTranscendencePreset(character, preset)?.allocatedNodeIds?.length ?? 0,
      pet: pet ? { rarity: upper(petSpeciesById(pet.species)?.rarity), altarLevel: altar.level, tier: altar.tier } : null,
      mount: mount ? { rarity: upper(mountBySpecies(mount.species)?.rarity), stars: mount.level ?? 1 } : null,
      relics,
      talentPointsSpent: pointsSpent(talentSet?.allocation ?? {}),
      awakeningPoints: character.awakening?.level ?? 0,
    },
    gaps: [...gaps],
  };
}

/**
 * Combat Power of a preset: {power, terms, exact, gaps} (engine/power.js calculatePowerBreakdown).
 * @param {Object} character
 * @param {string} [presetId]
 * @param {{realm?: 'base'|'oblivion'}} [opts]
 */
export function presetPower(character, presetId, opts) {
  const { input, gaps } = powerInputs(character, presetId, opts);
  return { ...calculatePowerBreakdown(input), gaps };
}
