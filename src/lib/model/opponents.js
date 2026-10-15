// model/opponents.js - owned by F3. Persisted character field: opponents (saved PVP duel opponents).
// Shape (rebuild-plan §3):
//   opponents: [{ id, name, class, spec, sheet: {values, enteredAt}, sigils: [{species, level}],
//                 utility: {species, level}|null, ancient: {species, level}|null,
//                 conditions: Record<species, conditionId>,
//                 majorGlyphs: [{glyphType, rarity}], altarTier,
//                 imported: {playerId|null, level, importedAt|null}|null }]
// An opponent is a stat sheet (typed from the arena profile, or cloned from one of my presets) plus the
// combat loadout the engine needs; it has no gear. `sheet.values` may be empty while the user is still
// typing (duelReadiness in features/duel.js says what is missing). The count is capped at MAX_OPPONENTS.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER:
//   defaultOpponents()                    -> { opponents: [] }
//   normaliseOpponents(rawCharacter, ctx) -> partial; idempotent; ctx is unused (opponents have their own class)
//   migrateOpponentsFromV1(v1Character)   -> { value: partial, idMap: {} }  v1 opponents are dropped (§3)
//   reconcileOpponents(character)         -> void; nothing references an opponent
import { CLASSES, SPECS, classOfSpec } from '../game/classes.js';
import { normaliseSheetValues } from '../engine/pipeline/sheet.js';
import { sheetValues } from './gameProfile.js';
import { sigilBySpecies, utilitySlotSpellType } from '../game/sigils.js';
import { newId } from './character.js';
import { PRESET_SIGIL_CAP } from './presets.js';
import {
  MAX_SIGIL_LEVEL,
  MAX_ALTAR_TIER,
  DEFAULT_CONDITION,
  genericSigils,
  utilitySigils,
  ancientSigils,
  clampSigilLevel,
  sigilConditionOptions,
} from './sigils.js';
import { GLYPH_RARITY_LADDER, FREE_GLYPH_RARITIES, MOUNT_GLYPH_SOCKETS, glyphTypeInfo, majorGlyphAllowed } from './glyphs.js';

export const MAX_OPPONENTS = 12;
export const OPPONENT_SIGIL_CAP = PRESET_SIGIL_CAP;

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

export function defaultOpponents() {
  return { opponents: [] };
}

const specKeysOf = (cls) => SPECS.filter((s) => s.class === cls).map((s) => s.key);

function sigilRef(raw, allowed) {
  const species = typeof raw === 'string' ? raw : raw?.species;
  if (typeof species !== 'string' || !allowed.has(species) || !sigilBySpecies(species)) return null;
  const level = typeof raw === 'object' ? raw.level : MAX_SIGIL_LEVEL;
  return { species, level: clampSigilLevel(species, clampInt(level, 1, MAX_SIGIL_LEVEL, MAX_SIGIL_LEVEL)) };
}

/** One raw opponent -> a valid one. Never throws; `raw` may be anything. */
export function normaliseOpponent(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const specGuess = typeof r.spec === 'string' ? r.spec.trim().toUpperCase() : '';
  let cls = typeof r.class === 'string' && CLASSES.includes(r.class.trim().toUpperCase()) ? r.class.trim().toUpperCase() : null;
  cls ??= classOfSpec(specGuess) ?? 'WARRIOR';
  const spec = specKeysOf(cls).includes(specGuess) ? specGuess : specKeysOf(cls)[0];

  const generic = new Set(genericSigils(cls, spec).map((s) => s.species));
  const utilityOk = new Set(utilityKind(cls, spec) ? utilitySigils(cls, spec).map((s) => s.species) : []);
  const ancientOk = new Set(ancientSigils(cls).map((s) => s.species));

  const sigils = [];
  for (const s of Array.isArray(r.sigils) ? r.sigils : []) {
    const ref = sigilRef(s, generic);
    if (ref && !sigils.some((x) => x.species === ref.species) && sigils.length < PRESET_SIGIL_CAP) sigils.push(ref);
  }
  const utility = sigilRef(r.utility, utilityOk);
  const ancient = sigilRef(r.ancient, ancientOk);

  const equipped = [...sigils, utility, ancient].filter(Boolean).map((s) => s.species);
  const rawCond = r.conditions && typeof r.conditions === 'object' ? r.conditions : {};
  const conditions = {};
  for (const sp of equipped) {
    const c = rawCond[sp];
    conditions[sp] = typeof c === 'string' && sigilConditionOptions(sp, spec).includes(c) ? c : DEFAULT_CONDITION;
  }

  const majorGlyphs = [];
  for (const g of Array.isArray(r.majorGlyphs) ? r.majorGlyphs : []) {
    const info = g && typeof g.glyphType === 'string' ? glyphTypeInfo(g.glyphType) : null;
    if (!info || info.tier !== 'major' || !FREE_GLYPH_RARITIES.includes(g.rarity)) continue;
    if (!majorGlyphAllowed(info.id, cls, [spec]) || majorGlyphs.some((x) => x.glyphType === info.id)) continue;
    if (majorGlyphs.length < MOUNT_GLYPH_SOCKETS.major) majorGlyphs.push({ glyphType: info.id, rarity: g.rarity });
  }

  const rawSheet = r.sheet && typeof r.sheet === 'object' ? r.sheet : {};
  return {
    id: typeof r.id === 'string' && r.id ? r.id : newId('opp'),
    name: typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : 'Opponent',
    class: cls,
    spec,
    sheet: {
      values: normaliseSheetValues(rawSheet.values),
      enteredAt: typeof rawSheet.enteredAt === 'string' ? rawSheet.enteredAt : null,
    },
    sigils,
    utility,
    ancient,
    conditions,
    majorGlyphs,
    altarTier: clampInt(r.altarTier, 1, MAX_ALTAR_TIER, 1),
    imported: normaliseImported(r.imported),
  };
}

/** Where an opponent came from when it was imported from Rankings (data-model.md §3); null for a typed one. */
function normaliseImported(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = typeof raw.playerId === 'number' ? String(raw.playerId) : raw.playerId;
  return {
    playerId: typeof id === 'string' && id.trim() ? id.trim().slice(0, 64) : null,
    level: clampInt(raw.level, 1, 200, 1),
    importedAt: typeof raw.importedAt === 'string' ? raw.importedAt : null,
  };
}

/** True for a player profile opened from Rankings: a server sheet and worn sigils, not the user's own state. */
export function isRankingsProfile(json) {
  return !!json && typeof json === 'object' && !Array.isArray(json)
    && !!json.computedStats && typeof json.computedStats === 'object'
    && Array.isArray(json.equippedSigils) && !Array.isArray(json.presets)
    && !(json.player && typeof json.player === 'object');
}

/**
 * A Rankings profile -> an opponent (unsaved; the caller gives it an id or keeps an existing one).
 * `computedStats` is the sheet exactly; the loadout supplies spec, worn sigils with levels, utility,
 * altar tier and major glyphs. Kept identifiers: the playerId (to refresh in place) and the name.
 * Sigils the spec cannot wear are dropped by normaliseOpponent like any other opponent's.
 */
export function opponentFromRankingsProfile(profile, { now = new Date().toISOString() } = {}) {
  const cls = typeof profile.class === 'string' ? profile.class.toUpperCase() : null;
  const spec = typeof profile.activeSpec === 'string' ? profile.activeSpec : null;
  const worn = (profile.equippedSigils ?? []).filter((s) => s && sigilBySpecies(s.species));
  const ancientSet = new Set(ancientSigils(cls ?? 'WARRIOR').map((s) => s.species));
  const probe = normaliseOpponent({ class: cls, spec });
  const utilitySet = new Set(utilityKind(probe.class, probe.spec) ? utilitySigils(probe.class, probe.spec).map((s) => s.species) : []);
  const ref = (s) => ({ species: s.species, level: s.level });
  const explicit = profile.utilitySigil && typeof profile.utilitySigil === 'object' ? profile.utilitySigil : null;
  const ancient = worn.find((s) => s.rarity === 'ANCIENT' || ancientSet.has(s.species)) ?? null;
  const utility = explicit ?? worn.find((s) => s !== ancient && utilitySet.has(s.species)) ?? null;
  const id = profile.playerId ?? profile.player_id ?? null;
  const rawName = [profile.name, profile.playerName, profile.displayName, profile.username].find((n) => typeof n === 'string' && n.trim());
  return normaliseOpponent({
    name: rawName ?? 'Rankings player',
    class: cls,
    spec,
    sheet: { values: sheetValues(profile.computedStats), enteredAt: now },
    sigils: worn.filter((s) => s !== ancient && s !== utility && !utilitySet.has(s.species)).map(ref),
    utility: utility ? ref(utility) : null,
    ancient: ancient ? ref(ancient) : null,
    altarTier: profile.sigilAltarTier,
    // the game writes glyph rarity upper case; one glyph type per opponent, so the best copy is the one kept
    majorGlyphs: (profile.activeMajorGlyphs ?? [])
      .map((g) => ({ glyphType: g?.glyphType, rarity: typeof g?.rarity === 'string' ? g.rarity[0].toUpperCase() + g.rarity.slice(1).toLowerCase() : null }))
      .sort((a, b) => GLYPH_RARITY_LADDER.indexOf(b.rarity) - GLYPH_RARITY_LADDER.indexOf(a.rarity)),
    imported: { playerId: id, level: profile.level, importedAt: now },
  });
}

const utilityKind = (cls, spec) => utilitySlotSpellType(cls, spec);

/** A fresh opponent for a class/spec (empty sheet, no sigils). */
export function newOpponent(spec = 'WARRIOR_DPS', name = 'Opponent') {
  return normaliseOpponent({ name, spec, class: classOfSpec(spec) });
}

export function normaliseOpponents(rawCharacter) {
  const list = Array.isArray(rawCharacter?.opponents) ? rawCharacter.opponents : [];
  const seen = new Set();
  const opponents = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || opponents.length >= MAX_OPPONENTS) continue;
    const o = normaliseOpponent(raw);
    if (seen.has(o.id)) o.id = newId('opp');
    seen.add(o.id);
    opponents.push(o);
  }
  return { opponents };
}

// eslint-disable-next-line no-unused-vars
export function migrateOpponentsFromV1(v1Character) {
  return { value: defaultOpponents(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileOpponents(character) {}
