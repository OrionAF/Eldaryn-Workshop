// features/duel.js (F3): the PVP duel feature on top of build/ and engine/pvp. Pure; no store, no rng.
// Turns saved opponents and my presets into engine Fighters, clones a preset into an opponent, reads
// a win-rate summary from either side, and summarises a traced duel's log. Rules: Game/combat-pvp.md
// (ties go to the defender, the PVP HP buff is applied inside the engine, never here).
import { buildFighter } from '../build/fighter.js';
import { applyPvpHpBuffPair } from '../engine/pvp/hpBuff.js';
import { DEFAULT_PVP_BALANCE } from '../engine/pvp/balance.js';
import { classOfSpec } from '../game/classes.js';
import { sigilBySpecies } from '../game/sigils.js';
import { parseEventType, TIME_UP } from '../engine/pvp/events.js';
import { completeDuelStats, fighterDuelArgs } from '../engine/pvp/resolver.js';
import { normaliseSheetValues, sheetKeyMeta, SHEET_KEYS, toDisplay } from '../engine/pipeline/sheet.js';
import { nNeeded } from '../engine/stats/index.js';
import { wilson } from '../engine/metrics.js';
import { formatFlat, formatPct } from '../format.js';
import { normaliseOpponent } from '../model/opponents.js';
import { glyphTypeInfo } from '../model/glyphs.js';

export { completeDuelStats };

/** Stats a duel cannot start without: an HP pool, an attack and a swing speed (no neutral value exists). */
export const REQUIRED_STATS = [
  ['totalHp', 'HP'],
  ['totalAttack', 'Attack'],
  ['totalAttackSpeed', 'Attack Speed'],
];

/**
 * The engine reads `form` ('BEAR'|'WOLF'|null); build/fighter.js names the same thing `formKind`.
 * Returns a plain-data copy, safe to send to the worker.
 */
export function duelFighter(f) {
  return { ...f, form: f.form ?? f.formKind ?? null };
}

/**
 * Saved opponent -> Fighter. Its sheet is its stat block (no pipeline runs); rows it leaves blank or its
 * class hides take their neutral value and are listed in `defaulted` (data-model.md §7).
 */
export function opponentFighter(opp) {
  const o = normaliseOpponent(opp);
  const utilityDef = o.utility ? sigilBySpecies(o.utility.species) : null;
  const formConfig = o.spec === 'MYSTIC_DRUID' && utilityDef?.spellType === 'FORM' && utilityDef.spell?.form ? utilityDef.spell : null;
  // A major glyph is inert unless its sigil is equipped (CLAUDE.md BigReworkV1), as in build/fighter.js.
  const equipped = new Set([...o.sigils, o.utility, o.ancient].filter(Boolean).map((s) => s.species));
  const glyphMods = o.majorGlyphs.filter((g) => equipped.has(glyphTypeInfo(g.glyphType)?.def.sigilSpecies));
  const formKind = formConfig?.form ?? null;
  const { stats, defaulted } = completeDuelStats(o.sheet.values, o.class, formKind);
  return duelFighter({
    stats,
    defaulted,
    class: o.class,
    spec: o.spec,
    // a typed sheet has no level (100 is a placeholder); a Rankings import carries the real one
    level: o.imported?.level ?? 100,
    sigils: o.sigils,
    utility: o.utility,
    ancient: o.ancient,
    conditions: o.conditions,
    glyphMods,
    altarTier: o.altarTier,
    formKind,
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
const DISRUPT_KINDS = new Set(['blinded', 'paralyzed', 'silenced', 'feared', 'staggered', 'dazed']);
/** Kinds whose `damage` is dealt by the side the prefix names. */
const DAMAGE_KINDS = new Set(['hit', 'crit', 'spell_damage', 'spell_dot_tick', 'spell_debuff_tick', 'minion_hit', 'minion_crit', 'minion_thorns', 'thorns_reflect']);
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

// ---------------------------------------------------------------------------------------------
// U10: what the Duel page shows (interval and nNeeded: docs/Reference/simulation.md §Statistics)

/** "Needs: HP, Attack, Attack Speed", read from REQUIRED_STATS so the text cannot drift from the gate. */
export const requiredStatsText = () => `Needs: ${REQUIRED_STATS.map(([, label]) => label).join(', ')}`;

/** Sheet label of a stat key (the `defaulted` lists carry keys). */
export const statLabel = (key) => sheetKeyMeta(key)?.label ?? key;
export const defaultedLabels = (keys) => (keys ?? []).map(statLabel);

/** Smallest edge over even the verdict text promises to resolve: 3 points. */
export const MIN_EDGE = 0.03;

/**
 * Verdict of a win-rate summary against even. Favoured / unfavoured when the Wilson interval clears
 * 0.5; otherwise unresolved with the N that would resolve the observed edge (at least `minEdge`) at
 * 80 % power, never fewer fights than already run.
 * @param {{p: number, lo: number, hi: number, n: number}|null} s
 */
export function winRateVerdict(s, { minEdge = MIN_EDGE } = {}) {
  if (!s || !(s.n > 0) || s.p == null) return null;
  const edge = s.p - 0.5;
  const verdict = s.lo > 0.5 ? 'better' : s.hi < 0.5 ? 'worse' : 'unresolved';
  let need = null;
  if (verdict === 'unresolved') {
    const raw = nNeeded({ sd: Math.sqrt(s.p * (1 - s.p)), delta: edge, deltaMin: minEdge });
    need = raw == null ? null : Math.max(raw, s.n + 1);
  }
  return { verdict, edge, n: s.n, nNeeded: need, edgePts: Math.max(Math.abs(edge), minEdge) * 100 };
}

/**
 * Seats seen from my side, pooled into one proportion with a Wilson interval over the total N.
 * A missing or empty side is skipped.
 */
export function combineSeats(...seats) {
  const live = seats.filter((s) => s && s.n > 0 && s.p != null);
  if (!live.length) return null;
  const n = live.reduce((a, s) => a + s.n, 0);
  const k = live.reduce((a, s) => a + Math.round(s.p * s.n), 0);
  const w = wilson(k, n);
  const weighted = (key) => (live.every((s) => s[key] != null) ? live.reduce((a, s) => a + s[key] * s.n, 0) / n : null);
  return {
    p: w.p, lo: w.lo, hi: w.hi, n,
    meanMs: weighted('meanMs'), p90Ms: null, timeoutShare: weighted('timeoutShare'),
    aborted: live.some((s) => s.aborted),
  };
}

/**
 * The two stat blocks exactly as the resolver reads them (completed, HP buffed at MY level as the
 * attacker, as runDuel does), side by side, with the rows each side left blank marked. Only numeric
 * sheet keys appear, in sheet order.
 * @returns {Array<{key: string, label: string, mine: number|null, theirs: number|null, mineDefaulted: boolean, theirsDefaulted: boolean}>}
 */
export function simulatedColumns(mine, theirs) {
  const sim = (f) => ({
    stats: fighterDuelArgs(f).stats,
    defaulted: new Set(f.defaulted ?? completeDuelStats(f.stats, f.class, f.form ?? f.formKind ?? null).defaulted),
  });
  const a = sim(mine);
  const b = sim(theirs);
  [a.stats, b.stats] = applyPvpHpBuffPair(a.stats, b.stats, mine.level, theirs.level, DEFAULT_PVP_BALANCE);
  return SHEET_KEYS.filter((k) => !sheetKeyMeta(k).isRaw && (typeof a.stats[k] === 'number' || typeof b.stats[k] === 'number')).map((k) => ({
    key: k,
    label: k === 'totalHp' ? 'Health (PVP buff applied)' : statLabel(k),
    mine: a.stats[k] ?? null,
    theirs: b.stats[k] ?? null,
    mineDefaulted: a.defaulted.has(k),
    theirsDefaulted: b.defaulted.has(k),
  }));
}

/**
 * A finished duel task result as win-rate summaries from MY side, per seat.
 * `seat` is where the request put me: 'attacker', 'defender', or 'both' (attacker first, then the
 * swapped run that `both: true` adds as `result.swapped`). `total` pools the seats that ran.
 * @returns {{attack: Object|null, defend: Object|null, total: Object|null}}
 */
export function seatsFromResult(result, seat = 'attacker') {
  if (!result) return { attack: null, defend: null, total: null };
  const { swapped, trace, traceResult, ...first } = result; // eslint-disable-line no-unused-vars
  const attack = seat === 'defender' ? null : first;
  const defend = seat === 'attacker' ? null : fromMySide(seat === 'defender' ? first : swapped, 'defender');
  const ran = [attack, defend].filter((s) => s && s.n > 0);
  return { attack: attack?.n > 0 ? attack : null, defend: defend?.n > 0 ? defend : null, total: ran.length > 1 ? combineSeats(...ran) : ran[0] ?? null };
}

/** A stat value as the game's sheet prints it: flat with "." thousands, percentages as shown. */
export function displayStat(key, v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-';
  return sheetKeyMeta(key)?.kind === 'integer' ? formatFlat(v) : formatPct(toDisplay(key, v));
}
