// build/presetInputs.js (C1a): persisted Character + preset + realm -> the arguments of
// calculateTotalStats (rebuild-plan §2.2). Pure; the only place that knows how the v2 model maps
// onto the engine sources. Argument shapes: engine/pipeline/totals.js header.
//
// Realm 'base' uses equipment.set<preset.equipmentSet> and `enchantStones`; realm 'oblivion' uses
// equipment.oblivion and `oblivionEnchantStones`. Everything else (talents, pet, mount, relics,
// sigils, transcendence) comes from the preset in both realms (pve-content.md §9).
import { calculateTalentBonuses } from '../engine/sources/talents.js';
import { calculateTranscendenceBonuses } from '../engine/sources/transcendence.js';
import { calculateAwakeningBonuses } from '../engine/sources/awakening.js';
import { calculatePetBonuses } from '../engine/sources/pet.js';
import { calculateStoneBonuses } from '../engine/sources/stones.js';
import { calculateRelicBonuses, emptyRelicBonuses } from '../engine/sources/relic.js';
import { calculateMountBonuses } from '../engine/sources/mount.js';
import { calculateSigilBonuses } from '../engine/sources/sigilPassive.js';
import { calculateFortressBonuses } from '../engine/sources/fortress.js';
import { sigilBySpecies } from '../game/sigils.js';
import { transcendenceBoard } from '../game/transcendence.js';
import { boardKeyFor } from '../transcendence.js';
import { isMultiplierStat } from '../model/equipment.js';
import { effectiveTranscendencePreset, ancientActive, UNLOCK_LEVELS } from '../model/legality.js';

/** The fortress group -> the catalogue id that stands for it (each group counts once). */
const FORTRESS_ID = { TOP: 'TOP_1', BOTTOM: 'BOTTOM_1', CORE: 'CORE' };

/** The preset to build: the requested id, else the active one, else the first. */
export function resolvePreset(character, presetId) {
  const list = character?.presets ?? [];
  return list.find((p) => p.id === presetId) ?? list.find((p) => p.id === character?.activePresetId) ?? list[0] ?? null;
}

/** 'oblivion' realm -> the Oblivion set; otherwise the preset's chosen base set. */
export function equipSetKey(preset, realm = 'base') {
  return realm === 'oblivion' ? 'oblivion' : `set${preset?.equipmentSet === 2 ? 2 : 1}`;
}

/** Spec of the talent set a preset uses, or null. */
export function presetSpec(character, preset) {
  return character?.talentSets?.[preset?.talentSet === 1 ? 1 : 0]?.spec ?? null;
}

/** Stones socketed in a set (one entry per filled socket), resolved from the realm's pool. */
export function equippedStones(character, setKey) {
  const pool = setKey === 'oblivion' ? character.oblivionEnchantStones : character.enchantStones;
  const byId = new Map((pool ?? []).map((s) => [s.id, s]));
  const slots = character.equipment?.[setKey]?.enchantSlots ?? {};
  return Object.values(slots)
    .map((id) => (id ? byId.get(id) : null))
    .filter(Boolean)
    .map(withOblivionPower);
}

// The model never stores an OBLIVION_POWER row on a stone (the power is derived from quality and
// grade, stones.md §7), but engine/sources/stones.js only computes it for such a row, so add one.
function withOblivionPower(stone) {
  if (stone.type !== 'OBLIVION' || stone.stats.some((s) => s.type === 'OBLIVION_POWER')) return stone;
  return { ...stone, stats: [...stone.stats, { type: 'OBLIVION_POWER', value: 0 }] };
}

/** The Form sigil's spell object (formConfig for totals), for a Druid with an owned Form sigil. */
export function formConfigFor(character, preset, spec) {
  if (character.class !== 'MYSTIC' || spec !== 'MYSTIC_DRUID') return null;
  const species = preset?.utilitySigilSpecies;
  if (!species || !character.sigils?.owned?.[species]) return null;
  const def = sigilBySpecies(species);
  return def?.spellType === 'FORM' && def.spell?.form ? def.spell : null;
}

/**
 * Pet secondaries are persisted as the base roll in percent points for every stat, as the game
 * shows them (B3). The engine's Attack Speed, Crit Damage and Minion Attack Speed are multipliers,
 * so those three are divided by 100 here (stats.md §1.3).
 */
function petInput(character, preset) {
  const pet = preset?.petId ? (character.pets?.owned ?? []).find((p) => p.id === preset.petId) : null;
  if (!pet) return null;
  const altar = character.pets?.altar ?? { level: 1, tier: 1 };
  return {
    species: pet.species,
    altarLevel: altar.level,
    tier: altar.tier,
    secondaryStats: (pet.secondaries ?? []).map((s) => ({
      type: s.type,
      value: isMultiplierStat(s.type) ? s.value / 100 : s.value,
    })),
  };
}

/** The ridden mount plus the minor glyphs socketed on it (sealed glyphs add nothing). */
function mountInput(character, preset) {
  const mount = preset?.mountId ? (character.mounts ?? []).find((m) => m.id === preset.mountId) : null;
  if (!mount) return { mount: null, glyphs: [] };
  const byId = new Map((character.glyphs ?? []).map((g) => [g.id, g]));
  const glyphs = (mount.glyphs?.minor ?? []).map((id) => byId.get(id)).filter((g) => g && !g.sealed);
  return { mount, glyphs };
}

function transcendenceBoardFor(character, spec) {
  const key = boardKeyFor(character.class, spec);
  return key ? transcendenceBoard(key) : null;
}

/** The transcendence preset a build preset runs on, level gates applied (none below 55, no link below 58). */
export const transcendencePreset = effectiveTranscendencePreset;

/** Sum two StoneBonuses-shaped bundles key by key (relics ride in the stones argument). */
function addBundles(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** The sigil state calculateSigilBonuses reads (B5 hand-off). */
export function sigilState(character, preset, spec) {
  const druid = character.class === 'MYSTIC' && spec === 'MYSTIC_DRUID';
  const equipped = [...(preset?.sigilSpecies ?? []), preset?.ancientSigilSpecies].filter(Boolean);
  const utility = preset?.utilitySigilSpecies ?? null;
  return {
    ownedSigils: Object.entries(character.sigils?.owned ?? {}).map(([species, v]) => ({ species, level: v.level })),
    equippedSpecies: druid ? [] : equipped,
    druidEquippedSpecies: druid ? equipped : [],
    utilitySlotSpecies: druid ? null : utility,
    druidUtilitySlotSpecies: druid ? utility : null,
    altarTier: character.sigils?.altarTier ?? 1,
  };
}

/**
 * Everything calculateTotalStats needs for one preset.
 * @param {Object} character  a normalised v2 Character
 * @param {string} [presetId]  default: the active preset
 * @param {{realm?: 'base'|'oblivion'}} [opts]
 * @returns {{args: any[], ctx: {playerClass: string, formConfig: Object|null, activeSpec: string|null},
 *   preset: Object, setKey: string, spec: string|null, realm: string, formKind: 'BEAR'|'WOLF'|null,
 *   ancientDropped: boolean, warnings: string[]}}
 *   `args` is the 11 positional arguments before ctx: spread them with ctx as the twelfth.
 */
export function buildPresetInputs(character, presetId, { realm = 'base' } = {}) {
  const preset = resolvePreset(character, presetId);
  const cls = character.class;
  const spec = presetSpec(character, preset);
  const setKey = equipSetKey(preset, realm);
  const formConfig = formConfigFor(character, preset, spec);
  const formKind = formConfig?.form ?? null;

  const equipment = character.equipment?.[setKey]?.items ?? {};
  const talentSet = character.talentSets?.[preset?.talentSet === 1 ? 1 : 0];
  const talents = calculateTalentBonuses(spec, talentSet?.allocation);
  const tr = transcendencePreset(character, preset);
  const transcendence = calculateTranscendenceBonuses(tr?.allocatedNodeIds ?? [], transcendenceBoardFor(character, spec));
  const pet = calculatePetBonuses(petInput(character, preset));
  // Q3 strict: an Ancient counts only while the resolved board allocates its Transcendence sigil node.
  const ancientDropped = !!preset?.ancientSigilSpecies && !ancientActive(preset.ancientSigilSpecies, tr);
  const warnings = !ancientDropped
    ? []
    : tr
      ? [`${preset.ancientSigilSpecies} is not used: the Transcendence board does not unlock its sigil.`]
      : [`${preset.ancientSigilSpecies} is not used: Transcendence unlocks at level ${UNLOCK_LEVELS.TRANSCENDENCE}.`];
  const effective = ancientDropped ? { ...preset, ancientSigilSpecies: null } : preset;
  const sigils = calculateSigilBonuses(sigilState(character, effective, spec), cls, spec, formKind);
  const relics = (preset?.relicIds ?? [])
    .map((id) => ({ id, level: character.relics?.[id] ?? 0 }))
    .filter((r) => r.level > 0);
  const stones = addBundles(
    calculateStoneBonuses(equippedStones(character, setKey)),
    relics.length ? calculateRelicBonuses(relics) : emptyRelicBonuses(),
  );
  const awakening = calculateAwakeningBonuses(character.awakening, cls, spec);
  const fortress = calculateFortressBonuses(
    (character.fortress?.owned ?? []).map((g) => FORTRESS_ID[g]).filter(Boolean),
    cls,
  );
  const { mount, glyphs } = mountInput(character, preset);
  const mounts = calculateMountBonuses(mount, glyphs);

  const ctx = { playerClass: cls, formConfig, activeSpec: spec };
  return {
    // base, equipment, talents, pet, sigils, stones, awakening, a7, fortress, transcendence, mounts
    args: [character.baseResidual, equipment, talents, pet, sigils, stones, awakening, undefined, fortress, transcendence, mounts],
    ctx,
    preset,
    setKey,
    spec,
    realm,
    formKind,
    ancientDropped,
    warnings,
  };
}
