// model/legality.js - the game's progression and loadout gates as pure functions (redesign plan A.4, M1).
// Shared by normalisation, the build layer, the UI and the optimiser, so a gate is written once.
// Imports L1 and sibling model files only. Facts: Reference/Game/{talents,relics,awakening,sigils,classes}.md.
import { TALENT_CONSTANTS } from '../game/talents.js';
import { AWAKENING_CONSTANTS } from '../game/awakening.js';
import { sigilBySpecies, utilitySlotSpellType } from '../game/sigils.js';
import { sigilUnlockLevel } from '../game/classes.js';
import {
  maxSigilSlots,
  isFormSigil,
  genericSigils,
  utilitySigils,
  ancientSigils,
  sigilConditionOptions,
  DEFAULT_CONDITION,
  SIGIL_CONDITIONS_LEVEL,
  EVOLVE_TIER_CAP,
} from './sigils.js';

export { isFormSigil };

/** UNLOCK_LEVELS (classes.md §3, L668649); sigils unlock per class, see `sigilsUnlocked`. */
export const UNLOCK_LEVELS = {
  TALENTS: 15,
  RELICS: 22,
  DUAL_EQUIP: 28,
  DUAL_TALENTS: 38,
  MOUNTS: 40,
  AWAKENING: 45,
  CONDITIONS: SIGIL_CONDITIONS_LEVEL,
  TRANSCENDENCE: 55,
  TRANSCENDENCE_PRESETS: 58,
};

/** Relic slots: BASE_SLOTS 2 + min(extraSlotsPurchased, MAX_EXTRA_SLOTS 2) (relics.md, L1142530-1142573). */
export const RELIC_BASE_SLOTS = 2;
export const RELIC_MAX_EXTRA_SLOTS = 2;

const lvl = (level) => (Number.isFinite(level) ? level : 100);

/** Talent points the level grants: one per level from 15, 29 in all (talents.md §3, L1096580-1096620). */
export function talentPointsForLevel(level) {
  const L = lvl(level);
  if (L < UNLOCK_LEVELS.TALENTS) return 0;
  const total = TALENT_CONSTANTS.totalTalentPoints;
  return Math.min(total, L - (UNLOCK_LEVELS.TALENTS - 1));
}

/** Relic slots a preset may fill: 0 below level 22, else 2 + purchased extras (0-2). */
export function relicSlotCap(level, extraSlotsPurchased = RELIC_MAX_EXTRA_SLOTS) {
  if (lvl(level) < UNLOCK_LEVELS.RELICS) return 0;
  const extra = Math.max(0, Math.min(RELIC_MAX_EXTRA_SLOTS, Math.floor(Number(extraSlotsPurchased)) || 0));
  return RELIC_BASE_SLOTS + extra;
}

/** Generic sigil slots the level unlocks for the class (getMaxSigilSlots). */
export const sigilSlotCap = maxSigilSlots;

/** Awakening points the level can have spent: one per level from 45 to 59 (awakening.md §1). */
export function awakeningPointsForLevel(level) {
  const L = lvl(level);
  if (L < UNLOCK_LEVELS.AWAKENING) return 0;
  return Math.max(0, Math.min(L, AWAKENING_CONSTANTS.maxPointLevel) - (AWAKENING_CONSTANTS.firstPointLevel - 1));
}

export const dualEquipUnlocked = (level) => lvl(level) >= UNLOCK_LEVELS.DUAL_EQUIP;
export const dualTalentsUnlocked = (level) => lvl(level) >= UNLOCK_LEVELS.DUAL_TALENTS;
export const mountsUnlocked = (level) => lvl(level) >= UNLOCK_LEVELS.MOUNTS;
export const conditionsUnlocked = (level) => lvl(level) >= UNLOCK_LEVELS.CONDITIONS;
export const transcendenceUnlocked = (level) => lvl(level) >= UNLOCK_LEVELS.TRANSCENDENCE;
export const sigilsUnlocked = (level, cls) => lvl(level) >= sigilUnlockLevel(cls);

/** The transcendence preset a build preset uses: its own link, else 'default', else the first. */
export function resolveTranscendencePreset(character, preset) {
  const list = character?.transcendence?.presets ?? [];
  return list.find((p) => p.id === preset?.transcendencePresetId) ?? list.find((p) => p.id === 'default') ?? list[0] ?? null;
}

/**
 * Is the Ancient sigil granted by the allocated board? Strict rule (Q3, sigils.md §9): it needs its
 * Transcendence sigil node allocated on the board the preset resolves to. `board` is a transcendence
 * preset ({allocatedNodeIds}) or a plain id list.
 */
export function ancientActive(species, board) {
  if (!species) return false;
  const node = sigilBySpecies(species)?.transcendenceNode;
  if (!node) return false;
  const ids = Array.isArray(board) ? board : board?.allocatedNodeIds ?? [];
  return ids.includes(node);
}

/**
 * Every gate a preset breaks, as {gate, field, detail}. Normalisation repairs most of these
 * silently; this lists them for the UI and for the optimiser's baseline check. `warn: true` marks
 * advisory entries (the game or the build ignores the value but nothing is dropped).
 */
export function checkPreset(character, preset) {
  const out = [];
  const add = (gate, field, detail, warn = false) => out.push(warn ? { gate, field, detail, warn } : { gate, field, detail });
  if (!character || !preset) return out;
  const L = lvl(character.level);
  const cls = character.class;
  const spec = character.talentSets?.[preset.talentSet === 1 ? 1 : 0]?.spec ?? null;

  if (preset.equipmentSet === 2 && !dualEquipUnlocked(L)) add('dualEquip', 'equipmentSet', `Equipment set 2 unlocks at level ${UNLOCK_LEVELS.DUAL_EQUIP}`);
  if (preset.talentSet === 1 && !dualTalentsUnlocked(L)) add('dualTalents', 'talentSet', `Talent set 2 unlocks at level ${UNLOCK_LEVELS.DUAL_TALENTS}`);
  if (preset.mountId && !mountsUnlocked(L)) add('mounts', 'mountId', `Mounts unlock at level ${UNLOCK_LEVELS.MOUNTS}`);
  if (preset.transcendencePresetId && !transcendenceUnlocked(L)) {
    add('transcendence', 'transcendencePresetId', `Transcendence unlocks at level ${UNLOCK_LEVELS.TRANSCENDENCE}`);
  }

  const cap = relicSlotCap(L, character.extraRelicSlots);
  if ((preset.relicIds ?? []).length > cap) add('relicSlots', 'relicIds', `${preset.relicIds.length} relics equipped, ${cap} slots`);
  for (const id of preset.relicIds ?? []) if (!(character.relics?.[id] > 0)) add('relicOwned', 'relicIds', `Relic ${id} is not owned`);

  const slots = sigilSlotCap(L, cls);
  if ((preset.sigilSpecies ?? []).length > slots) add('sigilSlots', 'sigilSpecies', `${preset.sigilSpecies.length} sigils equipped, ${slots} slots`);
  const owned = character.sigils?.owned ?? {};
  const equipped = [...(preset.sigilSpecies ?? []), preset.utilitySigilSpecies, preset.ancientSigilSpecies].filter(Boolean);
  for (const sp of equipped) if (!owned[sp]) add('sigilOwned', 'sigilSpecies', `Sigil ${sp} is not owned`);
  if (preset.utilitySigilSpecies) {
    if (!utilitySlotSpellType(cls, spec)) add('utilityKind', 'utilitySigilSpecies', 'This spec has no utility slot');
    else if (!utilitySigils(cls, spec).some((s) => s.species === preset.utilitySigilSpecies)) {
      add('utilityKind', 'utilitySigilSpecies', `${preset.utilitySigilSpecies} does not fit the utility slot for ${spec ?? 'this spec'}`);
    }
  }
  for (const sp of preset.sigilSpecies ?? []) {
    if (!genericSigils(cls, spec).some((s) => s.species === sp)) add('sigilSpec', 'sigilSpecies', `${sp} is not usable on ${spec ?? 'this spec'}`);
  }
  const anc = preset.ancientSigilSpecies;
  if (anc) {
    if (!ancientSigils(cls).some((s) => s.species === anc)) add('ancientClass', 'ancientSigilSpecies', `${anc} is not an Ancient of this class`);
    else if (!ancientActive(anc, resolveTranscendencePreset(character, preset))) {
      add('ancientBoard', 'ancientSigilSpecies', `${anc} needs its Transcendence sigil node allocated on the board; it is ignored until then`, true);
    }
  }
  for (const sp of equipped) {
    const cond = owned[sp]?.condition;
    if (!cond || cond === DEFAULT_CONDITION) continue;
    if (!conditionsUnlocked(L)) add('conditions', 'sigilConditions', `Activation conditions unlock at level ${UNLOCK_LEVELS.CONDITIONS}`, true);
    else if (!sigilConditionOptions(sp, spec).includes(cond)) add('conditionOption', 'sigilConditions', `${cond} is not available for ${sp} on ${spec ?? 'this spec'}`);
  }
  if ((character.sigils?.altarTier ?? 1) > EVOLVE_TIER_CAP) {
    add('altarTier', 'altarTier', `The Sigil Altar can only be evolved to tier ${EVOLVE_TIER_CAP}`, true);
  }
  return out;
}

/**
 * What changing the level to `newLevel` would drop, for the confirm dialog (ia.md §4.1).
 * `normalise` is normaliseCharacter, injected because model/index.js imports this file.
 */
export function previewLevelChange(character, newLevel, normalise) {
  const snapshot = JSON.parse(JSON.stringify(character));
  snapshot.level = newLevel;
  const after = normalise(snapshot);
  const spent = (c) => (c.talentSets ?? []).reduce((n, s) => n + Object.values(s.allocation ?? {}).reduce((a, b) => a + b, 0), 0);
  const equippedOf = (c) => c.presets.flatMap((p) => [...p.sigilSpecies, p.utilitySigilSpecies, p.ancientSigilSpecies].filter(Boolean).map((sp) => `${p.id}:${sp}`));
  const kept = new Set(equippedOf(after));
  const relicCount = (c) => c.presets.reduce((n, p) => n + p.relicIds.length, 0);
  return {
    level: after.level,
    talentPointsLost: Math.max(0, spent(character) - spent(after)),
    sigilsDropped: equippedOf(character).filter((k) => !kept.has(k)),
    relicsDropped: Math.max(0, relicCount(character) - relicCount(after)),
    awakeningPointsLost: Math.max(0, (character.awakening?.level ?? 0) - (after.awakening?.level ?? 0)),
  };
}
