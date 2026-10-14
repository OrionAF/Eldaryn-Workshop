// features/duel.js (F3): the PVP duel feature on top of build/ and engine/pvp. Pure; no store, no rng.
// Turns saved opponents and my presets into engine Fighters, clones a preset into an opponent, reads
// a win-rate summary from either side, and summarises a traced duel's log. Rules: Game/combat-pvp.md
// (ties go to the defender, the x8 PVP HP buff is applied inside the engine, never here).
import { buildFighter } from '../build/fighter.js';
import { classOfSpec } from '../game/classes.js';
import { sigilBySpecies } from '../game/sigils.js';
import { parseEventType, TIME_UP } from '../engine/pvp/events.js';
import { normaliseSheetValues } from '../engine/pipeline/sheet.js';
import { normaliseOpponent } from '../model/opponents.js';
import { glyphTypeInfo } from '../model/glyphs.js';

/** Stats a duel cannot start without: an HP pool and an attack. */
export const REQUIRED_STATS = [
  ['totalHp', 'HP'],
  ['totalAttack', 'Attack'],
];

/**
 * The engine reads `form` ('BEAR'|'WOLF'|null); build/fighter.js names the same thing `formKind`.
 * Returns a plain-data copy, safe to send to the worker.
 */
export function duelFighter(f) {
  return { ...f, form: f.form ?? f.formKind ?? null };
}

/** Saved opponent -> Fighter. Its sheet is its stat block (no pipeline runs). */
export function opponentFighter(opp) {
  const o = normaliseOpponent(opp);
  const utilityDef = o.utility ? sigilBySpecies(o.utility.species) : null;
  const formConfig = o.spec === 'MYSTIC_DRUID' && utilityDef?.spellType === 'FORM' && utilityDef.spell?.form ? utilityDef.spell : null;
  // A major glyph is inert unless its sigil is equipped (CLAUDE.md BigReworkV1), as in build/fighter.js.
  const equipped = new Set([...o.sigils, o.utility, o.ancient].filter(Boolean).map((s) => s.species));
  const glyphMods = o.majorGlyphs.filter((g) => equipped.has(glyphTypeInfo(g.glyphType)?.def.sigilSpecies));
  return duelFighter({
    stats: { ...o.sheet.values },
    class: o.class,
    spec: o.spec,
    level: 100,
    sigils: o.sigils,
    utility: o.utility,
    ancient: o.ancient,
    conditions: o.conditions,
    glyphMods,
    altarTier: o.altarTier,
    formKind: formConfig?.form ?? null,
    formConfig,
    realm: 'base',
    presetId: null,
    source: 'sheet',
  });
}

/** My preset -> Fighter (sheet or computed stats, as C1a builds it). */
export function presetDuelFighter(character, presetId, opts) {
  return duelFighter(buildFighter(character, presetId, opts));
}

/** Names of required stats the fighter lacks (zero or missing). Empty when a duel can run. */
export function missingStats(fighter) {
  return REQUIRED_STATS.filter(([k]) => !(Number(fighter?.stats?.[k]) > 0)).map(([, label]) => label);
}

/**
 * "Clone my preset as spec X": an unsaved opponent carrying my preset's effective stats, with the
 * loadout parts that are still legal for the chosen spec (normaliseOpponent drops the rest).
 * @param {Object} character
 * @param {string} presetId
 * @param {string} spec  SpecKey, any class
 * @param {string} [name]
 */
export function cloneAsOpponent(character, presetId, spec, name) {
  const f = buildFighter(character, presetId);
  const cls = classOfSpec(spec) ?? f.class;
  return normaliseOpponent({
    name: name || `${character.presets.find((p) => p.id === f.presetId)?.name ?? 'Preset'} clone`,
    class: cls,
    spec,
    sheet: { values: normaliseSheetValues(f.stats), enteredAt: new Date().toISOString() },
    sigils: f.sigils,
    utility: f.utility,
    ancient: f.ancient,
    conditions: f.conditions,
    majorGlyphs: f.glyphMods,
    altarTier: f.altarTier,
  });
}

/**
 * Which two Fighters meet, and who is who. `mySide` is where my preset stands: 'attacker' or 'defender'.
 * @returns {{attacker: Object, defender: Object}}
 */
export function arrange(mine, theirs, mySide = 'attacker') {
  return mySide === 'attacker' ? { attacker: mine, defender: theirs } : { attacker: theirs, defender: mine };
}

/**
 * A pvpWinRate summary seen from my side. The engine reports the attacker's win rate; from the
 * defender's seat mine is its complement (ties already go to the defender in the engine).
 * @param {{p: number, lo: number, hi: number}} summary
 */
export function fromMySide(summary, mySide = 'attacker') {
  if (!summary || mySide === 'attacker') return summary;
  return { ...summary, p: 1 - summary.p, lo: 1 - summary.hi, hi: 1 - summary.lo };
}

const SWING_KINDS = new Set(['hit', 'crit']);
const LOST_SWING = new Set(['blind', 'paralyze', 'fear']);
const AVOID_KINDS = new Set(['miss', 'block']);
const DISRUPT_KINDS = new Set(['blinded', 'paralyzed', 'silenced', 'feared', 'staggered']);
/** Kinds whose `damage` is dealt by the side the prefix names. */
const DAMAGE_KINDS = new Set(['hit', 'crit', 'spell_damage', 'spell_dot_tick', 'spell_debuff_tick', 'minion_hit', 'minion_crit', 'thorns_reflect']);
/** Kinds whose prefix names the side the event happened TO (the avoider, the afflicted, the minion's owner). */
const TARGET_KINDS = new Set([...AVOID_KINDS, ...DISRUPT_KINDS, 'minion_damaged', 'minion_dead']);

/**
 * Where a DuelEvent belongs on the timeline and what it looks like. `lane` is the side the event is
 * about: the swinger or caster for what a side does, the target for avoid / status / minion-loss rows.
 * @param {import('../engine/pvp/events.js').DuelEvent} ev
 * @returns {{lane: 'attacker'|'defender'|null, mark: 'damage'|'heal'|'spell'|'avoid'|'status'|'lost'|'minion'|'death'|'end'|'other', amount: number}}
 */
export function classifyDuelEvent(ev) {
  const { side, kind } = parseEventType(ev.type);
  const amount = Number(ev.damage) || 0;
  if (kind === TIME_UP) return { lane: null, mark: 'end', amount: 0 };
  if (kind === 'dead') return { lane: side, mark: 'death', amount: 0 };
  if (DAMAGE_KINDS.has(kind) && amount > 0) return { lane: side, mark: 'damage', amount };
  if (kind === 'regen' || kind === 'spell_heal_tick' || kind === 'minion_heal') return { lane: side, mark: 'heal', amount };
  if (AVOID_KINDS.has(kind)) return { lane: side, mark: 'avoid', amount: 0 };
  if (DISRUPT_KINDS.has(kind)) return { lane: side, mark: 'status', amount: 0 };
  if (LOST_SWING.has(kind)) return { lane: side, mark: 'lost', amount: 0 };
  if (kind.startsWith('minion_')) return { lane: side, mark: 'minion', amount };
  if (kind.startsWith('spell_')) return { lane: side, mark: 'spell', amount };
  return { lane: side, mark: 'other', amount };
}

const emptySide = () => ({ swings: 0, crits: 0, avoided: 0, lost: 0, disrupts: 0, damage: 0 });

/**
 * Frequencies in one traced duel, per side. `avoided` = swings of this side the other side avoided;
 * `lost` = swings this side lost to its own blind / paralysis / fear; `disrupts` = status effects this
 * side landed on the other. `damage` includes spells and minions (double-hit strikes count as damage,
 * not as swings). One duel is a sample, not an average: the win-rate run carries N.
 * @param {import('../engine/pvp/events.js').DuelEvent[]} log
 */
export function traceSummary(log) {
  const out = { attacker: emptySide(), defender: emptySide() };
  const other = (s) => (s === 'attacker' ? 'defender' : 'attacker');
  for (const ev of log ?? []) {
    const { side, kind } = parseEventType(ev.type);
    if (!side) continue;
    if (DAMAGE_KINDS.has(kind)) out[side].damage += Number(ev.damage) || 0;
    if (SWING_KINDS.has(kind) && !ev.doubleHit) {
      out[side].swings += 1;
      if (kind === 'crit') out[side].crits += 1;
    } else if (AVOID_KINDS.has(kind)) {
      out[other(side)].swings += 1;
      out[other(side)].avoided += 1;
    } else if (LOST_SWING.has(kind)) {
      out[side].swings += 1;
      out[side].lost += 1;
    } else if (DISRUPT_KINDS.has(kind)) {
      out[other(side)].disrupts += 1;
    }
  }
  return out;
}
