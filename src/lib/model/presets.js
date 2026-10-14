// Presets (M1). Shape: rebuild-plan §3 (Preset), migration contract steps 2-3.
// Presets are the only model domain that references other domains (pets, mounts, relics, sigils,
// transcendence), so cross-references are validated in `reconcilePresets` and remapped from v1 in
// `migratePresetsFromV1` - the domain slices never edit this file.
import { newId, normaliseSheet } from './character.js';

export const MIN_PRESETS = 2;
export const MAX_PRESETS = 8;
export const PRESET_RELIC_CAP = 4; // 2 base + 2 extra (B6a)
export const PRESET_SIGIL_CAP = 3; // generic sigils; utility + Ancient are separate fields

export function newPreset(name = 'Preset', { equipmentSet = 1, talentSet = 0 } = {}) {
  return {
    id: newId('p'),
    name,
    equipmentSet, // 1 | 2 (character.equipment.set1 / set2)
    talentSet, // 0 | 1 (character.talentSets index)
    petId: null,
    mountId: null,
    relicIds: [],
    sigilSpecies: [],
    utilitySigilSpecies: null,
    ancientSigilSpecies: null,
    sigilConditions: {},
    transcendencePresetId: null,
    sheet: null,
  };
}

export function defaultPresets() {
  const a = newPreset('Preset 1', { equipmentSet: 1, talentSet: 0 });
  const b = newPreset('Preset 2', { equipmentSet: 2, talentSet: 1 });
  return { presets: [a, b], activePresetId: a.id };
}

const str = (v) => (typeof v === 'string' && v ? v : null);
const strList = (v, cap) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && x))].slice(0, cap) : []);

function normalisePreset(raw, index) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const base = newPreset(typeof r.name === 'string' && r.name.trim() ? r.name.trim() : `Preset ${index + 1}`);
  if (str(r.id)) base.id = r.id;
  base.equipmentSet = r.equipmentSet === 2 ? 2 : 1;
  base.talentSet = r.talentSet === 1 ? 1 : 0;
  base.petId = str(r.petId);
  base.mountId = str(r.mountId);
  base.relicIds = strList(r.relicIds, PRESET_RELIC_CAP);
  base.sigilSpecies = strList(r.sigilSpecies, PRESET_SIGIL_CAP);
  base.utilitySigilSpecies = str(r.utilitySigilSpecies);
  base.ancientSigilSpecies = str(r.ancientSigilSpecies);
  const conds = {};
  if (r.sigilConditions && typeof r.sigilConditions === 'object') {
    for (const [sp, cond] of Object.entries(r.sigilConditions)) if (typeof cond === 'string' && cond) conds[sp] = cond;
  }
  base.sigilConditions = conds;
  base.transcendencePresetId = str(r.transcendencePresetId);
  base.sheet = normaliseSheet(r.sheet);
  return base;
}

/** -> { presets (2..8, unique ids), activePresetId }. Cross-references are left for reconcile. */
export function normalisePresets(rawCharacter) {
  const rawList = Array.isArray(rawCharacter?.presets) ? rawCharacter.presets : [];
  const seen = new Set();
  const presets = rawList.slice(0, MAX_PRESETS).map((p, i) => {
    const n = normalisePreset(p, i);
    if (seen.has(n.id)) n.id = newId('p');
    seen.add(n.id);
    return n;
  });
  while (presets.length < MIN_PRESETS) {
    const i = presets.length;
    presets.push(newPreset(`Preset ${i + 1}`, { equipmentSet: i % 2 === 0 ? 1 : 2, talentSet: i % 2 }));
  }
  const active = presets.some((p) => p.id === rawCharacter?.activePresetId) ? rawCharacter.activePresetId : presets[0].id;
  return { presets, activePresetId: active };
}

/** Index (0|1) of the talent set the active preset uses, from a raw character. Feeds ctx.spec. */
export function activeTalentSetIndex(rawCharacter) {
  const list = Array.isArray(rawCharacter?.presets) ? rawCharacter.presets : [];
  const p = list.find((x) => x?.id === rawCharacter?.activePresetId) ?? list[0];
  return p?.talentSet === 1 ? 1 : 0;
}

/**
 * Cross-reference repair, run after every domain has normalised (plan §3 "reconcile"). Mutates.
 * Domain-specific legality (is this relic legal for the class? is this sigil unlocked?) belongs
 * to the domain's own reconcile; this only checks that the referenced objects exist.
 */
export function reconcilePresets(character) {
  const petIds = new Set((character.pets?.owned ?? []).map((p) => p.id));
  const mountIds = new Set((character.mounts ?? []).map((m) => m.id));
  const trIds = new Set((character.transcendence?.presets ?? []).map((p) => p.id));
  for (const p of character.presets) {
    if (p.petId && !petIds.has(p.petId)) p.petId = null;
    if (p.mountId && !mountIds.has(p.mountId)) p.mountId = null;
    if (p.transcendencePresetId && !trIds.has(p.transcendencePresetId)) p.transcendencePresetId = null;
    const used = new Set([...p.sigilSpecies, p.utilitySigilSpecies, p.ancientSigilSpecies].filter(Boolean));
    for (const sp of Object.keys(p.sigilConditions)) if (!used.has(sp)) delete p.sigilConditions[sp];
  }
  return character;
}

/**
 * v1 presets -> v2 presets, using the id maps the domain migrations returned (plan §3 contract
 * step 3). Unmapped ids become null / are dropped. `idMaps.transcendence['*']` (or a per-preset
 * key) names the transcendence preset every migrated preset should use.
 * @returns {{presets: object[], activePresetId: string}}
 */
export function migratePresetsFromV1(v1Character, idMaps = {}) {
  const list = Array.isArray(v1Character?.presets) ? v1Character.presets.filter((p) => p && typeof p === 'object') : [];
  if (list.length === 0) return defaultPresets();
  const map = (domain, id) => (typeof id === 'string' ? idMaps?.[domain]?.[id] ?? null : null);
  const mapList = (domain, ids, cap) =>
    strList(
      (Array.isArray(ids) ? ids : []).map((id) => map(domain, id)),
      cap,
    );
  const presets = list.slice(0, MAX_PRESETS).map((v1, i) => {
    const p = newPreset(typeof v1.name === 'string' && v1.name.trim() ? v1.name.trim() : `Preset ${i + 1}`, {
      equipmentSet: v1.loadout === 1 ? 2 : 1,
      talentSet: v1.talentSet === 1 ? 1 : 0,
    });
    if (str(v1.id)) p.id = v1.id;
    p.petId = map('pets', v1.petId);
    p.mountId = map('mounts', v1.mountId);
    p.relicIds = mapList('relics', v1.relicIds, PRESET_RELIC_CAP);
    p.sigilSpecies = mapList('sigils', v1.sigilIds, PRESET_SIGIL_CAP);
    p.transcendencePresetId = map('transcendence', v1.id) ?? map('transcendence', '*');
    return p;
  });
  const wanted = v1Character.activePresetId;
  const activePresetId = presets.some((p) => p.id === wanted) ? wanted : presets[0].id;
  return { presets, activePresetId };
}
