// model/merge.js - bring a game profile into an EXISTING character ("Update <name>", ia.md §3.2).
// Pure; imports sibling model files only.
//
// The profile is the game's state, so everything the game owns is replaced; everything the app owns
// is kept. Character-wide data the profile carries (class, level, both gear sets, stones, talents,
// pets, mounts, glyphs, sigils, relics, awakening, transcendence, skills, fortress, Oblivion) comes from
// the profile. Kept from the existing character: id, name, presets and the active preset (a preset only
// chooses sources, so references the new data no longer holds are repaired by normalisation), the
// base residual, saved opponents, run history and the Drop Check state. The server's stat sheet goes
// to the preset that is active now (the profile's live loadout is what the player wears now).
import { normaliseCharacter } from './index.js';

/** Fields the existing character keeps. Everything else is taken from the profile. */
export const KEPT_ON_UPDATE = Object.freeze(['id', 'name', 'presets', 'activePresetId', 'baseResidual', 'opponents', 'runs', 'drop']);

const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The base-realm sheet the profile carried: the sheet of whichever preset holds the live loadout. */
function profileSheet(incoming) {
  return incoming.presets.find((p) => p.sheet)?.sheet ?? null;
}

/**
 * @param {object} existing  a normalised character (left untouched)
 * @param {object} incoming  a normalised character made from a game profile
 * @param {{report?: object[]}} [opts]  receives what normalising the merged character dropped or defaulted
 * @returns {object} a new normalised character
 */
export function mergeProfileIntoCharacter(existing, incoming, { report } = {}) {
  const merged = {};
  for (const key of Object.keys(incoming)) {
    merged[key] = KEPT_ON_UPDATE.includes(key) ? clone(existing[key]) : clone(incoming[key]);
  }
  for (const key of KEPT_ON_UPDATE) if (!(key in merged)) merged[key] = clone(existing[key]);

  const target = merged.presets.find((p) => p.id === merged.activePresetId) ?? merged.presets[0];
  const sheet = profileSheet(incoming);
  if (target && sheet) target.sheet = clone(sheet);
  if (merged.oblivion?.sheet) merged.oblivion.sheet = target ? { ...merged.oblivion.sheet, presetId: target.id } : null;

  return normaliseCharacter(merged, { report });
}

const SETS = [
  ['set1', 'Set 1'],
  ['set2', 'Set 2'],
  ['oblivion', 'Oblivion set'],
];

const DOMAIN_LABELS = [
  ['talentSets', 'talents'],
  ['pets', 'pets'],
  ['mounts', 'mounts'],
  ['glyphs', 'glyphs'],
  ['sigils', 'sigils'],
  ['relics', 'relics'],
  ['awakening', 'awakening'],
  ['transcendence', 'transcendence'],
  ['skills', 'skills'],
  ['fortress', 'fortress'],
  ['oblivion', 'Oblivion'],
];

/**
 * What "Update" would change, in the form the dialog lists (ia.md §3.2: "gear changed in Set 1: 2 slots;
 * +3 stones; talents unchanged; sheet updated for preset Farm build").
 * @returns {{lines: string[], unchanged: boolean}}
 */
export function describeProfileUpdate(existing, incoming) {
  const lines = [];
  if (existing.class !== incoming.class) lines.push(`class ${existing.class ?? 'none'} to ${incoming.class}`);
  if (existing.level !== incoming.level) lines.push(`level ${existing.level} to ${incoming.level}`);
  for (const [key, label] of SETS) {
    const a = existing.equipment?.[key]?.items ?? {};
    const b = incoming.equipment?.[key]?.items ?? {};
    const slots = new Set([...Object.keys(a), ...Object.keys(b)]);
    let changed = 0;
    for (const slot of slots) if (!same(a[slot] ?? null, b[slot] ?? null)) changed++;
    if (changed) lines.push(`gear changed in ${label}: ${changed} slot${changed === 1 ? '' : 's'}`);
  }
  const stoneDelta = (incoming.enchantStones?.length ?? 0) - (existing.enchantStones?.length ?? 0);
  if (stoneDelta) lines.push(`${stoneDelta > 0 ? '+' : ''}${stoneDelta} stone${Math.abs(stoneDelta) === 1 ? '' : 's'}`);
  else if (!same(existing.enchantStones, incoming.enchantStones)) lines.push('stones changed');
  for (const [key, label] of DOMAIN_LABELS) {
    if (!same(existing[key], incoming[key])) lines.push(`${label} changed`);
  }
  const sheet = profileSheet(incoming);
  if (sheet) {
    const target = existing.presets.find((p) => p.id === existing.activePresetId) ?? existing.presets[0];
    if (target) lines.push(`sheet updated for preset ${target.name}`);
  }
  return { lines, unchanged: lines.length === 0 };
}
