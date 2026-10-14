// Sigil passive bonuses (the `a4` source of calculateTotalStats): flat Attack/HP from every
// equipped sigil plus the percent stats of AURA sigils. See docs/Reference/Game/sigils.md §4-§6.
// Pure: the owned/equipped state arrives as a plain object, so this never imports the model.
import {
  sigilBySpecies, isSigilSpeciesActiveForSpec, utilitySlotSpellType,
} from '../../game/sigils.js';
import {
  getSigilBonusAttack, getSigilBonusHp, getSigilSpellScaled, getFormConditionalSpells,
  getSigilDefinitionForSpec, spellTypeOf,
} from './sigilScale.js';

/**
 * Sigil state the passive pass reads. Field names follow the client's sigil slice (sigils.md §11).
 * @typedef {Object} SigilState
 * @property {Array<{species: string, level: number}>} ownedSigils
 * @property {string[]} [equippedSpecies]            generic slots (non-Druid)
 * @property {string[]} [druidEquippedSpecies]       generic slots (Mystic Druid)
 * @property {string|null} [utilitySlotSpecies]      Summon or Shield sigil
 * @property {string|null} [druidUtilitySlotSpecies] Form sigil (Mystic Druid)
 * @property {number} [altarTier]                    default 1
 */

// AURA bonusStat -> SigilBonuses key (L1095928-1095988)
const AURA_FIELD = {
  ATTACK_PERCENT: 'attackPercent',
  HP_PERCENT: 'hpPercent',
  ATTACK_SPEED: 'attackSpeed',
  MISS_CHANCE: 'missChance',
  HP_REGEN: 'hpRegen',
  SPELL_DAMAGE: 'spellDamage',
};

/** The empty a4 object (L1096568). */
export function emptySigilBonuses() {
  return {
    flatAttack: 0, flatHp: 0, attackPercent: 0, hpPercent: 0,
    attackSpeed: 0, missChance: 0, hpRegen: 0, spellDamage: 0,
  };
}

// port of getActiveEquippedSpecies L1067436-1067473: a Mystic Druid uses its own generic slots
export function getActiveEquippedSpecies(state, playerClass, spec) {
  if (playerClass === 'MYSTIC' && spec === 'MYSTIC_DRUID') return [...(state.druidEquippedSpecies ?? [])];
  return [...(state.equippedSpecies ?? [])];
}

/**
 * port of calculateSigilBonuses L1095765-1096023.
 * Every equipped sigil (generic slots plus the utility slot) that is active for the spec and owned
 * adds floor(baseAttack/baseHp * growth * tierMult) at its level; AURA sigils add their scaled
 * `bonusValue` to the matching percent bucket. A Druid with no `formKind` skips sigils that only
 * have form-conditional (BEAR/WOLF) spells, exactly as the client does.
 * @param {SigilState} state
 * @param {string} playerClass  'WARRIOR' | 'SENTINEL' | 'MYSTIC' | 'NECROMANCER'
 * @param {string|null} spec    e.g. 'MYSTIC_DRUID'
 * @param {'BEAR'|'WOLF'|null} [formKind]
 * @returns {import('../types.js').SigilBonuses}
 */
export function calculateSigilBonuses(state, playerClass, spec, formKind = null) {
  const out = emptySigilBonuses();
  const utilityType = utilitySlotSpellType(playerClass, spec);
  const utility = utilityType === 'FORM' ? state.druidUtilitySlotSpecies : state.utilitySlotSpecies;
  const species = getActiveEquippedSpecies(state, playerClass, spec);
  if (utility) species.push(utility);
  if (species.length === 0) return out;

  const tier = state.altarTier == null ? 1 : state.altarTier;
  const owned = state.ownedSigils ?? [];
  for (const sp of species) {
    if (!isSigilSpeciesActiveForSpec(sp, playerClass, spec)) continue;
    const own = owned.find((o) => o.species === sp);
    if (!own) continue;
    const def = sigilBySpecies(own.species);
    if (!def) continue;
    out.flatAttack += getSigilBonusAttack(def, own.level, tier);
    out.flatHp += getSigilBonusHp(def, own.level, tier);
    // form-conditional spells have no single aura value without a form (L1095886-1095895)
    if (spec === 'MYSTIC_DRUID' && formKind == null && getFormConditionalSpells(sp) != null) continue;
    const resolved = getSigilDefinitionForSpec(sp, spec, formKind);
    const spell = resolved?.spell ?? def.spell;
    if (spellTypeOf(spell, resolved?.spellType ?? def.spellType) !== 'AURA') continue;
    const scaled = getSigilSpellScaled(spell, own.level, 'AURA');
    const field = AURA_FIELD[scaled.bonusStat];
    if (field) out[field] += scaled.bonusValue;
  }
  return out;
}
