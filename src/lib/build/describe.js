// build/describe.js (C1a): a display-ready description of a build, one { label, value } line per
// dimension (replaces buildConfig.js). THE INVARIANT carries over: every name is resolved to plain
// text at call time, so a saved run keeps reading correctly after renames, deletions or class changes.
import { specsForClass } from '../game/classes.js';
import { talentSpec } from '../game/talents.js';
import { relicById } from '../game/relics.js';
import { petDisplayName } from '../game/pets.js';
import { mountBySpecies } from '../game/mountsGlyphs.js';
import { sigilBySpecies } from '../game/sigils.js';
import { mountGlyphLoadout } from '../model/mounts.js';
import { glyphTypeInfo } from '../model/glyphs.js';
import { presetSpec, equipSetKey, resolvePreset, transcendencePreset } from './presetInputs.js';

const NONE = 'None';
const join = (list) => (list.length ? list.join(', ') : NONE);

function talentsLine(character, preset, allocation) {
  const spec = presetSpec(character, preset);
  const label = spec ? specsForClass(character.class).find((s) => s.key === spec)?.name ?? spec : 'No spec';
  const alloc = allocation ?? character.talentSets?.[preset.talentSet === 1 ? 1 : 0]?.allocation ?? {};
  const names = [];
  for (const tier of talentSpec(spec)?.tiers ?? []) {
    for (const t of tier.talents) if (alloc[t.id] > 0) names.push(`${t.name} ${alloc[t.id]}/${t.maxRank}`);
  }
  return names.length ? `${label} - ${names.join(', ')}` : label;
}

function sigilName(preset, species) {
  const name = sigilBySpecies(species)?.name ?? species;
  const cond = preset.sigilConditions?.[species];
  return cond ? `${name} (${cond})` : name;
}

/**
 * @param {Object} character  a normalised v2 Character
 * @param {Object|string} presetOrId  a preset, a preset-shaped candidate, or a preset id
 * @param {{realm?: 'base'|'oblivion', talentAllocation?: Object<string, number>}} [opts]
 *   `talentAllocation` overrides the talent set's allocation (optimiser candidates)
 * @returns {{label: string, value: string}[]}
 */
export function describeBuild(character, presetOrId, { realm = 'base', talentAllocation } = {}) {
  const preset = typeof presetOrId === 'string' || presetOrId == null ? resolvePreset(character, presetOrId) : presetOrId;
  const lines = [];
  const setKey = equipSetKey(preset, realm);
  lines.push({ label: 'Gear', value: setKey === 'oblivion' ? 'Oblivion set' : `Set ${preset.equipmentSet === 2 ? 2 : 1}` });
  lines.push({ label: 'Talents', value: talentsLine(character, preset, talentAllocation) });

  const pet = preset.petId ? (character.pets?.owned ?? []).find((p) => p.id === preset.petId) : null;
  lines.push({
    label: 'Pet',
    value: pet ? petDisplayName(pet.species, (character.pets?.altar?.tier ?? 1) >= 2) ?? pet.species : NONE,
  });

  lines.push({ label: 'Relics', value: join((preset.relicIds ?? []).map((id) => relicById(id)?.name ?? id)) });

  const generic = (preset.sigilSpecies ?? []).map((sp) => sigilName(preset, sp));
  lines.push({ label: 'Sigils', value: join(generic) });
  if (preset.utilitySigilSpecies) lines.push({ label: 'Utility sigil', value: sigilName(preset, preset.utilitySigilSpecies) });
  if (preset.ancientSigilSpecies) lines.push({ label: 'Ancient sigil', value: sigilName(preset, preset.ancientSigilSpecies) });

  const mount = preset.mountId ? (character.mounts ?? []).find((m) => m.id === preset.mountId) : null;
  lines.push({ label: 'Mount', value: mount ? `${mountBySpecies(mount.species)?.name ?? mount.species} (level ${mount.level})` : NONE });
  const majors = mount ? mountGlyphLoadout(character, mount, presetSpec(character, preset)).majors : [];
  lines.push({
    label: 'Major glyphs',
    value: join(majors.map((g) => `${glyphTypeInfo(g.glyphType)?.name ?? g.glyphType} (${g.rarity})`)),
  });

  const tr = transcendencePreset(character, preset);
  lines.push({ label: 'Transcendence', value: tr ? `${tr.name} (${tr.allocatedNodeIds.length} nodes)` : NONE });
  return lines;
}
