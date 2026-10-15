// model/merge.js - bring a game profile into an EXISTING character ("Update <name>", ia.md §3.2).
// Pure; imports sibling model files only.
//
// The profile is the game's state, so everything the game owns is replaced; everything the app owns
// is kept. Character-wide data the profile carries (class, level, both gear sets, stones, talents,
// pets, mounts, glyphs, sigils, relics, awakening, transcendence, skills, fortress, Oblivion) comes from
// the profile. Kept from the existing character: id, name, the base residual, saved opponents, run
// history and the Drop Check state. Presets are merged (mergePresets; rule in data-model.md §7.1).
import { normaliseCharacter } from './index.js';
import { MAX_PRESETS } from './presets.js';

/** Fields the existing character keeps. `presets` / `activePresetId` are merged; everything else comes from the profile. */
export const KEPT_ON_UPDATE = Object.freeze(['id', 'name', 'baseResidual', 'opponents', 'runs', 'drop']);

/** Preset fields the game owns: everything but the id and the sheet. */
const GAME_PRESET_FIELDS = ['name', 'equipmentSet', 'talentSet', 'petId', 'mountId', 'relicIds', 'sigilSpecies', 'utilitySigilSpecies', 'ancientSigilSpecies', 'transcendencePresetId'];

const clone = (v) => JSON.parse(JSON.stringify(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The base-realm sheet the profile carried: the sheet of whichever preset holds the live loadout. */
function profileSheet(incoming) {
  return incoming.presets.find((p) => p.sheet)?.sheet ?? null;
}

/** The incoming preset that holds the live loadout: the sheet's owner (base, else Oblivion), else the game's selected one. */
function liveIdOf(incoming) {
  return incoming.presets.find((p) => p.sheet)?.id ?? incoming.oblivion?.sheet?.presetId ?? incoming.activePresetId;
}

/** Chooses nothing beyond its gear and talent set and holds no sheet: the two-preset padding, or a preset never filled in. */
const holdsNothing = (p) =>
  !p.petId && !p.mountId && !p.relicIds?.length && !p.sigilSpecies?.length && !p.utilitySigilSpecies && !p.ancientSigilSpecies && !p.transcendencePresetId && !p.sheet;

/**
 * The profile's presets laid over the existing ones (data-model.md §7.1). A game preset updates the app
 * preset with its id (name and choices; the saved sheet stays). One with no match fills an app preset the
 * game does not know that holds nothing (the padding), taking the game's id, else is appended up to
 * MAX_PRESETS. An unmatched incoming preset that holds nothing is not brought over: it cannot be told apart
 * from the padding normalisation adds to a one-preset profile. App-only presets are kept. The live preset
 * takes the profile's sheet, and the game's selected preset becomes the active one.
 * @returns {{presets: object[], activePresetId: string, liveId: string|null, changes: string[], dropped: string[]}}
 */
function mergePresets(existing, incoming) {
  const presets = clone(existing.presets);
  const gameIds = new Set(incoming.presets.map((p) => p.id));
  const free = presets.filter((p) => !gameIds.has(p.id) && holdsNothing(p));
  const changes = [];
  const dropped = [];
  for (const g of incoming.presets) {
    let target = presets.find((p) => p.id === g.id);
    if (target) {
      if (target.name !== g.name) changes.push(`preset ${target.name} renamed ${g.name}`);
      if (GAME_PRESET_FIELDS.some((k) => k !== 'name' && !same(target[k], g[k]))) changes.push(`preset ${g.name} changed`);
    } else if (holdsNothing(g)) {
      continue;
    } else if ((target = free.shift())) {
      changes.push(`preset ${target.name} becomes ${g.name}`);
      target.id = g.id;
    } else if (presets.length < MAX_PRESETS) {
      target = { ...clone(g), sheet: null };
      presets.push(target);
      changes.push(`preset ${g.name} added`);
    } else {
      dropped.push(g.name);
      continue;
    }
    for (const k of GAME_PRESET_FIELDS) target[k] = clone(g[k]);
  }
  const worn = liveIdOf(incoming);
  const liveId = presets.some((p) => p.id === worn) ? worn : null;
  const activePresetId = presets.some((p) => p.id === incoming.activePresetId) ? incoming.activePresetId : existing.activePresetId;
  return { presets, activePresetId, liveId, changes, dropped };
}

/**
 * @param {object} existing  a normalised character (left untouched)
 * @param {object} incoming  a normalised character made from a game profile
 * @param {{report?: object[]}} [opts]  receives what normalising the merged character dropped or defaulted,
 *   plus a `dropped` presets entry when the game has more presets than the app can hold
 * @returns {object} a new normalised character
 */
export function mergeProfileIntoCharacter(existing, incoming, { report } = {}) {
  const merged = {};
  for (const key of Object.keys(incoming)) {
    merged[key] = KEPT_ON_UPDATE.includes(key) ? clone(existing[key]) : clone(incoming[key]);
  }
  for (const key of KEPT_ON_UPDATE) if (!(key in merged)) merged[key] = clone(existing[key]);

  const { presets, activePresetId, liveId, dropped } = mergePresets(existing, incoming);
  merged.presets = presets;
  merged.activePresetId = activePresetId;
  if (dropped.length) report?.push({ kind: 'dropped', what: 'presets', count: dropped.length, reason: `the app holds at most ${MAX_PRESETS}` });
  const live = presets.find((p) => p.id === liveId);
  const sheet = profileSheet(incoming);
  if (live && sheet) live.sheet = clone(sheet);
  if (merged.oblivion?.sheet) merged.oblivion.sheet = live ? { ...merged.oblivion.sheet, presetId: live.id } : null;

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
  const { presets, liveId, changes, dropped } = mergePresets(existing, incoming);
  lines.push(...changes);
  if (dropped.length) lines.push(`not added (the app holds at most ${MAX_PRESETS} presets): ${dropped.join(', ')}`);
  const live = presets.find((p) => p.id === liveId);
  if (live && profileSheet(incoming)) lines.push(`sheet updated for preset ${live.name}`);
  return { lines, unchanged: lines.length === 0 };
}
