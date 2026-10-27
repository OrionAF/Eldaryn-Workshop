// L1 catalogue: mount species, glyph tiers and the 42 major glyph modifiers. Lookups only.
// Sources: Game/mounts-glyphs.md; data/mounts-glyphs.json (majorGlyphModifiers: decompile L1083900-1084786).
import mountsJson from '../../data/game/mounts-glyphs.json';

export const MOUNT_SPECIES = mountsJson.mountSpecies;
export const MOUNT_RARITY_STAT_RANGE = mountsJson.mountRarityStatRange;
export const MOUNT_ALTAR_TIERS = mountsJson.altarTiers;
export const MINOR_GLYPH_TYPES = mountsJson.minorGlyphTypes;
export const MYTHIC_GLYPH_TYPES = mountsJson.mythicGlyphTypes;
export const GLYPH_QUALITY_BANDS = mountsJson.glyphQualityBands;
/** Highest secondary quality (Mythic and above roll past 1; Game/updates-2.8.2.md §4). */
export const GLYPH_MAX_QUALITY = mountsJson.glyphMaxQuality;
/** Weighted {from, to, weight} sub-bands of a Mythic+ roll. */
export const MYTHIC_GLYPH_QUALITY_TIERS = mountsJson.mythicGlyphQualityTiers;
export const GLYPH_SECONDARY_POOL = mountsJson.glyphSecondaryPool;
/** 58 major glyph modifiers (16 Necromancer since 2.8.2). perRarity arrays index Common..Legendary (0..4). */
export const MAJOR_GLYPHS = mountsJson.majorGlyphModifiers;

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
