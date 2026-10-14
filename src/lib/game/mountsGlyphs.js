// L1 catalogue: mount species, glyph tiers and the 42 major glyph modifiers. Lookups only.
// Sources: Game/mounts-glyphs.md; data/mounts-glyphs.json (majorGlyphModifiers: decompile L1083900-1084786).
import mountsData from '../../data/game/mounts-glyphs.json';

export const MOUNT_SPECIES = mountsData.mountSpecies;
export const MOUNT_RARITY_STAT_RANGE = mountsData.mountRarityStatRange;
export const MOUNT_ALTAR_TIERS = mountsData.altarTiers;
export const MINOR_GLYPH_TYPES = mountsData.minorGlyphTypes;
export const MYTHIC_GLYPH_TYPES = mountsData.mythicGlyphTypes;
export const GLYPH_QUALITY_BANDS = mountsData.glyphQualityBands;
export const GLYPH_SECONDARY_POOL = mountsData.glyphSecondaryPool;
/** 42 major glyph modifiers. perRarity arrays index Common..Legendary (0..4). */
export const MAJOR_GLYPHS = mountsData.majorGlyphModifiers;

const mountMap = new Map(MOUNT_SPECIES.map((m) => [m.species, m]));
const majorBySigil = new Map(MAJOR_GLYPHS.map((g) => [g.sigilSpecies, g]));

/** Mount species entry by key (e.g. 'NIGHT_WOLF'), or null. */
export const mountBySpecies = (species) => mountMap.get(species) ?? null;

/** Major glyphs for a class and spec. requiredSpec null means both specs of the class. */
export function majorGlyphsForClassSpec(playerClass, spec) {
  return MAJOR_GLYPHS.filter(
    (g) => g.playerClass === playerClass && (g.requiredSpec == null || g.requiredSpec === spec),
  );
}

/** The major glyph tied to a sigil species, or null. */
export const majorGlyphForSigil = (sigilSpecies) => majorBySigil.get(sigilSpecies) ?? null;
