// Celestial replay check: drives simulateCelestial with the outcomes a server log reveals (crits,
// double hits, blinds, paralyses, avoids, each add's first-swing phase) and compares every logged
// event with the engine's: same timestamp, type, player and add, then damage, HP, boss and add HP,
// Block Fury, the stack counters, Chrono Flux and the Burden count. Rules: Game/combat-pve.md §20.
// Pure; no rng (a roll the log does not cover resolves to "no").
import { simulateCelestial } from './celestial.js';

const SWING_TYPES = new Set(['player_attack', 'player_crit', 'player_attack_add', 'player_crit_add']);
const ENEMY_HIT_TYPES = new Set(['add_attack', 'add_block', 'player_death']);

/** The `celestialResult` of a fight-start response, a fixture, or the result itself. */
export const celestialResultOf = (x) => x?.celestialResult ?? x;

/**
 * The rolls a log reveals, in the shape of celestialRolls. Every query names the tick, so an engine
 * that swings on a tick the server did not gets "no" (and the comparison reports the stray event).
 * @param {Object} celestialResult
 */
export function celestialLogRolls(celestialResult) {
  const at = new Map();
  for (const t of celestialResult.ticks) {
    const k = `${t.timestamp}|${t.playerIndex}`;
    let list = at.get(k);
    if (!list) at.set(k, (list = []));
    list.push(t);
  }
  const firstSwing = new Map();
  const spawnAt = new Map();
  for (const t of celestialResult.ticks) {
    if (t.type === 'add_spawn') spawnAt.set(t.addId, t.timestamp);
    else if (ENEMY_HIT_TYPES.has(t.type) && t.addId > 0 && !firstSwing.has(t.addId)) firstSwing.set(t.addId, t.timestamp);
  }
  const rows = (p, ts) => at.get(`${ts}|${p}`) ?? [];
  return {
    crit: (p, _pct, ts) => rows(p, ts).some((t) => SWING_TYPES.has(t.type) && !t.doubleHit && t.isCrit === true),
    double: (p, _pct, ts) => rows(p, ts).some((t) => t.doubleHit === true),
    blind: (p, _pct, ts) => rows(p, ts).some((t) => t.type === 'boss_blinded'),
    paralyze: (p, _pct, ts) => rows(p, ts).some((t) => t.type === 'boss_paralyzed'),
    avoid: (p, _pct, ts, addId) => rows(p, ts).some((t) => (addId > 0
      ? t.type === 'add_block' && t.addId === addId
      : t.type === 'player_block' && t.addId === -1)),
    addPhase: (addId, ts) => (firstSwing.has(addId) && spawnAt.has(addId) ? firstSwing.get(addId) - spawnAt.get(addId) : 1000),
  };
}

const keyOf = (t) => `${t.type}|${t.playerIndex}|${t.addId}`;
const HP_EPS = 0.01;
const sameNum = (a, b) => (a === b) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < HP_EPS);

/** The compared fields of a matched event pair, with how each is compared. */
const FIELDS = [
  ['damage', (a, b) => a === b],
  ['bossHpAfter', (a, b) => a === b],
  ['addHpAfter', (a, b) => a === b],
  ['blockFuryStacks', (a, b) => a === b],
  ['bulwarkStacks', (a, b) => a === b],
  ['sunderStacks', (a, b) => a === b],
  ['burdenStacks', (a, b) => a === b],
  ['damagePerTick', (a, b) => a === b],
  ['debuffStacks', (a, b) => a === b],
];

/**
 * @typedef {Object} CelestialReplayReport
 * @property {{logged: number, matched: number, missing: number, extra: number}} events
 * @property {Object<string, {checked: number, failed: number}>} fields  damage, hp, bossHpAfter, ...
 * @property {number} ticksChecked  logged events whose every compared field matched
 * @property {Array<Object>} mismatches  first `maxMismatches`
 * @property {{won: boolean, timeMs: number}} engine
 * @property {{won: boolean, timeMs: number}} server
 */

/**
 * Replay a logged Celestial fight through the engine and compare it event by event.
 * @param {Object} fight  the fixture / response (`celestialResult` inside, or the result itself)
 * @param {Object} o
 * @param {Array<Object>} o.party  Fighters in party order
 * @param {'NORMAL'|'HARD'} o.difficulty
 * @param {Object} [o.tactics]
 * @param {number} [o.stackPlayerIndex]
 * @param {Array<{timestamp: number, reason: string}>} [o.resync]  listed unexplained ticks: after each,
 *   the engine's player HP is reset to the logged value so one known miss does not cascade
 * @param {number} [o.maxMismatches=40]
 * @returns {CelestialReplayReport}
 */
export function celestialReplay(fight, o) {
  const cr = celestialResultOf(fight);
  const resyncAt = new Map((o.resync ?? []).map((r) => [r.timestamp, r]));
  const lastRowAt = new Map();
  for (const t of cr.ticks) lastRowAt.set(t.timestamp, t);
  const sim = simulateCelestial({
    party: o.party,
    difficulty: o.difficulty,
    level: cr.highestLevel,
    tankIndex: cr.tankIndex,
    stackPlayerIndex: o.stackPlayerIndex,
    tactics: o.tactics,
    rolls: celestialLogRolls(cr),
    log: true,
    afterTick: (ts, state) => {
      if (!resyncAt.has(ts)) return;
      const row = lastRowAt.get(ts);
      state.members.forEach((m, i) => { m.hp = row.playerHpsAfter[i]; });
    },
  });
  return compareCelestialLogs(cr.ticks, sim.log, {
    maxMismatches: o.maxMismatches ?? 40,
    engine: { won: sim.won, timeMs: sim.timeMs },
    server: { won: cr.success === true, timeMs: cr.totalDuration },
  });
}

/** Group rows by timestamp, keeping order. */
function byTimestamp(rows) {
  const m = new Map();
  for (const t of rows) {
    let list = m.get(t.timestamp);
    if (!list) m.set(t.timestamp, (list = []));
    list.push(t);
  }
  return m;
}

/**
 * Event-by-event comparison of a server log and an engine log (both in the server's tick shape).
 * Within a timestamp the rows are paired in order by (type, player, add); unpaired rows count as
 * missing (logged, not produced) or extra (produced, not logged).
 */
export function compareCelestialLogs(logRows, engineRows, { maxMismatches = 40, engine, server } = {}) {
  const L = byTimestamp(logRows);
  const E = byTimestamp(engineRows);
  const fields = { hp: { checked: 0, failed: 0 }, chronoFlux: { checked: 0, failed: 0 } };
  for (const [f] of FIELDS) fields[f] = { checked: 0, failed: 0 };
  const events = { logged: logRows.length, matched: 0, missing: 0, extra: 0 };
  const mismatches = [];
  let ticksChecked = 0;
  const miss = (m) => { if (mismatches.length < maxMismatches) mismatches.push(m); };
  const stamps = [...new Set([...L.keys(), ...E.keys()])].sort((a, b) => a - b);
  for (const ts of stamps) {
    const lr = L.get(ts) ?? [];
    const er = [...(E.get(ts) ?? [])];
    const used = new Array(er.length).fill(false);
    let from = 0;
    for (const t of lr) {
      const k = keyOf(t);
      let j = -1;
      for (let x = from; x < er.length; x++) if (!used[x] && keyOf(er[x]) === k) { j = x; break; }
      if (j < 0) {
        events.missing += 1;
        miss({ timestamp: ts, kind: 'missing', type: t.type, playerIndex: t.playerIndex, addId: t.addId });
        continue;
      }
      used[j] = true;
      from = j + 1;
      events.matched += 1;
      const e = er[j];
      let ok = true;
      for (const [f, eq] of FIELDS) {
        if (!(f in t)) continue;
        fields[f].checked += 1;
        if (!eq(t[f], e[f])) {
          fields[f].failed += 1;
          ok = false;
          miss({ timestamp: ts, kind: f, type: t.type, playerIndex: t.playerIndex, addId: t.addId, expected: t[f], actual: e[f] });
        }
      }
      for (const [f, rec] of [['playerHpsAfter', fields.hp], ['chronoFlux', fields.chronoFlux]]) {
        if (!Array.isArray(t[f])) continue;
        t[f].forEach((v, i) => {
          rec.checked += 1;
          if (!sameNum(v, e[f]?.[i])) {
            rec.failed += 1;
            ok = false;
            miss({ timestamp: ts, kind: `${f}[${i}]`, type: t.type, playerIndex: t.playerIndex, addId: t.addId, expected: v, actual: e[f]?.[i] });
          }
        });
      }
      if (ok) ticksChecked += 1;
    }
    er.forEach((e, x) => {
      if (used[x]) return;
      events.extra += 1;
      miss({ timestamp: ts, kind: 'extra', type: e.type, playerIndex: e.playerIndex, addId: e.addId });
    });
  }
  return { events, fields, ticksChecked, mismatches, engine, server };
}
