// search/celestialObjective.js (C2): the optimiser target 'celestial', the Celestial Trial for a party of
// my build and one fixed partner. Spec, partner rules, keys and the engine mapping:
// docs/Reference/simulation.md §Celestial Trial. The objective is the win-rate family (objectives.js);
// this file resolves the target and runs one fight.
//
// TARGET spec (plain JSON):
//   {kind: 'celestial', difficulty: 'NORMAL'|'HARD', level?: whole number, partner: PartnerRef|null,
//    tank?: 'auto'|'me'|'partner', starter?: 'me'|'partner', tactics?: {focus, holdCount}}
//   PartnerRef: {source: 'character', characterId, presetId}   another roster character's preset; the
//                 worker never sees the roster, so the caller resolves it first (resolveRosterPartner)
//               {source: 'opponent', opponentId}               one of `character.opponents`
import { metricKey, stableStringify } from '../engine/metrics.js';
import {
  simulateCelestial, prepareCelestialMember, celestialMaxHoldCount, CELESTIAL_ASSUMPTIONS,
} from '../engine/pve/celestial.js';
import { celestialDifficulty, CELESTIAL_DIFFICULTIES, CELESTIAL_TACTICS, CELESTIAL_CONSTANTS } from '../game/celestial.js';
import { buildFighter } from '../build/fighter.js';
import { opponentFighter, missingStats } from '../features/duel.js';

export const CELESTIAL_TARGET_KIND = 'celestial';
export const CELESTIAL_TANKS = ['auto', 'me', 'partner'];
export const CELESTIAL_STARTERS = ['me', 'partner'];
export const CELESTIAL_FOCUSES = ['HOLD', 'BOSS', 'SPAWN'];
/** Partner sources. A Rankings profile (backlog §2) is saved as an opponent, so it is the 'opponent' source with a real level. */
export const CELESTIAL_PARTNER_SOURCES = ['character', 'opponent'];

/** The party order: my build is member 0 (as in every server log), the partner member 1. */
export const ME = 0;
export const PARTNER = 1;

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const isId = (v) => typeof v === 'string' && v.length > 0;

/** The catalogue's default tactics for a difficulty ({focus, holdCount}, finder defaults). */
export function defaultCelestialTactics(difficulty) {
  const d = CELESTIAL_TACTICS.CELESTIAL_FINDER_DEFAULT_TACTICS[difficulty];
  return { focus: d.focus, holdCount: d.holdCount };
}

/** A partner reference, validated for shape only: null (solo) or one of the PartnerRef forms. Throws. */
export function partnerRefOf(raw) {
  if (raw == null) return null;
  if (!isObj(raw)) throw new Error('Celestial partner must be null or {source, ...}');
  if (raw.source === 'character') {
    if (!isId(raw.characterId) || !isId(raw.presetId)) throw new Error('Celestial partner from the roster needs characterId and presetId');
    return { source: 'character', characterId: raw.characterId, presetId: raw.presetId };
  }
  if (raw.source === 'opponent') {
    if (!isId(raw.opponentId)) throw new Error('Celestial partner from Opponents needs opponentId');
    return { source: 'opponent', opponentId: raw.opponentId };
  }
  throw new Error(`unknown Celestial partner source '${raw.source}'`);
}

/**
 * A roster partner as plain JSON for the worker request: the other character's preset built into a
 * Fighter (build/fighter.js). Throws when the character or preset is gone.
 * @param {{characterId: string, presetId: string}} ref
 * @param {Array<Object>} characters  the roster's characters (normalised)
 * @returns {{source: 'character', characterId: string, presetId: string, name: string, presetName: string, fighter: Object}}
 */
export function resolveRosterPartner(ref, characters = []) {
  const c = (characters ?? []).find((x) => x?.id === ref?.characterId);
  if (!c) throw new Error('Celestial partner: that character is no longer in the roster');
  const p = (c.presets ?? []).find((x) => x.id === ref.presetId);
  if (!p) throw new Error(`Celestial partner: ${c.name || 'that character'} has no such preset any more`);
  return {
    source: 'character', characterId: c.id, presetId: p.id, name: c.name || 'Partner', presetName: p.name || 'Preset',
    fighter: JSON.parse(JSON.stringify(buildFighter(c, p.id))),
  };
}

/**
 * The resolved roster partner a target spec needs, or null (no partner, an opponent partner, another
 * kind, or a dangling reference: resolveTarget then says what is missing). Never throws.
 */
export function rosterPartnerFor(targetSpec, characters) {
  if (targetSpec?.kind !== CELESTIAL_TARGET_KIND || targetSpec.partner?.source !== 'character') return null;
  try {
    return resolveRosterPartner(targetSpec.partner, characters);
  } catch {
    return null;
  }
}

/** The partner a ref names, as {source, name, fighter, level} (level null when the sheet has none). */
function partnerOf(ref, { character, partner }) {
  if (ref.source === 'character') {
    if (!partner || partner.source !== 'character' || partner.characterId !== ref.characterId || partner.presetId !== ref.presetId || !isObj(partner.fighter)) {
      throw new Error('Celestial partner: that roster character or preset is missing (it may have been deleted)');
    }
    const f = partner.fighter;
    return {
      source: 'character', name: partner.name || 'Partner', detail: partner.presetName ?? '', fighter: f,
      level: Number.isInteger(f.level) && f.level >= 1 ? f.level : null,
    };
  }
  const o = (character?.opponents ?? []).find((x) => x.id === ref.opponentId);
  if (!o) throw new Error('Celestial partner: that opponent is no longer saved on this character');
  const f = opponentFighter(o);
  const missing = missingStats(f);
  if (missing.length) throw new Error(`Celestial partner: opponent '${o.name || 'Opponent'}' has no ${missing.join(' / ')} in its sheet`);
  // a typed sheet carries no level (opponentFighter's 100 is a placeholder), so it never sets the scaling;
  // a Rankings import has the player's real level, which does
  const level = o.imported ? o.imported.level : null;
  return { source: 'opponent', name: o.name || 'Opponent', detail: '', fighter: f, level, imported: !!o.imported };
}

function tacticsOf(raw, difficulty) {
  const def = defaultCelestialTactics(difficulty);
  if (raw == null) return def;
  if (!isObj(raw)) throw new Error('Celestial tactics must be {focus, holdCount}');
  const focus = raw.focus ?? def.focus;
  if (!CELESTIAL_FOCUSES.includes(focus)) throw new Error(`unknown Celestial focus '${focus}'`);
  const holdCount = raw.holdCount ?? def.holdCount;
  const max = celestialMaxHoldCount(difficulty);
  const min = CELESTIAL_TACTICS.CELESTIAL_HOLD_COUNT.min;
  if (!(Number.isInteger(holdCount) && holdCount >= min && holdCount <= max)) {
    throw new Error(`Celestial hold count must be a whole number from ${min} to ${max} on ${difficulty}, got ${holdCount}`);
  }
  return { focus, holdCount };
}

const partnerLabel = (p) => {
  if (!p) return { id: 'celestial-partner', label: 'Solo: a party of one.' };
  if (p.source === 'character') {
    return { id: 'celestial-partner', label: `Partner: ${p.name}'s preset${p.detail ? ` ${p.detail}` : ''} from the roster, as saved now; fixed for every build.` };
  }
  if (p.imported) {
    return { id: 'celestial-partner', label: `Partner: ${p.name}, imported from Rankings (level ${p.level}); its server sheet, sigils and glyphs are taken as given, with no talents modelled. The party scales by the higher level. Fixed for every build.` };
  }
  return { id: 'celestial-partner', label: `Partner: the opponent ${p.name}, whose typed sheet is taken as given; it has no level, so the party scales by yours. Fixed for every build.` };
};

/**
 * Validate a Celestial target spec.
 * @param {Object} raw
 * @param {{character?: Object, partner?: Object}} ctx  `partner`: resolveRosterPartner's result for a roster partner
 * @returns the shape objectives.js resolveTarget returns, plus `celestial` (the engine arguments) and `partner`.
 */
export function resolveCelestialTarget(raw, { character, partner } = {}) {
  const difficulty = raw?.difficulty;
  if (difficulty === 'MYTHIC') throw new Error('Celestial MYTHIC is not simulated (its party-power HP scaling is server-side)');
  if (!CELESTIAL_DIFFICULTIES.includes(difficulty)) throw new Error(`unknown Celestial difficulty '${difficulty}'`);
  const ref = partnerRefOf(raw.partner);
  const mate = ref ? partnerOf(ref, { character, partner }) : null;
  const tank = raw.tank ?? 'auto';
  if (!CELESTIAL_TANKS.includes(tank)) throw new Error(`unknown Celestial tank '${tank}'`);
  const starter = raw.starter ?? 'me';
  if (!CELESTIAL_STARTERS.includes(starter)) throw new Error(`unknown Celestial starter '${starter}'`);
  if (!mate && (tank === 'partner' || starter === 'partner')) throw new Error('Celestial: a solo run has no partner to tank or start');
  const tactics = tacticsOf(raw.tactics, difficulty);
  // each difficulty has its own unlock level (NORMAL 40, HARD 60; Game/pve-content.md §6)
  const minLevel = celestialDifficulty(difficulty).unlockLevel ?? CELESTIAL_CONSTANTS.UNLOCK_LEVEL;
  if (raw.level != null && !(Number.isInteger(raw.level) && raw.level >= minLevel)) {
    throw new Error(`Celestial level must be a whole number from ${minLevel}, got ${raw.level}`);
  }
  // the engine's rule (the party's highest level), read once here so the label and the key carry it
  const level = raw.level ?? Math.max(character?.level ?? 0, mate?.level ?? 0);
  if (!(Number.isInteger(level) && level >= 1)) throw new Error('Celestial: the party level is missing');

  const spec = {
    kind: CELESTIAL_TARGET_KIND, difficulty, ...(raw.level != null ? { level: raw.level } : {}),
    partner: ref, tank, starter, tactics,
  };
  const partnerKey = mate ? metricKey('celestial-partner', mate.fighter) : null;
  const timeLimitMs = celestialDifficulty(difficulty).timeLimitMs;
  return {
    kind: CELESTIAL_TARGET_KIND, spec, key: stableStringify({ ...spec, level, partnerKey }),
    realm: 'base', enemy: null, maxMs: timeLimitMs, seconds: timeLimitMs / 1000, opts: {},
    mode: 'celestial', fidelity: 'server-model',
    assumptions: [...Object.values(CELESTIAL_ASSUMPTIONS).map((a) => ({ id: a.key, label: a.text })), partnerLabel(mate)],
    label: `Celestial Trial (${difficulty}, L${level}, ${mate ? `with ${mate.name}` : 'solo'})`,
    partner: mate ? { source: mate.source, name: mate.name, fighter: mate.fighter, key: partnerKey } : null,
    celestial: {
      difficulty, level, tactics,
      // auto: the engine's defaultTankIndex on each candidate's party (my spec can change with my talents)
      tankIndex: tank === 'me' ? ME : tank === 'partner' ? PARTNER : undefined,
      stackPlayerIndex: starter === 'partner' ? PARTNER : ME,
    },
  };
}

/**
 * A fight runner for a resolved target: the partner is prepared once, my build once per call.
 * @returns {(fighter: Object) => {fight: (rng: () => number) => import('../engine/pve/celestial.js').CelestialResult}}
 */
export function celestialRunner(target) {
  const { difficulty, level, tactics, tankIndex, stackPlayerIndex } = target.celestial;
  const mate = target.partner ? prepareCelestialMember(target.partner.fighter) : null;
  return (fighter) => {
    const party = mate ? [prepareCelestialMember(fighter), mate] : [prepareCelestialMember(fighter)];
    return {
      party,
      fight: (rng) => simulateCelestial({ difficulty, party, level, tankIndex, stackPlayerIndex, tactics, rng }),
    };
  };
}

/**
 * One Celestial fight's win-rate score (objectives.js winRateFightScore's scale): a clear scores
 * 1 + the party's HP left / its max HP, a loss the share of the boss's HP removed (< 1).
 */
export function celestialFightScore(r) {
  const LOSS_CEILING = 1 - 1e-9;
  const clamp01 = (x) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
  if (r.won) {
    const max = r.playerMaxHps.reduce((a, b) => a + b, 0);
    const left = r.hpLeft.reduce((a, b) => a + b, 0);
    return 1 + clamp01(max > 0 ? left / max : 0);
  }
  return Math.min(LOSS_CEILING, clamp01(r.bossMaxHp > 0 ? 1 - r.bossHpLeft / r.bossMaxHp : 0));
}
