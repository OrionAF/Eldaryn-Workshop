// Builders from the sigil state to engine inputs: the castable spell list, the shield config, the
// summon config and the Druid form config (client L1095542-1096410). Pure; catalogue lookups via the
// L1 accessor and sigilScale. Game rules: docs/Reference/Game/sigils.md §2, §5-§9.
//
// The catalogue keeps a base spell's `spellType` on the sigil entry (druid variant spells store
// their own, sigils.md §12), so every spell these builders return carries a copied `spellType`
// (spells.js and glyphMods.applySigilGlyphMods read it from the spell, as the client does).
import { sigilBySpecies, isSigilSpeciesActiveForSpec, MIN_MINION_RESPAWN_COOLDOWN_MS } from '../../game/sigils.js';
import { getSigilSpellScaled, getFormConditionalSpells, getSigilDefinitionForSpec } from '../sources/sigilScale.js';
import { getActiveEquippedSpecies } from '../sources/sigilPassive.js';
import { applySigilGlyphMods } from './glyphMods.js';

/** @typedef {import('../sources/sigilPassive.js').SigilState & {ownedSigils: Array<{species: string, level: number, activationCondition?: string}>}} SpellSigilState */

const PASSIVE_TYPES = new Set(['AURA', 'STACK', 'SHIELD', 'FORM', 'SUMMON', 'STANCE']);

/** Level-scaled copy of a catalogue spell with its type attached. */
function scaledWithType(spell, level, spellType) {
  const scaled = getSigilSpellScaled(spell, level, spellType);
  return scaled === undefined ? undefined : { ...scaled, spellType };
}

const findOwned = (state, species) => state.ownedSigils.find((s) => s.species === species);

// port of getActiveCombatSpells L1096025-1096224
/**
 * The castable spells (DAMAGE, DEBUFF, BUFF, HEAL, DEFENSE, TRANSFORM) of the equipped generic
 * slots, in equip order, at each sigil's level. Passive types are skipped; a Druid with no
 * `formKind` skips sigils whose spell depends on the form. No glyph mods (see buildCombatSpells).
 * @param {SpellSigilState} state
 * @param {string} playerClass  upper-case
 * @param {string|null} spec    SpecKey
 * @param {'BEAR'|'WOLF'|null} [formKind]
 * @returns {import('./spells.js').CombatSpellConfig[]}
 */
export function getActiveCombatSpells(state, playerClass, spec, formKind = null) {
  const out = [];
  for (const species of getActiveEquippedSpecies(state, playerClass, spec)) {
    if (!isSigilSpeciesActiveForSpec(species, playerClass, spec)) continue;
    if (spec === 'MYSTIC_DRUID' && formKind == null && getFormConditionalSpells(species) != null) continue;
    const owned = findOwned(state, species);
    if (!owned) continue;
    const def = getSigilDefinitionForSpec(species, spec, formKind);
    if (!def) continue;
    if (PASSIVE_TYPES.has(def.spellType)) continue;
    const spell = scaledWithType(def.spell, owned.level, def.spellType);
    if (!spell || PASSIVE_TYPES.has(spell.spellType)) continue;
    out.push({
      species: owned.species,
      name: def.name,
      icon: sigilBySpecies(species)?.icon ?? null,
      spell,
      activationCondition: owned.activationCondition,
    });
  }
  return out;
}

/**
 * getActiveCombatSpells followed by the major-glyph pass, as the live loop builds its runtimes
 * (L1074067-1074081). Feed the result to spells.initSpellRuntimes.
 * @param {SpellSigilState} state
 * @param {string} playerClass
 * @param {string|null} spec
 * @param {'BEAR'|'WOLF'|null} formKind
 * @param {Map<string, import('./glyphMods.js').SigilGlyphMods>|null} [glyphModsMap]  resolveSigilGlyphMods output
 */
export function buildCombatSpells(state, playerClass, spec, formKind, glyphModsMap = null) {
  return applySigilGlyphMods(getActiveCombatSpells(state, playerClass, spec, formKind), glyphModsMap);
}

/** @typedef {{hpPercent: number, vampAlwaysRefills: boolean, regenAlwaysRefills: boolean}} ShieldConfig */
const NO_SHIELD = () => ({ hpPercent: 0, vampAlwaysRefills: false, regenAlwaysRefills: false });

// port of getEquippedShieldConfig L1095542-1095712
/**
 * The first owned SHIELD sigil among the utility slot then the generic slots. A Druid never has
 * one. hpPercent is the level-scaled shieldHpPercent times (1 + SHIELD_POWER glyph %/100).
 * @param {SpellSigilState} state
 * @param {string|null} spec
 * @param {Map<string, {shieldPowerPercent?: number}>|null} [glyphModsMap]
 * @returns {ShieldConfig}
 */
export function getEquippedShieldConfig(state, spec, glyphModsMap = null) {
  if (spec === 'MYSTIC_DRUID') return NO_SHIELD();
  const order = [];
  if (state.utilitySlotSpecies) order.push(state.utilitySlotSpecies);
  order.push(...(state.equippedSpecies ?? []));
  for (const species of order) {
    const owned = findOwned(state, species);
    if (!owned) continue;
    const def = sigilBySpecies(owned.species);
    if (!def || def.spellType !== 'SHIELD') continue;
    const scaled = getSigilSpellScaled(def.spell, owned.level, 'SHIELD');
    const power = glyphModsMap?.get(owned.species)?.shieldPowerPercent ?? 0;
    const hpPercent = power > 0 ? scaled.shieldHpPercent * (1 + power / 100) : scaled.shieldHpPercent;
    return {
      hpPercent,
      vampAlwaysRefills: def.spell.vampAlwaysRefills === true,
      regenAlwaysRefills: def.spell.regenAlwaysRefills === true,
    };
  }
  return NO_SHIELD();
}

// port of getEquippedShieldHpPercent L1096338-1096346
export function getEquippedShieldHpPercent(state, spec) {
  return getEquippedShieldConfig(state, spec).hpPercent;
}

// port of classifyShieldVariant L1096305-1096336
/** 'abyssal' (regen refills), 'void' (vamp refills) or 'arcane'. */
export function classifyShieldVariant(cfg) {
  if (cfg?.regenAlwaysRefills === true) return 'abyssal';
  if (cfg?.vampAlwaysRefills === true) return 'void';
  return 'arcane';
}

/**
 * @typedef {Object} SummonConfig
 * @property {string} species
 * @property {string} name
 * @property {string|null} icon
 * @property {string} minion
 * @property {number} attackPercent  level-scaled
 * @property {number} hpPercent      level-scaled
 * @property {number} respawnCooldownMs
 * @property {number} summonCastMs
 * @property {number} [deathWardPercent]  only when a Death Ward glyph applies (2.8.2)
 */

// port of getEquippedSummonConfig L1096227-1096303, with the 2.8.2 glyph mods (2.8.2 L1108119-L1108256):
// a respawn-haste glyph cuts the respawn cooldown down to MIN_MINION_RESPAWN_COOLDOWN_MS (or the sigil's
// own cooldown when that is lower), and a Death Ward glyph adds deathWardPercent.
/**
 * @param {Object} state
 * @param {Map<string, import('./glyphMods.js').SigilGlyphMods>|null} [mods] resolveSigilGlyphMods output
 * @returns {SummonConfig|null}
 */
export function getEquippedSummonConfig(state, mods = null) {
  const species = state.utilitySlotSpecies;
  if (!species) return null;
  const owned = findOwned(state, species);
  if (!owned) return null;
  const def = sigilBySpecies(owned.species);
  if (!def || def.spellType !== 'SUMMON') return null;
  const s = getSigilSpellScaled(def.spell, owned.level, 'SUMMON');
  const m = mods?.get(def.species);
  const cut = m?.respawnReductionMs ?? 0;
  const ward = m?.deathWardPercent ?? 0;
  return {
    species: def.species,
    name: def.name,
    icon: def.icon ?? null,
    minion: s.minion,
    attackPercent: s.attackPercent,
    hpPercent: s.hpPercent,
    respawnCooldownMs: cut > 0 && s.respawnCooldownMs > 0
      ? Math.max(Math.min(MIN_MINION_RESPAWN_COOLDOWN_MS, s.respawnCooldownMs), s.respawnCooldownMs - cut)
      : s.respawnCooldownMs,
    summonCastMs: s.summonCastMs,
    ...(ward > 0 ? { deathWardPercent: ward } : {}),
  };
}

// port of getEquippedFormConfig L1096348-1096410: the Druid's owned FORM sigil spell, or null
/** @returns {Object|null} catalogue FORM spell (unscaled; FORM spells do not scale) */
export function getEquippedFormConfig(state, playerClass, spec) {
  if (playerClass !== 'MYSTIC' || spec !== 'MYSTIC_DRUID') return null;
  const species = state.druidUtilitySlotSpecies;
  if (!species) return null;
  const owned = findOwned(state, species);
  if (!owned) return null;
  const def = sigilBySpecies(owned.species);
  return def && def.spellType === 'FORM' ? def.spell : null;
}

// port of getSpellDotDurationMs L1095723-1095763: DoT length of a DAMAGE spell for a spec, else 0
export function getSpellDotDurationMs(species, spec, formKind) {
  const d = getSigilDefinitionForSpec(species, spec, formKind);
  if (!d?.spell || d.spellType !== 'DAMAGE') return 0;
  return d.spell.isDoT ? d.spell.durationMs ?? 0 : 0;
}
