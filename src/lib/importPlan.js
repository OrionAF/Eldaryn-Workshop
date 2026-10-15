/**
 * importPlan.js - G3 kind detection and the dry run behind the import report (ia.md §3.1, §5.4).
 *
 * `planImport(text, roster)` reads one JSON text and says what it is and what importing it would do,
 * without writing anything: the roster is never touched. Kinds, checked in this order:
 *   profile   the game's player profile (model/gameProfile.js isGameProfile)
 *   roster    an Eldaryn export, v1 or v2 (has a `characters` list)
 *   fightLog  an arena fight response (`{result: {ticks}}` or `{ticks}`), routed to Duel > Verify
 *   lootBag   `{pendingItems | oblivionPendingItems}`, routed to Drop Check
 * Anything else is rejected with an ImportError that names the case. A profile's report is the dry
 * run of normaliseCharacter plus the M1/M2/M3 report entries (data-model.md §7), so what the dialog
 * lists as defaulted or dropped is exactly what the import then does.
 */
import { ImportError, parseJsonText } from './storage.js';
import { isGameProfile, gameProfileToCharacter } from './model/gameProfile.js';
import { normaliseCharacter, normaliseRoster, isV1Roster, SCHEMA_VERSION } from './model/index.js';
import { describeProfileUpdate } from './model/merge.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** @returns {'profile'|'roster'|'fightLog'|'lootBag'|null} */
export function detectKind(parsed) {
  if (!isObj(parsed)) return null;
  if (isGameProfile(parsed)) return 'profile';
  if (Array.isArray(parsed.characters)) return 'roster';
  if (Array.isArray(parsed.result?.ticks) || Array.isArray(parsed.ticks)) return 'fightLog';
  if (Array.isArray(parsed.pendingItems) || Array.isArray(parsed.oblivionPendingItems)) return 'lootBag';
  return null;
}

const occupied = (items) => Object.values(items ?? {}).filter(Boolean).length;
const size = (v) => (Array.isArray(v) ? v.length : isObj(v) ? Object.keys(v).length : 0);

/** Counts per domain for the report (what the character holds after normalisation). */
export function characterCounts(c) {
  return [
    { id: 'set1', label: 'Gear, Set 1', count: occupied(c.equipment?.set1?.items), unit: 'items' },
    { id: 'set2', label: 'Gear, Set 2', count: occupied(c.equipment?.set2?.items), unit: 'items' },
    { id: 'oblivionGear', label: 'Gear, Oblivion', count: occupied(c.equipment?.oblivion?.items), unit: 'items' },
    { id: 'stones', label: 'Stones', count: size(c.enchantStones) + size(c.oblivionEnchantStones), unit: 'stones' },
    {
      id: 'talents',
      label: 'Talents',
      count: (c.talentSets ?? []).reduce((n, s) => n + Object.values(s?.allocation ?? {}).reduce((a, v) => a + (Number(v) || 0), 0), 0),
      unit: 'points',
    },
    { id: 'pets', label: 'Pets', count: size(c.pets?.owned), unit: 'pets' },
    { id: 'mounts', label: 'Mounts', count: size(c.mounts), unit: 'mounts' },
    { id: 'glyphs', label: 'Glyphs', count: size(c.glyphs), unit: 'glyphs' },
    { id: 'sigils', label: 'Sigils', count: size(c.sigils?.owned), unit: 'sigils' },
    { id: 'relics', label: 'Relics', count: size(c.relics), unit: 'relics' },
    { id: 'transcendence', label: 'Transcendence', count: size(c.transcendence?.presets), unit: 'presets' },
  ];
}

/** Plain-language lines for one report entry (model M1/M2/M3 kinds; unknown kinds are shown as their kind). */
export function describeReportEntry(e) {
  switch (e.kind) {
    case 'liveLoadout':
      return { tone: 'info', text: 'The gear and talents worn in the game differ from the active preset, so they are saved as a preset called "Live loadout".' };
    case 'liveLoadoutSheetDropped':
      return { tone: 'warn', text: 'The stat sheet was not loaded: there is no room for a "Live loadout" preset (8 presets at most).' };
    case 'conditionConflict':
      return { tone: 'warn', text: `Sigil ${e.species}: two conditions were set, kept "${e.kept}".` };
    case 'secondaryClamped':
      return { tone: 'warn', text: `${e.slot} secondary ${e.type}: ${e.from} is above the game's ceiling, set to ${e.to}.` };
    case 'conduitDropped':
      return { tone: 'warn', text: `${e.slot} conduit ${e.type} is not allowed on a ${e.rarity} item, removed.` };
    case 'itemLevelAboveAscension':
      return { tone: 'warn', text: `${e.slot ?? 'An item'} is above your ascension step.` };
    case 'dropped':
      return { tone: 'warn', text: `Dropped ${e.count ?? ''} ${e.what ?? 'references'}${e.reason ? `: ${e.reason}` : ''}.`.replace('  ', ' ') };
    case 'defaulted':
      return { tone: 'info', text: `Defaulted ${e.what ?? 'a value'}${e.count ? ` on ${e.count} items` : ''}${e.reason ? `: ${e.reason}` : ''}.` };
    default:
      return { tone: 'info', text: String(e.kind) };
  }
}

// [path in the profile, path in the normalised character, label]: what the game holds vs what the app kept.
const COLLECTIONS = [
  ['enchantStones', 'enchantStones', 'stones'],
  ['mountState.ownedMounts', 'mounts', 'mounts'],
  ['player.glyphs', 'glyphs', 'glyphs'],
  ['petState.ownedPets', 'pets.owned', 'pets'],
  ['sigilState.ownedSigils', 'sigils.owned', 'sigils'],
  ['relicState.ownedRelics', 'relics', 'relics'],
  ['transcendencePresets', 'transcendence.presets', 'transcendence presets'],
];
const at = (o, path) => path.split('.').reduce((v, k) => v?.[k], o);

/** Counts are approximate (collection sizes compared; a remapped or grown collection can hide a drop). */
/** `dropped` / `defaulted` report entries: what the profile held that the app could not keep, and what it filled in. */
function normalisationNotes(profile, norm) {
  const notes = [];
  for (const [from, to, what] of COLLECTIONS) {
    const n = size(at(profile, from)) - size(at(norm, to));
    if (n > 0) notes.push({ kind: 'dropped', what, count: n, reason: 'not in the game catalogue or not allowed for this class and level' });
  }
  let noQuality = 0;
  for (const set of Object.values(norm.equipment ?? {})) {
    for (const item of Object.values(set?.items ?? {})) if (item && item.quality == null) noQuality++;
  }
  if (noQuality) notes.push({ kind: 'defaulted', what: 'item quality', count: noQuality, reason: 'the game profile has no quality field' });
  return notes;
}

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * Read `text` and say what importing it would do. Throws ImportError (leaving everything untouched)
 * on empty text, bad JSON, an unrecognised shape, or a backup with no character.
 * @param {string} text
 * @param {object} roster  the current roster (read only)
 * @param {{now?: string}} [opts]
 */
export function planImport(text, roster, { now } = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new ImportError('There is nothing to import: the file or pasted text is empty.');
  const parsed = parseJsonText(text);
  const kind = detectKind(parsed);
  if (!kind) {
    throw new ImportError('Valid JSON, but not a roster backup, game profile, loot bag or fight log, so nothing was imported.');
  }

  if (kind === 'profile') {
    const report = [];
    const raw = gameProfileToCharacter(parsed, { ...(now ? { now } : {}), report });
    const character = normaliseCharacter(raw, { report });
    report.push(...normalisationNotes(parsed, character));
    const match = roster.characters.find((c) => sameName(c.name, character.name)) ?? null;
    const sheetPreset = character.presets.find((p) => p.sheet) ?? null;
    const pending = (Array.isArray(parsed.pendingItems) ? parsed.pendingItems.length : 0) + (Array.isArray(parsed.oblivionPendingItems) ? parsed.oblivionPendingItems.length : 0);
    return {
      kind,
      character,
      counts: characterCounts(character),
      report,
      sheet: sheetPreset ? { presetName: sheetPreset.name } : null,
      pendingItems: pending,
      match,
      diff: match ? describeProfileUpdate(match, character) : null,
    };
  }

  if (kind === 'roster') {
    const v1 = isV1Roster(parsed);
    const report = [];
    if (!v1) {
      for (const raw of parsed.characters) if (isObj(raw)) normaliseCharacter(raw, { report });
    }
    const incoming = normaliseRoster(parsed);
    if (incoming.characters.length === 0) {
      throw new ImportError('This backup has no characters, so nothing was imported. Your current data was left as it is.');
    }
    return {
      kind,
      roster: incoming,
      v1,
      schemaVersion: v1 ? 1 : SCHEMA_VERSION,
      report,
      incoming: incoming.characters.map((c) => ({ name: c.name, class: c.class, level: c.level, presets: c.presets.length })),
      replaces: { characters: roster.characters.length, presets: roster.characters.reduce((n, c) => n + c.presets.length, 0) },
    };
  }

  if (kind === 'fightLog') {
    const ticks = parsed.result?.ticks ?? parsed.ticks;
    return { kind, ticks: ticks.length };
  }

  const base = Array.isArray(parsed.pendingItems) ? parsed.pendingItems.length : 0;
  const oblivion = Array.isArray(parsed.oblivionPendingItems) ? parsed.oblivionPendingItems.length : 0;
  return { kind, items: base + oblivion, oblivionItems: oblivion };
}
