// World Boss replay check: holds a `/world-boss/fight-start` response (combat-pve.md §1 World boss row: `fightId,
// bossHp, damageDealt, fightDurationMs, playerDied, combatLog`) to the app's World Boss fight (pve/fight.js
// simulatePve in the worldBoss mode, worldBossHooks). Rules: combat-pve.md §2 (tick), §4 (swings), §5-§7 (hits,
// regen), §16 (the boss and its affinities), §17 (event stream); updates-2.8.2.md §6 (rebound, wrath).
// The fight is server-run and its ramp, block roll, Enraged interval, rebound and wrath are [UNRESOLVED]
// (§16), so a rule that leans on them compares with the app's model and says so in its note: a failure
// there reads "the model differs from this log", not "the log is wrong". The server's RNG is not ours, so
// only what does not depend on a draw is compared exactly (fortressReplay.js's approach): the tick grid, the
// clocks and the spell schedule come from two seeded runs of the app's fight, and a schedule the two runs
// disagree on depends on draws and is not compared. A rule whose substantive comparison did not run reports
// `skipped` with the reason, never a pass. Pure (the two runs use their own seeded rng).
//
// The log codec is the 2.9.5 client's (module 4251, L1179626-1180616 of docs/2.9.5/gamedata/decompiled.js).
// It is the 2.7.0 codec (L1153579-1154378) with six fields appended to the bit table (dazeMs, stunSource,
// minionBlocked, chronoFlux, minionDeathWard, minionWard), so a 2.7.0 log decodes the same; the version
// number is still 1.
import { applyDamageReduction } from '../core/rolls.js';
import { WORLD_BOSS_CONSTANTS, WORLD_BOSS_AFFINITIES } from '../../game/worldBoss.js';
import { worldBossMob } from './enemies.js';
import { preparePveFighter, mobEntityOf, simulatePve, worldBossHooks } from './fight.js';
import { laneRng } from '../rng.js';

export const MAX_PER_RULE = 5;
export const WORLD_BOSS_REPLAY_RULES = Object.freeze([
  'shape', 'terminal', 'tick-grid', 'player-swings', 'boss-swings', 'spell-schedule', 'hit-sizes', 'regen',
  'hp-chain', 'affinity',
]);
const TICK = WORLD_BOSS_CONSTANTS.tickIntervalMs;
const REGEN_PULSE_MS = 100;

// ---------------------------------------------------------------------------------------------
// The client's log codec
// ---------------------------------------------------------------------------------------------

// WORLD_BOSS_COMBAT_LOG_VERSION / _MAX_BYTES (L1180611-1180614)
export const WORLD_BOSS_LOG_VERSION = 1;
export const WORLD_BOSS_LOG_MAX_BYTES = 400000;
// the bit table (L1180616): field i is bit i of a row's mask
export const WORLD_BOSS_LOG_FIELDS = Object.freeze([
  'damage', 'attackerHpAfter', 'defenderHpAfter', 'spellIndex', 'doubleHit', 'isCrit', 'debuffStacks',
  'debuffMaxStacks', 'debuffPermanent', 'damagePerTick', 'paralyzeMs', 'staggerStacks', 'bulwarkStacks',
  'sunderStacks', 'momentumStacks', 'attackerShieldHpAfter', 'minionHpAfter', 'minionMaxHp', 'minionRespawnMs',
  'summonReadyMs', 'dazeMs', 'stunSource', 'minionBlocked', 'chronoFlux', 'minionDeathWard', 'minionWard',
]);
const BIT = Object.freeze(Object.fromEntries(WORLD_BOSS_LOG_FIELDS.map((f, i) => [f, i])));
const MINION_GONE = -1; // L1180618: minionHpAfter's "no minion any more" marker
const STUN_SOURCES = Object.freeze(['SHIELD_BASH', 'REAP']); // L1180620
// fields copied as they are, in the encoder's order (after the spell, the booleans and the carried ones)
const PLAIN_A = ['debuffStacks', 'debuffMaxStacks'];
const PLAIN_B = ['damagePerTick', 'paralyzeMs', 'staggerStacks', 'bulwarkStacks', 'sunderStacks', 'momentumStacks'];
const PLAIN_C = ['minionMaxHp', 'minionRespawnMs', 'summonReadyMs', 'dazeMs'];
const spellKey = (s) => JSON.stringify([s.species, s.name, s.icon]); // spellKey L1179612-1179624

/**
 * Port of encodeWorldBossCombatLog (2.9.5 L1179626-1180144). Each row becomes `[dt, typeIndex, mask,
 * ...values]`: `dt` the time since the previous row, `typeIndex` into `types`, and one value per set mask
 * bit in bit order. `damage` is left out when 0; the HP and shield fields only when they change (the
 * decoder carries them); a spell is an index into `spells`; booleans are 1/0 (`minionBlocked` only when
 * true); a minion that is gone is `minionHpAfter: -1` once; `stunSource` is an index; `chronoFlux` only
 * when some row has it and it changes. Returns null when the JSON is longer than `maxBytes`.
 * @param {Array<Object>} events  rows with `timestamp`, `type` and the fields of WORLD_BOSS_LOG_FIELDS
 * @param {{max:number, variant?:string}|null} [shield]
 * @param {number} [maxBytes]
 */
export function encodeWorldBossLog(events, shield = null, maxBytes = WORLD_BOSS_LOG_MAX_BYTES) {
  const types = [];
  const typeIndex = new Map();
  const spells = [];
  const spellIndex = new Map();
  const ticks = [];
  let lastTs = 0;
  let lastAtk = null;
  let lastDef = null;
  let lastShield = null;
  let lastMinion = null;
  const hasChrono = events.some((e) => e.chronoFlux !== undefined);
  let lastChrono = 0;
  for (const e of events) {
    let ti = typeIndex.get(e.type);
    if (ti === undefined) {
      ti = types.length;
      types.push(e.type);
      typeIndex.set(e.type, ti);
    }
    let mask = 0;
    const values = [];
    const put = (field, v) => { mask |= 1 << BIT[field]; values.push(v); };
    if (e.damage !== 0) put('damage', e.damage);
    if (e.attackerHpAfter !== lastAtk) { put('attackerHpAfter', e.attackerHpAfter); lastAtk = e.attackerHpAfter; }
    if (e.defenderHpAfter !== lastDef) { put('defenderHpAfter', e.defenderHpAfter); lastDef = e.defenderHpAfter; }
    if (e.spell) {
      const k = spellKey(e.spell);
      let si = spellIndex.get(k);
      if (si === undefined) {
        si = spells.length;
        spells.push({ name: e.spell.name, icon: e.spell.icon, species: e.spell.species });
        spellIndex.set(k, si);
      }
      put('spellIndex', si);
    }
    if (e.doubleHit !== undefined) put('doubleHit', e.doubleHit ? 1 : 0);
    if (e.isCrit !== undefined) put('isCrit', e.isCrit ? 1 : 0);
    for (const f of PLAIN_A) if (e[f] !== undefined) put(f, e[f]);
    if (e.debuffPermanent !== undefined) put('debuffPermanent', e.debuffPermanent ? 1 : 0);
    for (const f of PLAIN_B) if (e[f] !== undefined) put(f, e[f]);
    if (e.attackerShieldHpAfter !== undefined && e.attackerShieldHpAfter !== lastShield) {
      put('attackerShieldHpAfter', e.attackerShieldHpAfter);
      lastShield = e.attackerShieldHpAfter;
    }
    if (e.minionHpAfter === undefined) {
      if (lastMinion !== null) { put('minionHpAfter', MINION_GONE); lastMinion = null; }
    } else if (e.minionHpAfter !== lastMinion) {
      put('minionHpAfter', e.minionHpAfter);
      lastMinion = e.minionHpAfter;
    }
    for (const f of PLAIN_C) if (e[f] !== undefined) put(f, e[f]);
    if (e.stunSource !== undefined) {
      const si = STUN_SOURCES.indexOf(e.stunSource);
      if (si >= 0) put('stunSource', si);
    }
    if (e.minionBlocked) put('minionBlocked', 1);
    if (hasChrono && e.chronoFlux !== undefined && e.chronoFlux !== lastChrono) {
      put('chronoFlux', e.chronoFlux);
      lastChrono = e.chronoFlux;
    }
    if (e.minionDeathWard !== undefined) put('minionDeathWard', e.minionDeathWard);
    if (e.minionWard !== undefined) put('minionWard', e.minionWard);
    ticks.push([e.timestamp - lastTs, ti, mask, ...values]);
    lastTs = e.timestamp;
  }
  const out = {
    v: WORLD_BOSS_LOG_VERSION, types, spells,
    ...(shield && shield.max > 0 ? { shieldMax: shield.max, shieldVariant: shield.variant } : {}),
    ...(hasChrono ? { chronoFlux: true } : {}),
    ticks,
  };
  return JSON.stringify(out).length > maxBytes ? null : out;
}

/**
 * Port of decodeWorldBossCombatLog (2.9.5 L1180147-1180597). Returns the rows (`timestamp`, `type`,
 * `damage` (0 when left out), `attackerHpAfter`, `defenderHpAfter`, `attackerShieldHpAfter` when the log
 * has a shield (it starts at `shieldMax`), `minionHpAfter` while a minion lives, `chronoFlux` when the log
 * has it, then the row's own optional fields). An array is returned unchanged (rows already decoded); a
 * JSON string is parsed first (a capture saved as text). Departures from the client, which returns `[]`
 * for a missing log or another version and throws on a malformed one: anything this cannot decode is
 * null, and it never throws. A row without its dt, type or mask is skipped, as in the client (L1180240).
 * @param {Object|Array|string} combatLog
 * @returns {Array<Object>|null}
 */
export function decodeWorldBossLog(combatLog) {
  if (Array.isArray(combatLog)) return combatLog;
  let log = combatLog;
  if (typeof log === 'string') {
    try { log = JSON.parse(log); } catch { return null; }
  }
  if (!log || typeof log !== 'object' || log.v !== WORLD_BOSS_LOG_VERSION || !Array.isArray(log.ticks)) return null;
  const types = Array.isArray(log.types) ? log.types : [];
  const spells = Array.isArray(log.spells) ? log.spells : [];
  const out = [];
  let ts = 0;
  let atk = 0;
  let def = 0;
  const shieldMax = log.shieldMax == null ? 0 : log.shieldMax;
  let shield = shieldMax;
  let minion = null;
  const chrono = log.chronoFlux === true;
  let flux = 0;
  for (const row of log.ticks) {
    if (!Array.isArray(row)) return null; // the client's slicedToArray throws here
    const [dt, ti, mask] = row;
    const type = types[ti == null ? -1 : ti];
    if (dt === undefined || mask === undefined || type === undefined) continue;
    if (typeof dt !== 'number' || typeof mask !== 'number') return null;
    ts += dt;
    let k = 3;
    const v = {};
    for (let b = 0; b < WORLD_BOSS_LOG_FIELDS.length; b++) {
      if ((mask & (1 << b)) === 0) continue;
      const x = row[k++];
      if (x !== undefined) v[WORLD_BOSS_LOG_FIELDS[b]] = x;
    }
    if (v.attackerHpAfter !== undefined) atk = v.attackerHpAfter;
    if (v.defenderHpAfter !== undefined) def = v.defenderHpAfter;
    if (v.attackerShieldHpAfter !== undefined) shield = v.attackerShieldHpAfter;
    if (v.minionHpAfter !== undefined) minion = v.minionHpAfter !== MINION_GONE ? v.minionHpAfter : null;
    if (v.chronoFlux !== undefined) flux = v.chronoFlux;
    const r = {
      timestamp: ts, type, damage: v.damage == null ? 0 : v.damage, attackerHpAfter: atk, defenderHpAfter: def,
      ...(shieldMax > 0 ? { attackerShieldHpAfter: shield } : {}),
      ...(minion !== null ? { minionHpAfter: minion } : {}),
      ...(chrono ? { chronoFlux: flux } : {}),
    };
    if (v.spellIndex !== undefined) {
      const s = spells[v.spellIndex];
      if (s) r.spell = { name: s.name, icon: s.icon, species: s.species };
    }
    if (v.doubleHit !== undefined) r.doubleHit = v.doubleHit === 1;
    if (v.isCrit !== undefined) r.isCrit = v.isCrit === 1;
    for (const f of PLAIN_A) if (v[f] !== undefined) r[f] = v[f];
    if (v.debuffPermanent !== undefined) r.debuffPermanent = v.debuffPermanent === 1;
    for (const f of PLAIN_B) if (v[f] !== undefined) r[f] = v[f];
    for (const f of PLAIN_C) if (v[f] !== undefined) r[f] = v[f];
    if (v.stunSource !== undefined && STUN_SOURCES[v.stunSource] !== undefined) r.stunSource = STUN_SOURCES[v.stunSource];
    if (v.minionBlocked === 1) r.minionBlocked = true;
    if (v.minionDeathWard !== undefined) r.minionDeathWard = v.minionDeathWard;
    if (v.minionWard !== undefined) r.minionWard = v.minionWard;
    out.push(r);
  }
  return out;
}

// The rows whose damage the replay screen adds up as the fight's damage (2.9.5 L1181720; 2.7.0 L1155379
// had no minion_thorns), summed with `damage > 0` as it plays them (applyWorldBossTicks, 2.7.0
// L1154633-1154649). It posts the rounded sum to /world-boss/fight-end when the player dies (L1748669-1748680).
export const WORLD_BOSS_DAMAGE_TYPES = Object.freeze(new Set([
  'attacker_hit', 'attacker_crit', 'defender_block', 'thorns_reflect', 'attacker_spell_damage',
  'attacker_spell_dot_tick', 'attacker_spell_debuff_tick', 'minion_hit', 'minion_crit', 'minion_thorns',
]));
/** The damage the client adds up from the rows. */
export const worldBossDamageOf = (rows) => rows.reduce((s, e) => (WORLD_BOSS_DAMAGE_TYPES.has(e.type) && e.damage > 0 ? s + e.damage : s), 0);

// ---------------------------------------------------------------------------------------------
// The app's fight as a response
// ---------------------------------------------------------------------------------------------

// The app's event fields under the log's names. Spell rows are `attacker_spell_*` in a World Boss log:
// the replay screen only treats `attacker_spell_` types as spells (isSpellTick L1154469-1154476) and
// strips the side before matching (spellBaseType L1154460-1154467), while the shared engine names them
// `spell_*` (§17). The other types keep their engine names.
const COPIED = ['spell', 'doubleHit', 'isCrit', ...PLAIN_A, 'debuffPermanent', ...PLAIN_B, ...PLAIN_C, 'stunSource',
  'minionBlocked', 'chronoFlux', 'minionDeathWard', 'minionWard'];
export const worldBossTypeOf = (type) => (type.startsWith('spell_') ? `attacker_${type}` : type);
function rowsOf(log) {
  return log.map((e) => {
    const r = {
      timestamp: e.timestamp, type: worldBossTypeOf(e.type), damage: e.damage ?? 0,
      attackerHpAfter: e.attackerHp, defenderHpAfter: e.defenderHp,
    };
    if (e.attackerShieldHp !== undefined) r.attackerShieldHpAfter = e.attackerShieldHp;
    if (e.minionHp !== undefined) r.minionHpAfter = e.minionHp;
    for (const k of COPIED) if (e[k] !== undefined) r[k] = e[k];
    return r;
  });
}

/**
 * A simulatePve World Boss run (with `log: true`) in the shape of a `/world-boss/fight-start` response:
 * `bossHp` the boss HP at the start, `damageDealt` the HP it lost, `fightDurationMs` the last tick,
 * `playerDied`, and `combatLog` encoded by the client's codec. The server's own size cap is not known, so
 * the encoder's is off by default (`maxBytes`).
 * @param {Object} sim  simulatePve result
 * @param {{shield?: {max:number, variant?:string}|null, fightId?: string|number, maxBytes?: number}} [o]
 */
export function worldBossResponseOf(sim, { shield = null, fightId = 'app-model', maxBytes = Infinity } = {}) {
  const rows = rowsOf(sim.log ?? []);
  // a fight the player outlasts ends with a `time_up` row at its last tick (combat-pve.md §16.2)
  const last = rows.at(-1);
  if (sim.timedOut && last) {
    rows.push({ timestamp: sim.timeMs, type: 'time_up', damage: 0, attackerHpAfter: last.attackerHpAfter, defenderHpAfter: last.defenderHpAfter });
  }
  return {
    fightId,
    bossHp: sim.enemyHpLeft + sim.damageDealt,
    damageDealt: sim.damageDealt,
    fightDurationMs: sim.timeMs,
    playerDied: !sim.won && !sim.timedOut,
    combatLog: encodeWorldBossLog(rows, shield, maxBytes),
  };
}

/**
 * The app's World Boss fight for one Fighter and affinity, the way the worldBoss target runs it
 * (search/objectives.js: the affinity's whole fight as the window).
 * @param {Object} attacker  a Fighter or a preparePveFighter result
 * @param {'NONE'|'FORTIFIED'|'ENRAGED'} affinity
 * @param {() => number} rng
 */
export function simulateWorldBoss(attacker, affinity, rng) {
  const mob = worldBossMob(affinity);
  return simulatePve({ fighter: attacker, enemy: mob, mode: 'worldBoss', maxMs: mob.fightDurationMs, rng, log: true });
}

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

// a player swing leaves one of these on its tick (the second hit of a double hit is not a new swing)
const PLAYER_SWING = new Set(['attacker_hit', 'attacker_crit', 'defender_block', 'defender_miss']);
// a boss swing: a hit, an avoid, a swing lost to control, or the minion taking it
const BOSS_SWING = new Set(['defender_hit', 'attacker_dead', 'attacker_block', 'attacker_miss', 'defender_blind',
  'defender_paralyze', 'defender_fear', 'minion_damaged']);
const BOSS_HIT = new Set(['defender_hit', 'attacker_dead']);
// boss swings whose loss rebounds under Rising Wrath (worldBossHooks CONTROLLED_LOST_SWINGS)
const LOST_SWING = new Set(['attacker_block', 'attacker_miss', 'defender_blind', 'defender_paralyze', 'defender_fear']);
const SPELL_SCHEDULE = new Set(['attacker_spell_cast', 'attacker_spell_buff_start', 'attacker_spell_end']);
// rows that take their damage off the boss in the engine (defender_miss is a penetration hit too)
const BOSS_DAMAGE = new Set([...WORLD_BOSS_DAMAGE_TYPES, 'defender_miss']);
// the spell pass: its rows carry the boss HP after the whole pass; the debuff pass likewise
const PASS = /^attacker_spell_(cast|damage|dot_tick|heal_tick|buff_start|end|debuff_applied|debuff_stack)$/;
const DEBUFF_PASS = /^attacker_spell_debuff_(tick|expired)$/;
const runClass = (type) => (PASS.test(type) ? 'pass' : DEBUFF_PASS.test(type) ? 'debuff' : null);

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const firstDiff = (a, b) => { const i = a.findIndex((v, k) => v !== b[k]); return i < 0 ? Math.min(a.length, b.length) : i; };
const swingTimes = (rows, set) => {
  const t = [];
  for (const e of rows) if (set.has(e.type) && !e.doubleHit && t.at(-1) !== e.timestamp) t.push(e.timestamp);
  return t;
};
const spellSchedule = (rows) => rows.filter((e) => SPELL_SCHEDULE.has(e.type))
  .map((e) => `${e.timestamp} ${e.type} ${e.spell?.species ?? e.spell?.name ?? ''}`);
// a spell among the player's own that changes one of these entity fields while it runs
const buffs = (configs, stats) => (configs ?? []).some((c) => {
  const sp = c.spell;
  return sp && (sp.spellType === 'TRANSFORM' || ((sp.spellType === 'BUFF' || sp.spellType === 'DEFENSE')
    && (sp.effects ?? []).some((e) => stats.includes(e.stat))));
});
// tick.js mitigateInline (private there): the enemy-hit DR step, without applyDamageReduction's d > 0 guard
const mitigateInline = (d, dr) => (dr > 0 ? Math.max(1, Math.round(d * (1 - dr / 100))) : d);
const cutBy = (d, mult) => (mult === 1 ? d : Math.round(d * mult));

/** The app's inputs for the attacker against this affinity, and two seeded runs of its fight. */
function modelOf(attacker, affinity) {
  const prepared = attacker.fresh ? attacker : preparePveFighter(attacker);
  const mob = worldBossMob(affinity);
  const f = prepared.fresh();
  const P = f.player;
  const runs = [1, 2].map((seed) => rowsOf(simulateWorldBoss(prepared, affinity, laneRng(seed)).log));
  return {
    P, B: mobEntityOf(mob), aff: mob.affinity, cap: mob.fightDurationMs, runs,
    hooks: worldBossHooks(mob.affinity, P.maxHp), spells: prepared.inputs.spells,
    stacks: !!f.stacks, chrono: !!f.chrono, summon: !!prepared.inputs.summon,
  };
}

/**
 * Runs every rule on one response.
 * @param {Object} response  `/world-boss/fight-start` body: `{fightId, bossHp, damageDealt, fightDurationMs,
 *   playerDied, combatLog}` (`combatLog` encoded, or rows already decoded)
 * @param {{attacker?: Object, affinity?: 'NONE'|'FORTIFIED'|'ENRAGED'}} [opts]  the player's Fighter (the
 *   sheet the server used) and the session's affinity
 * @returns {{ok: boolean, mismatches: Array<Object>, rules: Array<Object>, totalMismatches: number}}
 */
export function worldBossReplayCheck(response, { attacker = null, affinity = null } = {}) {
  const mismatches = [];
  const rules = [];
  let total = 0;
  const run = (rule, fn) => {
    const r = { rule, status: 'pass', checked: 0, failed: 0 };
    rules.push(r);
    const c = {
      skip(note) { r.status = 'skipped'; r.note = r.note ? `${note}; ${r.note}` : note; },
      note(n) { r.note = r.note ? `${r.note}; ${n}` : n; },
      ok() { r.checked++; },
      bad(message, extra = {}) {
        r.checked++;
        r.failed++;
        total++;
        if (r.failed <= MAX_PER_RULE) mismatches.push({ rule, message, ...extra });
      },
    };
    fn(c);
    if (r.failed > 0) r.status = 'fail';
    else if (r.status === 'pass' && r.checked === 0) { r.status = 'skipped'; r.note ??= 'nothing to compare'; }
    return r;
  };
  const finish = () => ({ ok: !rules.some((r) => r.status === 'fail'), mismatches, rules, totalMismatches: total });

  const rows = response && typeof response === 'object' ? decodeWorldBossLog(response.combatLog) : null;
  // ---- shape: the fields the client reads (startWorldBossFight L1178209-1178480) and a decodable log ----
  const shape = run('shape', (c) => {
    if (!response || typeof response !== 'object') return c.bad('the response is not an object');
    if (!rows) return c.bad('combatLog does not decode (not a version-1 World Boss log)');
    if (response.fightId != null) c.ok(); else c.bad('fightId is missing');
    for (const k of ['bossHp', 'damageDealt', 'fightDurationMs']) {
      if (Number.isFinite(response[k])) c.ok(); else c.bad(`${k} is not a number`, { actual: response[k] });
    }
    if (typeof response.playerDied === 'boolean') c.ok(); else c.bad('playerDied is not a boolean', { actual: response.playerDied });
    let prev = -Infinity;
    rows.forEach((e, i) => {
      if (!e || typeof e.type !== 'string' || !Number.isFinite(e.timestamp) || !Number.isFinite(e.damage)
        || !Number.isFinite(e.attackerHpAfter) || !Number.isFinite(e.defenderHpAfter)) {
        return c.bad('row is missing timestamp/type/damage/hp fields', { index: i });
      }
      if (e.timestamp < prev) c.bad('timestamps go backwards', { index: i, timestamp: e.timestamp });
      else c.ok();
      prev = e.timestamp;
    });
  });
  if (shape.status === 'fail') {
    for (const r of WORLD_BOSS_REPLAY_RULES) if (r !== 'shape') rules.push({ rule: r, status: 'skipped', checked: 0, failed: 0, note: 'malformed response' });
    return finish();
  }

  const aff = affinity ? WORLD_BOSS_AFFINITIES[affinity] ?? null : null;
  const model = attacker && aff ? modelOf(attacker, affinity) : null;
  const needSheet = 'needs the attacker\'s sheet';
  const needAff = 'needs the affinity';
  const needBoth = !attacker && !aff ? `${needSheet} and the affinity` : !attacker ? needSheet : needAff;
  const MODEL = 'compared with the app\'s model; the server rule is not known';
  const last = rows.at(-1);
  const end = last?.timestamp ?? 0;
  // the opening summon window: the fight's clock starts when the minion is ready (§12)
  const window = Math.max(0, ...rows.filter((e) => e.timestamp === 0).map((e) => e.summonReadyMs ?? 0));
  const deathAt = rows.findIndex((e) => e.type === 'attacker_dead');

  // ---- terminal: duration, death and the damage the client adds up ----
  run('terminal', (c) => {
    if (!last) return c.bad('empty combatLog');
    if (last.timestamp <= response.fightDurationMs) c.ok();
    else c.bad('rows run past fightDurationMs', { index: rows.length - 1, expected: `<= ${response.fightDurationMs}`, actual: last.timestamp });
    if (response.playerDied === (deathAt >= 0)) c.ok();
    else c.bad(response.playerDied ? 'playerDied but no attacker_dead row' : 'an attacker_dead row but not playerDied', { index: deathAt >= 0 ? deathAt : undefined });
    if (deathAt >= 0) {
      const d = rows[deathAt];
      if (d.attackerHpAfter === 0) c.ok(); else c.bad('the death row has HP left', { index: deathAt, expected: 0, actual: d.attackerHpAfter });
      if (last.timestamp === d.timestamp) c.ok(); else c.bad('rows follow the death tick', { index: deathAt, expected: d.timestamp, actual: last.timestamp });
    }
    // the server closes a fight the player outlasts with one `time_up` row (combat-pve.md §16.2)
    const up = rows.findIndex((e) => e.type === 'time_up');
    if (up >= 0) {
      if (up === rows.length - 1 && rows[up].timestamp === response.fightDurationMs && rows[up].damage === 0 && deathAt < 0) c.ok();
      else c.bad('time_up is not the last row, at fightDurationMs, of a fight the player outlasted', { index: up, expected: response.fightDurationMs, actual: rows[up].timestamp });
    }
    const sum = worldBossDamageOf(rows);
    if (sum === response.damageDealt) c.ok();
    else c.bad('damageDealt is not the damage the client adds up from the rows', { expected: sum, actual: response.damageDealt });
    if (aff) {
      // the app's fight runs to the affinity's length unless the player dies, and reports its last tick
      const want = deathAt >= 0 ? rows[deathAt].timestamp : aff.maxFightDurationMs ?? WORLD_BOSS_CONSTANTS.fightDurationMs;
      if (response.fightDurationMs === want) c.ok();
      else c.bad(deathAt >= 0 ? 'fightDurationMs is not the death tick' : 'fightDurationMs is not the affinity\'s fight length', { expected: want, actual: response.fightDurationMs });
      c.note(`fightDurationMs ${MODEL}`);
    }
  });

  // ---- tick-grid: every row on the 100 ms World Boss tick (§16), counted from the opening window ----
  run('tick-grid', (c) => {
    rows.forEach((e, i) => {
      if (e.timestamp === 0 || (e.timestamp > window && (e.timestamp - window) % TICK === 0)) c.ok();
      else c.bad(`row off the ${TICK} ms tick grid`, { index: i, timestamp: e.timestamp });
    });
  });

  // the model's rows up to the shorter of the log and both runs (a death ends a run at a drawn time)
  const upTo = model ? Math.min(end, ...model.runs.map((r) => r.at(-1)?.timestamp ?? 0)) : 0;
  const schedule = (c, of, label) => {
    const [m1, m2] = model.runs.map((r) => of(r.filter((e) => e.timestamp <= upTo)));
    if (!sameList(m1, m2)) return c.skip(`${label} depends on draws (two seeded runs disagree)`);
    const actual = of(rows.filter((e) => e.timestamp <= upTo));
    if (!m1.length && !actual.length) return c.skip(`no ${label} to compare`);
    if (sameList(actual, m1)) { for (let i = 0; i < actual.length; i++) c.ok(); return; }
    const at = firstDiff(actual, m1);
    c.bad(`${label} differs from the app's`, { index: at, expected: m1[at], actual: actual[at] });
  };

  // ---- player-swings: the app's swing clock (sheet speed, its own attack-speed buffs) ----
  run('player-swings', (c) => {
    if (!model) return c.skip(needBoth);
    schedule(c, (r) => swingTimes(r, PLAYER_SWING), 'the player swing clock');
    c.note('compared with the app\'s fight (the shared engine\'s clock, §4); whether the server runs it is not known');
  });

  // ---- boss-swings: none for Dormant and Adamant Scales; Rising Wrath on the app's ramping clock ----
  run('boss-swings', (c) => {
    if (!aff) return c.skip(needAff);
    if (!(aff.hitDamagePctOfMaxHp > 0)) {
      // the in-game text: "does not hit back" (§16)
      const i = rows.findIndex((e) => BOSS_SWING.has(e.type));
      if (i < 0) c.ok(); else c.bad('the boss swings, but this affinity does not hit back', { index: i, actual: rows[i].type });
      return;
    }
    if (!model) return c.skip(needSheet);
    if (rows.some((e) => DEBUFF_PASS.test(e.type) || e.type === 'attacker_spell_debuff_applied')) return c.skip('a debuff on the boss may slow its swing clock');
    schedule(c, (r) => swingTimes(r, BOSS_SWING), 'the boss swing clock');
    c.note(`${MODEL} (the Enraged interval and ramp, §16)`);
  });

  // ---- spell-schedule: the player's cast, buff and end rows on the app's schedule ----
  run('spell-schedule', (c) => {
    if (!model) return c.skip(needBoth);
    schedule(c, spellSchedule, 'the spell schedule');
    c.note('compared with the app\'s fight (cooldowns and the opening delay, §10)');
  });

  // sizes of the player's swings and the boss's hits
  const P = model?.P;
  const wrath = model?.hooks?.wrath ?? null;
  const wrathFrom = wrath ? window + wrath.afterMs : Infinity;
  const dr = model?.B.damageReduction ?? 0;
  const playerSizes = model && {
    N: applyDamageReduction(P.attack, dr),
    C: applyDamageReduction(Math.round(P.attack * P.critDamage), dr),
    pen: P.penetration > 0 && !(model.B.missChance > 0)
      ? [1, P.critDamage].map((m) => mitigateInline(Math.round(Math.round((P.attack * P.penetration) / 100) * m), dr))
      : [0],
  };
  const playerSizesFixed = model && !model.stacks && !buffs(model.spells, ['ATTACK_PERCENT', 'CRIT_DAMAGE', 'PENETRATION']);
  const debuffed = rows.some((e) => e.type === 'attacker_spell_debuff_applied');
  const bossSizesFixed = model && !model.stacks && !debuffed && !buffs(model.spells, ['DAMAGE_REDUCTION']);
  const bossAttackAt = (ts) => model.hooks?.enemyAt?.(ts)?.attack ?? 0;
  const playerWant = (e) => {
    const m = e.timestamp >= wrathFrom ? wrath.mult : 1;
    const list = e.type === 'defender_block' ? playerSizes.pen : e.type === 'attacker_crit' ? [playerSizes.C] : [playerSizes.N];
    return list.map((x) => cutBy(x, m));
  };

  // ---- hit-sizes: player swings from the sheet (the wrath cut after its start); boss hits from the model ----
  run('hit-sizes', (c) => {
    if (!model) return c.skip(needBoth);
    rows.forEach((e, i) => {
      if (playerSizesFixed && (e.type === 'attacker_hit' || e.type === 'attacker_crit' || e.type === 'defender_block')) {
        const want = playerWant(e);
        if (want.includes(e.damage)) c.ok();
        else c.bad(`player ${e.type} size differs from the sheet`, { index: i, timestamp: e.timestamp, expected: want.join(' or '), actual: e.damage });
      } else if (bossSizesFixed && BOSS_HIT.has(e.type)) {
        const want = mitigateInline(bossAttackAt(e.timestamp), P.damageReduction);
        if (e.damage === want) c.ok();
        else c.bad('boss hit size differs from the model', { index: i, timestamp: e.timestamp, expected: want, actual: e.damage });
      }
    });
    if (!playerSizesFixed) c.note('an attack, crit-damage or penetration buff or a stack sigil changes the player\'s sizes: only boss hits compared');
    if (wrath || aff.blockChance > 0 || aff.hitDamagePctOfMaxHp > 0) c.note(`the wrath cut, the boss's block (penetration path) and its hits are ${MODEL}`);
  });

  // ---- regen: pulses on the 100 ms grid from the opening window, sized from the sheet HP ----
  run('regen', (c) => {
    const regen = rows.map((e, i) => ({ e, i })).filter(({ e }) => e.type === 'attacker_regen');
    for (const { e, i } of regen) {
      if (e.timestamp > window && (e.timestamp - window) % REGEN_PULSE_MS === 0) c.ok();
      else c.bad('regen pulse off the 100 ms grid', { index: i, timestamp: e.timestamp });
    }
    if (!model) return c.skip(`pulse sizes not compared (grid only): ${needBoth}`);
    if (model.stacks || buffs(model.spells, ['HP_REGEN', 'HP_PERCENT'])) return c.skip('pulse sizes not compared (grid only): a regen or max-HP buff or a stack sigil');
    const pulse = P.hpRegen > 0 ? Math.max(1, Math.round((P.maxHp * P.hpRegen) / 100 / 10)) : 0;
    for (const { e, i } of regen) {
      const p = rows[i - 1];
      if (!p) continue;
      // a transform's rows sit before the combat rows of their tick with the HP after it (fight.js step 8)
      if (model.chrono && p.timestamp === e.timestamp && p.type.startsWith('attacker_spell_')) continue;
      const gain = e.attackerHpAfter - p.attackerHpAfter;
      if (gain === pulse || (gain > 0 && gain < pulse && e.attackerHpAfter === P.maxHp)) c.ok();
      else c.bad('regen pulse has the wrong size', { index: i, timestamp: e.timestamp, expected: pulse, actual: gain });
    }
  });

  // ---- hp-chain: the boss HP from bossHp down by every damaging row; boss hits take their damage off ----
  run('hp-chain', (c) => {
    let hp = response.bossHp;
    let i = 0;
    while (i < rows.length) {
      const cls = runClass(rows[i].type);
      if (cls) {
        // a pass: its rows carry the boss HP after the whole pass (fight.js steps 4-5)
        let j = i;
        let dmg = 0;
        while (j < rows.length && rows[j].timestamp === rows[i].timestamp && runClass(rows[j].type) === cls) {
          if (BOSS_DAMAGE.has(rows[j].type)) dmg += rows[j].damage;
          j++;
        }
        hp = Math.max(0, hp - dmg);
        for (let k = i; k < j; k++) {
          if (!BOSS_DAMAGE.has(rows[k].type)) continue;
          if (rows[k].defenderHpAfter === hp) c.ok();
          else c.bad(`${rows[k].type}: boss HP is not the value after its pass`, { index: k, timestamp: rows[k].timestamp, expected: hp, actual: rows[k].defenderHpAfter });
        }
        i = j;
        continue;
      }
      const e = rows[i];
      if (BOSS_DAMAGE.has(e.type)) {
        hp = Math.max(0, hp - e.damage);
        if (e.defenderHpAfter === hp) c.ok();
        else c.bad(`${e.type}: boss HP did not drop by the damage`, { index: i, timestamp: e.timestamp, expected: hp, actual: e.defenderHpAfter });
      } else if (e.type === 'defender_dead') {
        if (e.defenderHpAfter === 0 && hp === 0) c.ok(); else c.bad('defender_dead with boss HP left', { index: i, expected: 0, actual: [hp, e.defenderHpAfter] });
      }
      i++;
    }
    // the player side: a boss hit takes exactly its damage off (no shield), else never raises HP
    const exact = model ? !(P.shieldMax > 0) : false;
    for (let k = 1; k < rows.length; k++) {
      const e = rows[k];
      if (!BOSS_HIT.has(e.type)) continue;
      const p = rows[k - 1];
      if (model?.chrono && p.timestamp === e.timestamp && p.type.startsWith('attacker_spell_')) continue;
      const want = Math.max(0, p.attackerHpAfter - e.damage);
      if (exact ? e.attackerHpAfter === want : e.attackerHpAfter <= p.attackerHpAfter) c.ok();
      else c.bad('player HP after a boss hit is wrong', { index: k, timestamp: e.timestamp, expected: exact ? want : `<= ${p.attackerHpAfter}`, actual: e.attackerHpAfter });
    }
    c.note('the boss HP starts at bossHp, as the replay screen shows it (L1152229-1152236)');
    if (!exact && rows.some((e) => BOSS_HIT.has(e.type))) c.note('player HP after a boss hit is only held to "never rises" (no sheet, or a shield)');
  });

  // ---- affinity: the affinity's own mechanics ----
  run('affinity', (c) => {
    if (!aff) return c.skip(needAff);
    if (!aff.lethal) {
      // Dormant / Adamant Scales: no hit back, so no damage taken and no death (§16)
      if (!response.playerDied) c.ok(); else c.bad('the player died to an affinity that does not hit back');
      if (model) {
        // HP only falls when a max-HP buff or Bulwark ends and clamps it back to the sheet HP (fight.js step 4)
        const clamps = model.stacks || buffs(model.spells, ['HP_PERCENT']);
        for (let k = 1; k < rows.length; k++) {
          const [p, e] = [rows[k - 1], rows[k]];
          if (e.attackerHpAfter >= p.attackerHpAfter || (clamps && e.attackerHpAfter === P.maxHp)) c.ok();
          else c.bad('the player lost HP to an affinity that does not hit back', { index: k, timestamp: e.timestamp, expected: `>= ${p.attackerHpAfter}`, actual: e.attackerHpAfter });
        }
      } else c.note(`player HP not followed: ${needSheet}`);
    }
    if (!(aff.blockChance > 0)) {
      // Dormant: "does not block" (§16)
      const i = rows.findIndex((e) => e.type === 'defender_block');
      if (i < 0) c.ok(); else c.bad('the boss blocked, but this affinity does not block', { index: i });
    } else if (model && playerSizesFixed) {
      // Adamant Scales: the block share is a draw, so only the sizes of blocked swings are compared
      rows.forEach((e, i) => {
        if (e.type !== 'defender_block') return;
        const want = playerWant(e);
        if (want.includes(e.damage)) c.ok();
        else c.bad('a blocked swing is not the penetration hit', { index: i, timestamp: e.timestamp, expected: want.join(' or '), actual: e.damage });
      });
      c.note(`the block share cannot be compared (a draw); blocked swing sizes are ${MODEL}`);
    }
    if (aff.lethal) {
      // Rising Wrath: the fight ends with the death, or at its cap
      const cap = aff.maxFightDurationMs ?? WORLD_BOSS_CONSTANTS.fightDurationMs;
      if (response.playerDied || response.fightDurationMs >= cap) c.ok();
      else c.bad('the fight ended before the cap without a death', { expected: `death or ${cap}`, actual: response.fightDurationMs });
      // every lost boss swing rebounds on its tick (updates-2.8.2.md §6)
      const byTs = new Map();
      for (const [i, e] of rows.entries()) {
        let l = byTs.get(e.timestamp);
        if (!l) byTs.set(e.timestamp, (l = []));
        l.push(i);
      }
      const pct = aff.avoidedReboundPct ?? 0;
      const sizes = model && !model.stacks && !debuffed;
      for (const [ts, idx] of byTs) {
        const lost = idx.filter((i) => LOST_SWING.has(rows[i].type) && (aff.controlledSwingsRebound || rows[i].type === 'attacker_block' || rows[i].type === 'attacker_miss'));
        if (!lost.length || pct <= 0) continue;
        const th = idx.find((i) => rows[i].type === 'thorns_reflect');
        if (th === undefined) { c.bad(`a lost boss swing (${rows[lost[0]].type}) has no rebound row`, { index: lost[0], timestamp: ts }); continue; }
        if (!sizes) { c.ok(); continue; }
        const want = lost.length * Math.round((bossAttackAt(ts) * pct) / 100);
        if (rows[th].damage === want) c.ok();
        else c.bad(`the rebound is not ${pct} % of the boss hit (uncut by wrath)`, { index: th, timestamp: ts, expected: want, actual: rows[th].damage });
      }
      c.note(`the rebound and its size are ${MODEL}`);
      if (model && !sizes) c.note('a stack sigil or a debuff changes the rebound: only its presence is compared');
    }
  });

  return finish();
}
