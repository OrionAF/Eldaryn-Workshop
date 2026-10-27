// L1 catalogue: sigil species, altar/forge constants, class and spec gating. Lookups only.
// Sources: Game/sigils.md §2 (utility slots), §11 (class gating), §12 (schema); data/sigils.json.
import sigilsJson from '../../data/game/sigils.json';

export const SIGIL_CATALOGUE = sigilsJson.catalogue;
export const SIGIL_RARITY_BASE = sigilsJson.rarityBase;
export const SIGIL_CONSTANTS = sigilsJson.constants.SIGIL_CONSTANTS;
export const SIGIL_ALTAR_CONSTANTS = sigilsJson.constants.SIGIL_ALTAR_CONSTANTS;
export const SIGIL_FORGE_CONSTANTS = sigilsJson.constants.SIGIL_FORGE_CONSTANTS;
export const SIGIL_SLOT_UNLOCKS = sigilsJson.constants.SIGIL_SLOT_UNLOCKS;
export const SIGIL_SLOT_UNLOCKS_MYSTIC = sigilsJson.constants.SIGIL_SLOT_UNLOCKS_MYSTIC;
export const SIGIL_UNLOCK_LEVEL_BY_CLASS = sigilsJson.constants.SIGILS_UNLOCK_LEVEL_BY_CLASS;
export const SIGIL_CONDITIONS_UNLOCK_LEVEL = sigilsJson.constants.SIGIL_CONDITIONS_UNLOCK_LEVEL;
export const MIN_SIGIL_COOLDOWN_MS = sigilsJson.constants.MIN_SIGIL_COOLDOWN_MS;
/** Floor of a respawn-hasted minion respawn (2.8.2 module 4001 L1093707; updates-2.8.2.md §5). */
export const MIN_MINION_RESPAWN_COOLDOWN_MS = sigilsJson.constants.MIN_MINION_RESPAWN_COOLDOWN_MS;
export const TRANSFORM_DURATION_MS = sigilsJson.constants.TRANSFORM_DURATION_MS;
export const FORGE_ODDS = sigilsJson.forgeOdds;
export const FORGE_ODDS_BY_ALTAR_LEVEL = sigilsJson.forgeOddsByAltarLevel;
export const ALTAR_FORGES_TO_NEXT_LEVEL = sigilsJson.altarForgesToNextLevel;
export const ALTAR_CUMULATIVE_FORGES_TO_LEVEL_30 = sigilsJson.altarCumulativeForgesToLevel30;

const bySpecies = new Map(SIGIL_CATALOGUE.map((s) => [s.species, s]));

/** Catalogue entry for a species key (e.g. 'BERSERK_STANCE'), or null. */
export const sigilBySpecies = (species) => bySpecies.get(species) ?? null;

/** Classes a sigil belongs to, upper-cased to match CLASSES in classes.js. */
export function sigilClasses(sigil) {
  return (sigil.classes ?? [sigil.class]).map((c) => c.toUpperCase());
}

/** Utility slot spell type per class and spec (sigils.md §2, §15). Sentinel has none. */
export function utilitySlotSpellType(playerClass, spec) {
  if (playerClass === 'WARRIOR') return 'STANCE';
  if (playerClass === 'NECROMANCER') return 'SUMMON';
  if (playerClass === 'MYSTIC') return spec === 'MYSTIC_DRUID' ? 'FORM' : 'SHIELD';
  return null;
}

// port of isSigilSpeciesActiveForSpec, L1066710-1066770. Ancients are always active.
// Druid-only sigils (requiredSpec MYSTIC_DRUID) and form sigils are hidden from Mage.
export function isSigilSpeciesActiveForSpec(species, playerClass, spec) {
  if (playerClass !== 'MYSTIC') return true;
  const sigil = bySpecies.get(species);
  if (!sigil) return true;
  if (sigil.rarity === 'Ancient') return true;
  if (spec !== 'MYSTIC_DRUID') return sigil.requiredSpec !== 'MYSTIC_DRUID';
  return sigil.spellType === 'FORM' || sigil.druidVariant != null || sigil.requiredSpec === 'MYSTIC_DRUID';
}

/** Sigils a character of this class and spec can see (catalogue order). */
export function sigilsForClassSpec(playerClass, spec) {
  return SIGIL_CATALOGUE.filter(
    (s) => sigilClasses(s).includes(playerClass) && isSigilSpeciesActiveForSpec(s.species, playerClass, spec),
  );
}
