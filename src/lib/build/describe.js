// build/describe.js (C1a): a display-ready description of a build, one { label, value } line per
// dimension (replaces buildConfig.js). THE INVARIANT carries over: every name is resolved to plain
// text at call time, so a saved run keeps reading correctly after renames, deletions or class changes.
// The label set and order are fixed so two builds diff line by line (B1, plan #91); `value` lists
// only what the Fighter runs, and what is set but ignored goes in `inactive` (plan I2, #81).
import { specsForClass } from '../game/classes.js';
import { talentSpec } from '../game/talents.js';
import { relicById } from '../game/relics.js';
import { petText, mountText, glyphText } from './statText.js';
import { sigilBySpecies, isSigilSpeciesActiveForSpec } from '../game/sigils.js';
import { mountGlyphLoadout, activeMajorGlyphs } from '../model/mounts.js';
import { glyphTypeInfo } from '../model/glyphs.js';
import { DEFAULT_CONDITION, SIGIL_CONDITIONS_LEVEL, conditionLabel } from '../model/sigils.js';
import { ancientActive } from '../model/legality.js';
import { presetSpec, equipSetKey, resolvePreset, transcendencePreset } from './presetInputs.js';

const NONE = 'None';
const join = (list) => (list.length ? list.join(', ') : NONE);
const sigilName = (species) => sigilBySpecies(species)?.name ?? species;
const owns = (character, sp) => !!character.sigils?.owned?.[sp] && !!sigilBySpecies(sp);

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

/** A line from items { name, reason|null }: the running ones are the value, the rest are `inactive`. */
function itemsLine(label, items) {
  const off = items.filter((i) => i.reason).map((i) => `${i.name} (${i.reason})`);
  return { label, value: join(items.filter((i) => !i.reason).map((i) => i.name)), ...(off.length ? { inactive: off.join(', ') } : {}) };
}

/**
 * @param {Object} character  a normalised v2 Character
 * @param {Object|string} presetOrId  a preset, a preset-shaped candidate, or a preset id
 * @param {{realm?: 'base'|'oblivion', talentAllocation?: Object<string, number>}} [opts]
 *   `talentAllocation` overrides the talent set's allocation (optimiser candidates)
 * @returns {{label: string, value: string, inactive?: string}[]}  the same labels in the same order for
 *   every build ('None' when empty)
 */
export function describeBuild(character, presetOrId, { realm = 'base', talentAllocation } = {}) {
  const preset = typeof presetOrId === 'string' || presetOrId == null ? resolvePreset(character, presetOrId) : presetOrId;
  const cls = character.class;
  const spec = presetSpec(character, preset);
  const setKey = equipSetKey(preset, realm);
  const line = (label, value) => ({ label, value });
  const lines = [];
  lines.push(line('Gear set', setKey === 'oblivion' ? 'Oblivion set' : `Set ${preset.equipmentSet === 2 ? 2 : 1}`));
  lines.push(line('Talents', talentsLine(character, preset, talentAllocation)));

  const pet = preset.petId ? (character.pets?.owned ?? []).find((p) => p.id === preset.petId) : null;
  lines.push(line('Pet', pet ? petText(character, pet) : NONE));

  // Sigils the Fighter runs: owned, usable on the spec, and an Ancient only while the board allocates its node.
  const tr = transcendencePreset(character, preset);
  // "Usable" is the rule the engine applies to the Fighter's sigils (game/sigils.js), not a second list.
  const usable = { has: (sp) => isSigilSpeciesActiveForSpec(sp, cls, spec) };
  const item = (sp, ok, extra = null) => {
    if (!sp) return null;
    const reason = !owns(character, sp) ? 'not owned' : ok && !ok.has(sp) ? `not usable on ${spec ?? 'this spec'}` : extra;
    return { sp, name: sigilName(sp), reason };
  };
  const generic = (preset.sigilSpecies ?? []).map((sp) => item(sp, usable));
  const utility = item(preset.utilitySigilSpecies, usable);
  const ancient = item(preset.ancientSigilSpecies, null, ancientActive(preset.ancientSigilSpecies, tr) ? null : 'Transcendence board lacks its node');
  const equipped = [...generic, utility, ancient].filter((s) => s && !s.reason).map((s) => s.sp);

  const mount = preset.mountId ? (character.mounts ?? []).find((m) => m.id === preset.mountId) : null;
  lines.push(line('Mount', mount ? mountText(character, mount) : NONE));
  const loadout = mount ? mountGlyphLoadout(character, mount, spec) : { minors: [], mythics: [] };
  const typeName = (t) => glyphTypeInfo(t)?.name ?? t;
  const glyphName = (g) => `${typeName(g.glyphType)} (${g.rarity})`;
  // Each minor socket's glyph instance, named by statText (never the raw stat key, backlog §6).
  const byId = new Map((character.glyphs ?? []).map((g) => [g.id, g]));
  const minors = mount ? mount.glyphs.minor.map((id) => byId.get(id)).filter((g) => g && !g.sealed && g.secondary) : [];
  lines.push(line('Minor glyphs', join(minors.map((g) => glyphText(character, g)))));
  const { active, inert } = activeMajorGlyphs(character, mount, spec, equipped);
  lines.push(itemsLine('Major glyphs', [
    ...active.map((g) => ({ name: glyphName(g), reason: null })),
    ...inert.map((g) => ({ name: glyphName(g), reason: 'sigil is not equipped' })),
  ]));
  lines.push(line('Mythic glyph', join(loadout.mythics.map(glyphName))));

  lines.push(itemsLine('Relics', (preset.relicIds ?? []).map((id) => ({ name: relicById(id)?.name ?? id, reason: character.relics?.[id] > 0 ? null : 'not owned' }))));
  lines.push(itemsLine('Sigils', generic));
  lines.push(itemsLine('Utility sigil', utility ? [utility] : []));
  lines.push(itemsLine('Ancient sigil', ancient ? [ancient] : []));

  // Conditions the Fighter applies: only from the level gate on, and never the default (fighter.js).
  const cond = (sp) => character.sigils.owned[sp].condition;
  const gated = (character.level ?? 100) >= SIGIL_CONDITIONS_LEVEL;
  const conds = gated ? equipped.filter((sp) => cond(sp) && cond(sp) !== DEFAULT_CONDITION).map((sp) => `${sigilName(sp)}: ${conditionLabel(cond(sp))}`) : [];
  lines.push(line('Conditions', join(conds)));

  lines.push(line('Transcendence', tr ? `${tr.name} (${tr.allocatedNodeIds.length} nodes)` : NONE));
  return lines;
}
