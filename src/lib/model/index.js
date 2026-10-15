/**
 * model/index.js - persisted model v2 entry point (rebuild-plan §3). Pure; imports L1 only.
 *
 * Roster    = { schemaVersion: 2, characters: Character[], currentId }
 * Character = core (character.js: id, name, class, level, baseResidual)
 *           + one slice per domain file (model/<d>.js, listed in DOMAINS below)
 *           + presets / activePresetId (presets.js)
 * The full field list is in rebuild-plan §3; this file only wires the pieces together.
 *
 * Domain files are stubs until their slice lands (§7.3). The dispatcher below never changes when
 * they do: each domain exposes default<D> / normalise<D> / migrate<D>FromV1 / reconcile<D>, all
 * trading in partial characters (see model/pets.js header).
 *
 * Normalisation order: core -> talents (so ctx.spec exists) -> every other domain -> presets ->
 * every domain's reconcile -> presets' reconcile. v1 migration: every domain's migrate first
 * (collecting idMaps), then migratePresetsFromV1 last, then normaliseCharacter.
 */
import { normaliseCore, defaultCore, newId } from './character.js';
import { defaultPresets, normalisePresets, reconcilePresets, migratePresetsFromV1, activeTalentSetIndex } from './presets.js';
import * as equipment from './equipment.js';
import * as stones from './stones.js';
import * as talents from './talents.js';
import * as pets from './pets.js';
import * as mounts from './mounts.js';
import * as glyphs from './glyphs.js';
import * as sigils from './sigils.js';
import * as relics from './relics.js';
import * as awakening from './awakening.js';
import * as transcendence from './transcendence.js';
import * as fortress from './fortress.js';
import * as skills from './skills.js';
import * as oblivion from './oblivion.js';
import * as drop from './drop.js';
import * as opponents from './opponents.js';
import * as runs from './runs.js';

export const SCHEMA_VERSION = 2;

/** Domain modules in normalisation order (talents first: it yields ctx.spec). */
export const DOMAINS = [
  { name: 'talents', mod: talents, P: 'Talents' },
  { name: 'equipment', mod: equipment, P: 'Equipment' },
  { name: 'stones', mod: stones, P: 'Stones' },
  { name: 'pets', mod: pets, P: 'Pets' },
  { name: 'mounts', mod: mounts, P: 'Mounts' },
  { name: 'glyphs', mod: glyphs, P: 'Glyphs' },
  { name: 'sigils', mod: sigils, P: 'Sigils' },
  { name: 'relics', mod: relics, P: 'Relics' },
  { name: 'awakening', mod: awakening, P: 'Awakening' },
  { name: 'transcendence', mod: transcendence, P: 'Transcendence' },
  { name: 'fortress', mod: fortress, P: 'Fortress' },
  { name: 'skills', mod: skills, P: 'Skills' },
  { name: 'oblivion', mod: oblivion, P: 'Oblivion' },
  { name: 'drop', mod: drop, P: 'Drop' },
  { name: 'opponents', mod: opponents, P: 'Opponents' },
  { name: 'runs', mod: runs, P: 'Runs' },
].map((d) => {
  const P = d.P;
  return {
    name: d.name,
    defaults: d.mod[`default${P}`],
    normalise: d.mod[`normalise${P}`],
    migrate: d.mod[`migrate${P}FromV1`],
    reconcile: d.mod[`reconcile${P}`],
  };
});

// --- Roster ---

export function emptyRoster() {
  return { schemaVersion: SCHEMA_VERSION, characters: [], currentId: null };
}

export function newRoster() {
  const c = newCharacter('Character 1');
  return { schemaVersion: SCHEMA_VERSION, characters: [c], currentId: c.id };
}

export function getCurrent(roster) {
  return roster.characters.find((c) => c.id === roster.currentId) || roster.characters[0] || null;
}

/** A pre-v2 save has no schemaVersion (the v1 key never wrote one). */
export function isV1Roster(raw) {
  return !!raw && typeof raw === 'object' && Array.isArray(raw.characters) && !(typeof raw.schemaVersion === 'number' && raw.schemaVersion >= SCHEMA_VERSION);
}

/**
 * Any parsed JSON -> a valid v2 Roster. Accepts v2 and v1 (the v1 shape is migrated). Unparseable
 * or character-less input gives the empty roster (the Welcome screen state).
 */
export function normaliseRoster(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.characters) || raw.characters.length === 0) {
    return emptyRoster();
  }
  const v1 = isV1Roster(raw);
  const seen = new Set();
  const characters = raw.characters
    .filter((c) => c && typeof c === 'object')
    .map((c) => (v1 ? migrateCharacterFromV1(c) : normaliseCharacter(c)))
    .map((c) => {
      if (seen.has(c.id)) c.id = newId();
      seen.add(c.id);
      return c;
    });
  if (characters.length === 0) return emptyRoster();
  const currentId = characters.some((c) => c.id === raw.currentId) ? raw.currentId : characters[0].id;
  return { schemaVersion: SCHEMA_VERSION, characters, currentId };
}

// --- Character ---

/** A fresh, fully-defaulted character. `cls` may be null (class chosen later). */
export function newCharacter(name = 'New Character', cls = null) {
  const c = { ...defaultCore(name, cls) };
  for (const d of DOMAINS) Object.assign(c, d.defaults());
  Object.assign(c, defaultPresets());
  return c;
}

/** Any object -> a valid v2 Character (fresh object; never trusts `raw`'s shape). */
export function normaliseCharacter(raw, { report = null } = {}) {
  const c = normaliseCore(raw);
  const ctx = { class: c.class, spec: null, report };
  const talentsFirst = DOMAINS[0];
  Object.assign(c, talentsFirst.normalise(raw, ctx));
  ctx.spec = c.talentSets?.[activeTalentSetIndex(raw)]?.spec ?? null;
  for (const d of DOMAINS.slice(1)) Object.assign(c, d.normalise(raw, ctx));
  Object.assign(c, normalisePresets(raw));
  return reconcileCharacter(c);
}

/** Cross-reference repair (plan §3 "reconcile"). Mutates and returns `character`. */
export function reconcileCharacter(character) {
  for (const d of DOMAINS) d.reconcile(character);
  return reconcilePresets(character);
}

/**
 * v1 Character -> v2 (best effort). Core fields: id, name, class (Warrior/Sentinel -> upper-case),
 * level 100. Then every domain's migrate collects {value, idMap}; migratePresetsFromV1 runs last
 * with the idMaps (contract steps 1-3), and the result goes through normaliseCharacter (step 3,
 * "reconcile runs afterwards"). Dropped for good: drop, opponents, runs, goals, linking, manual totals.
 */
export function migrateCharacterFromV1(v1) {
  const raw = { id: v1?.id, name: v1?.name, class: v1?.class, level: 100 };
  const idMaps = {};
  for (const d of DOMAINS) {
    const { value, idMap } = d.migrate(v1);
    Object.assign(raw, value);
    idMaps[d.name] = idMap ?? {};
  }
  Object.assign(raw, migratePresetsFromV1(v1, idMaps));
  return normaliseCharacter(raw);
}
