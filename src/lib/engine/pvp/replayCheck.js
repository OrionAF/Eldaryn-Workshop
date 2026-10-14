// Server-log replay check (rebuild-plan §3, E9): compares an exported `/arena/fight` response with the
// rules of pvp/resolver.js. The server's RNG is not ours, so only what does not depend on it is
// compared exactly: the deterministic skeleton (tick grid, swing times, regen pulses, the opening
// summon window, spell cast lower bounds, the x8 max HP) and the sizes a hit can have. Rules: Game/
// combat-pvp.md §4 (tick loop), §6 (swing), §7 (regen), §8 (spells), §10 (winner), §11 (event model).
//
// Two inputs: the response (`{result}` or the bare `result`) and, optionally, the two fighters the
// fight was between (Fighters or fighterDuelArgs output). Without fighters the same rules run on what
// the log itself shows (an interval is inferred from the swing times; sizes must be self-consistent);
// with them the log is held to the sheet. A rule that cannot be decided reports `skipped` with the
// reason, never a pass. Pure; no rng.
import { ARENA_CONSTANTS } from '../../game/combatPvp.js';
import { pvpRatingToFraction, REGEN_PULSE_MS } from './attack.js';
import { createDuelState } from './reactions.js';
import { fighterDuelArgs } from './resolver.js';
import { parseEventType } from './events.js';
import { initSpellRuntimes } from '../core/spells.js';
import { openingSummonWindowMs } from '../core/minions.js';

/** @typedef {import('./events.js').DuelEvent} DuelEvent */
/**
 * @typedef {Object} ReplayMismatch
 * @property {string} rule
 * @property {string} message
 * @property {number} [index]  row index in `ticks`
 * @property {number} [timestamp]
 * @property {*} [expected]
 * @property {*} [actual]
 */
/**
 * @typedef {Object} ReplayRule
 * @property {string} rule
 * @property {'pass'|'fail'|'skipped'} status
 * @property {number} checked  items compared
 * @property {number} failed
 * @property {string} [note]  why a rule was skipped, or what it assumed
 */
/**
 * @typedef {Object} ReplayReport
 * @property {boolean} ok  no rule failed (skipped rules do not fail)
 * @property {ReplayMismatch[]} mismatches  at most MAX_PER_RULE per rule
 * @property {ReplayRule[]} rules
 * @property {number} totalMismatches  count before the per-rule cap
 */

const TICK = ARENA_CONSTANTS.TICK_INTERVAL_MS;
const FIGHT_MS = ARENA_CONSTANTS.FIGHT_DURATION_MS;
export const MAX_PER_RULE = 5;
export const RULES = Object.freeze([
  'shape', 'terminal', 'max-hp', 'opening', 'swing-times', 'regen', 'spell-casts', 'hit-sizes', 'hp-chain',
]);

const SIDES = ['attacker', 'defender'];
const other = (s) => (s === 'attacker' ? 'defender' : 'attacker');
// Row kinds one swing leaves: swinger-named (hit, crit, lost swing) and target-named (avoid, minion).
const SWING_BY_SWINGER = ['hit', 'crit', 'blind', 'paralyze', 'fear'];
const SWING_BY_TARGET = ['miss', 'block', 'minion_damaged'];

// pvp/attack.js mitigate (private there): the same three steps in the same order.
function mitigate(x, atk, def) {
  if (def.damageReduction > 0) x = Math.max(1, Math.round(x * (1 - def.damageReduction / 100)));
  if (atk.pvpAttack > 0) x = Math.round(x * (1 + pvpRatingToFraction(atk.pvpAttack)));
  if (def.pvpDefense > 0) x = Math.max(1, Math.round(x * (1 - pvpRatingToFraction(def.pvpDefense))));
  return x;
}

/** Swing times of a side with a constant interval: one timer step per tick from `base` to `end`. */
function modelSwingTimes(interval, base, end) {
  const out = [];
  if (!(interval > 0) || !Number.isFinite(interval)) return out;
  let timer = 0;
  for (let t = base + TICK; t <= end; t += TICK) {
    timer += TICK;
    if (timer >= interval) { timer -= interval; out.push(t); }
  }
  return out;
}

const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Runs every rule on one response.
 * @param {Object} response  `/arena/fight` body: `{result: ArenaPvpResult}` or the result itself
 * @param {{attacker?: Object, defender?: Object}} [fighters]  both or neither; Fighters or
 *   fighterDuelArgs output (the sheet the server used, before or after the x8 buff)
 * @returns {ReplayReport}
 */
export function replayCheck(response, fighters = {}) {
  const res = response?.result ?? response;
  const mismatches = [];
  const rules = [];
  let total = 0;

  const run = (rule, fn) => {
    const r = { rule, status: 'pass', checked: 0, failed: 0 };
    rules.push(r);
    const c = {
      skip(note) { r.status = 'skipped'; r.note = note; },
      note(n) { r.note = n; },
      ok() { r.checked++; },
      bad(message, extra = {}) {
        r.checked++;
        r.failed++;
        total++;
        if (r.failed <= MAX_PER_RULE) mismatches.push({ rule, message, ...extra });
      },
    };
    fn(c);
    if (r.status !== 'skipped' && r.failed > 0) r.status = 'fail';
    return r;
  };
  const finish = () => ({ ok: !rules.some((r) => r.status === 'fail'), mismatches, rules, totalMismatches: total });

  // ---- shape: the rest of the rules need a well-formed log ----
  const shape = run('shape', (c) => {
    if (!res || typeof res !== 'object') return c.bad('response has no result object');
    if (!Array.isArray(res.ticks)) c.bad('result.ticks is not an array');
    for (const k of ['totalDuration', 'attackerMaxHp', 'defenderMaxHp', 'attackerHpRemaining', 'defenderHpRemaining']) {
      if (!Number.isFinite(res[k])) c.bad(`result.${k} is not a number`, { actual: res[k] });
      else c.ok();
    }
    if (typeof res.attackerWon !== 'boolean') c.bad('result.attackerWon is not a boolean', { actual: res.attackerWon });
    if (!Array.isArray(res.ticks)) return;
    let prev = -Infinity;
    res.ticks.forEach((e, i) => {
      if (!e || typeof e.type !== 'string' || !Number.isFinite(e.timestamp)
        || !Number.isFinite(e.attackerHpAfter) || !Number.isFinite(e.defenderHpAfter) || !Number.isFinite(e.damage)) {
        return c.bad('row is missing timestamp/type/damage/hp fields', { index: i });
      }
      if (e.timestamp < prev) c.bad('timestamps go backwards', { index: i, timestamp: e.timestamp, expected: `>= ${prev}` });
      else c.ok();
      prev = e.timestamp;
    });
  });
  if (shape.status === 'fail') {
    for (const r of RULES) if (r !== 'shape') rules.push({ rule: r, status: 'skipped', checked: 0, failed: 0, note: 'malformed response' });
    return finish();
  }

  const ticks = /** @type {DuelEvent[]} */ (res.ticks);
  const rowSide = (e) => parseEventType(e.type);

  // ---- the sheet, when the fighters are known ----
  let sheet = null;
  if (fighters?.attacker && fighters?.defender) {
    const a = fighters.attacker.stackCtx ? fighters.attacker : fighterDuelArgs(fighters.attacker);
    const d = fighters.defender.stackCtx ? fighters.defender : fighterDuelArgs(fighters.defender);
    const s = createDuelState({
      attackerStats: a.stats, defenderStats: d.stats, attackerSummon: a.summon, defenderSummon: d.summon,
      attackerShield: a.shield, defenderShield: d.shield, attackerEquipped: a.equipped, defenderEquipped: d.equipped,
      attackerGlyphCombat: a.glyphCombat, defenderGlyphCombat: d.glyphCombat,
      attackerStackCtx: a.stackCtx, defenderStackCtx: d.stackCtx, attackerSpellRuntimes: null, defenderSpellRuntimes: null,
      rng: () => 0.5,
    });
    const spells = { attacker: a.spells ?? [], defender: d.spells ?? [] };
    sheet = {
      e: { attacker: s.attacker, defender: s.defender },
      spells,
      minions: { attacker: s.attackerMinion, defender: s.defenderMinion },
      hasMinions: s.hasMinions,
      window: openingSummonWindowMs([s.attackerMinion, s.defenderMinion]),
      plain: !spells.attacker.length && !spells.defender.length && !s.stacksActive,
    };
  }

  // What the log itself shows: a log with no spell, minion, debuff, thorns or stack rows is a plain duel.
  const evidencePlain = !ticks.some((e) => /spell_|minion|thorns|debuff/.test(e.type)
    || e.attackerBulwarkStacks !== undefined || e.defenderBulwarkStacks !== undefined
    || e.attackerSunderStacks !== undefined || e.defenderSunderStacks !== undefined);

  // the opening window: the sheet's, else what the t=0 summon rows announce
  const opening = ticks.filter((e) => e.timestamp === 0 && e.type.endsWith('_minion_summoned'));
  const window = sheet ? sheet.window : Math.max(0, ...opening.map((e) => e.summonReadyMs ?? 0));
  const timedOut = res.attackerHpRemaining > 0 && res.defenderHpRemaining > 0;
  const base = window; // the first tick is base + TICK

  // ---- terminal: how the log ends and who won ----
  run('terminal', (c) => {
    const last = ticks[ticks.length - 1];
    if (!last) return c.bad('empty log');
    const loser = res.attackerWon ? 'defender' : 'attacker';
    if (last.type !== `${loser}_dead`) c.bad('last row is not the loser\'s death row', { expected: `${loser}_dead`, actual: last.type });
    else c.ok();
    if (last.timestamp !== res.totalDuration) {
      c.bad('last row timestamp is not totalDuration', { expected: res.totalDuration, actual: last.timestamp });
    } else c.ok();
    const timeUp = ticks.find((e) => e.type === 'time_up');
    if (timedOut) {
      if (!timeUp) return c.bad('both sides alive but there is no time_up row');
      c.ok();
      if (res.totalDuration !== FIGHT_MS + window) {
        c.bad('a timeout ends at 60000 ms plus the opening window', { expected: FIGHT_MS + window, actual: res.totalDuration });
      } else c.ok();
      const wins = timeUp.attackerHpAfter > timeUp.defenderHpAfter; // strictly more HP wins, a tie goes to the defender
      if (wins !== res.attackerWon) c.bad('time_up HP does not decide the winner', { expected: wins, actual: res.attackerWon });
      else c.ok();
    } else {
      if (timeUp) c.bad('time_up row in a fight that ended by a death');
      else c.ok();
      if (res.totalDuration > FIGHT_MS + window) c.bad('fight ran past the time limit', { actual: res.totalDuration });
      else c.ok();
      const loserHp = res.attackerWon ? res.defenderHpRemaining : res.attackerHpRemaining;
      if (loserHp !== 0 && !(res.attackerHpRemaining === 0 && res.defenderHpRemaining === 0)) {
        c.bad('the loser still has HP at the end', { actual: loserHp });
      }
    }
  });

  // ---- max-hp: the x8 pool ----
  run('max-hp', (c) => {
    if (!sheet) {
      for (const s of SIDES) {
        const v = res[`${s}MaxHp`];
        if (v > 0 && v % ARENA_CONSTANTS.PVP_HP_MULTIPLIER === 0) c.ok();
        else c.bad(`${s}MaxHp is not a positive multiple of ${ARENA_CONSTANTS.PVP_HP_MULTIPLIER}`, { actual: v });
      }
      return c.note('no fighters: only divisibility by the x8 multiplier is checked');
    }
    for (const s of SIDES) {
      const want = sheet.e[s].maxHp;
      if (res[`${s}MaxHp`] === want) c.ok();
      else c.bad(`${s}MaxHp differs from floor(totalHp x ${ARENA_CONSTANTS.PVP_HP_MULTIPLIER})`, { expected: want, actual: res[`${s}MaxHp`] });
      const sm = res[`${s}ShieldMax`] ?? 0;
      const wantShield = sheet.e[s].shieldMax ?? 0;
      if (sm === wantShield) c.ok();
      else c.bad(`${s}ShieldMax differs from the sheet`, { expected: wantShield, actual: sm });
    }
  });

  // ---- opening: the summon window ----
  run('opening', (c) => {
    if (!sheet && !opening.length) return c.skip('no opening summon rows in the log');
    for (const s of SIDES) {
      const rows = opening.filter((e) => e.type === `${s}_minion_summoned`);
      const has = sheet ? sheet.minions[s] != null : rows.length > 0;
      if (!has) {
        if (rows.length) c.bad(`${s} has no minion on the sheet but the log opens with a summon`);
        else if (sheet) c.ok();
        continue;
      }
      if (rows.length !== 1) { c.bad(`${s} minion is not summoned exactly once at t=0`, { expected: 1, actual: rows.length }); continue; }
      c.ok();
      if (rows[0].summonReadyMs === window) c.ok();
      else c.bad(`${s} summonReadyMs is not the opening window`, { expected: window, actual: rows[0].summonReadyMs });
    }
    // nothing but the summon rows may land inside the window
    const early = ticks.findIndex((e) => e.timestamp > 0 && e.timestamp <= window);
    if (window > 0 && early >= 0) {
      c.bad('a combat row lands inside the opening window', { index: early, timestamp: ticks[early].timestamp, expected: `> ${window}` });
    }
  });

  // ---- swing-times: when each side swings ----
  run('swing-times', (c) => {
    const off = ticks.filter((e) => e.timestamp > 0 && e.type !== 'time_up' && (e.timestamp - base) % TICK !== 0);
    if (off.length) c.bad('rows off the 10 ms tick grid', { timestamp: off[0].timestamp, actual: off.length });
    else c.ok();
    const exact = sheet ? sheet.plain && !sheet.hasMinions : evidencePlain;
    if (!exact) return c.note('swing times not checked: spells, stacks or minions can change swing timing');
    const times = (s) => {
      const t = new Set();
      for (const e of ticks) {
        const { side, kind } = rowSide(e);
        if ((side === s && SWING_BY_SWINGER.includes(kind)) || (side === other(s) && SWING_BY_TARGET.includes(kind))) t.add(e.timestamp);
      }
      return [...t].sort((x, y) => x - y);
    };
    for (const s of SIDES) {
      const actual = times(s);
      if (sheet) {
        const interval = Math.round(1000 / sheet.e[s].attackSpeed);
        const want = modelSwingTimes(interval, base, res.totalDuration);
        if (sameList(actual, want)) c.ok();
        else {
          const i = actual.findIndex((v, k) => v !== want[k]);
          const at = i < 0 ? Math.min(actual.length, want.length) : i;
          c.bad(`${s} swing times differ from a ${interval} ms interval`, { index: at, expected: want[at], actual: actual[at] });
        }
      } else {
        // infer the integer interval that reproduces the log
        let found = null;
        for (let i = 1; i <= 5000 && found == null; i++) if (sameList(actual, modelSwingTimes(i, base, res.totalDuration))) found = i;
        if (found != null) c.ok();
        else c.bad(`${s} swing times fit no constant interval`, { actual: actual.slice(0, 5) });
      }
    }
  });

  // ---- regen: pulse grid and pulse size ----
  run('regen', (c) => {
    const regen = ticks.map((e, i) => ({ e, i })).filter(({ e }) => e.type.endsWith('_regen'));
    for (const { e, i } of regen) {
      if (e.timestamp > base && (e.timestamp - base) % REGEN_PULSE_MS === 0) c.ok();
      else c.bad('regen pulse is off the 100 ms grid', { index: i, timestamp: e.timestamp, expected: `${base} + k x ${REGEN_PULSE_MS}` });
    }
    if (!(sheet ? sheet.plain : evidencePlain)) return c.note('pulse sizes not checked: spells and stacks can change regen');
    for (const s of SIDES) {
      const rows = regen.filter(({ e }) => rowSide(e).side === s);
      const want = sheet
        ? (sheet.e[s].hpRegen > 0 ? Math.max(1, Math.round((sheet.e[s].rawMaxHp * sheet.e[s].hpRegen) / 100 / 10)) : 0)
        : Math.max(0, ...rows.map(({ e }) => e.damage));
      for (const { e, i } of rows) {
        if (e.damage === want) c.ok();
        else if (e.damage > 0 && e.damage < want && e[`${s}HpAfter`] === res[`${s}MaxHp`]) c.ok(); // the last pulse tops up to max
        else c.bad(`${s} regen pulse has the wrong size`, { index: i, timestamp: e.timestamp, expected: want, actual: e.damage });
      }
    }
    if (!sheet) c.note('pulse size taken from the largest pulse in the log');
  });

  // ---- spell-casts: not before the opening delay, not within the cooldown ----
  run('spell-casts', (c) => {
    const casts = ticks.some((e) => e.type.endsWith('_spell_cast'));
    if (!sheet) return c.skip(casts ? 'needs the fighters for cooldowns' : 'no spell casts in the log');
    for (const s of SIDES) {
      const rts = sheet.spells[s].length ? initSpellRuntimes(sheet.spells[s]) : [];
      const byName = new Map(rts.map((rt) => [rt.config.name, rt]));
      const last = new Map();
      ticks.forEach((e, i) => {
        const { side, kind } = rowSide(e);
        if (side !== s || kind !== 'spell_cast') return;
        const rt = byName.get(e.spell?.name);
        if (!rt) return c.bad(`${s} cast a spell it does not carry`, { index: i, timestamp: e.timestamp, actual: e.spell?.name });
        const prev = last.get(rt);
        const earliest = prev == null
          ? base + TICK * Math.max(1, Math.ceil(rt.cooldownRemaining / TICK)) // the opening delay counts down per tick
          : prev + rt.config.spell.cooldownMs;
        if (e.timestamp >= earliest) c.ok();
        else c.bad(`${s} ${rt.config.name} cast too early`, { index: i, timestamp: e.timestamp, expected: `>= ${earliest}`, actual: e.timestamp });
        last.set(rt, e.timestamp);
      });
    }
  });

  // ---- hit-sizes: what one swing can deal ----
  run('hit-sizes', (c) => {
    if (sheet && !(sheet.plain && !sheet.hasMinions)) return c.skip('spells, stacks and minions change hit sizes');
    if (!sheet && !evidencePlain) return c.skip('the log shows spells, minions or stacks; hit sizes vary');
    for (const s of SIDES) {
      const normal = [];
      const crit = [];
      const dbl = [];
      const pen = [];
      ticks.forEach((e, i) => {
        const { side, kind } = rowSide(e);
        if (side === s && kind === 'hit') (e.doubleHit ? dbl : normal).push({ e, i });
        else if (side === s && kind === 'crit') crit.push({ e, i });
        else if (side === other(s) && kind === 'block' && e.damage > 0) pen.push({ e, i });
      });
      for (const { e, i } of [...normal, ...dbl, ...crit, ...pen]) {
        if (!(e.damage >= 1)) c.bad(`${s} landed a hit of ${e.damage}`, { index: i, timestamp: e.timestamp });
      }
      if (sheet) {
        const atk = sheet.e[s];
        const def = sheet.e[other(s)];
        const N = mitigate(atk.attack, atk, def);
        const C = mitigate(Math.round(atk.attack * atk.critDamage), atk, def);
        const pen1 = Math.round((atk.attack * atk.penetration) / 100);
        const P = [mitigate(pen1, atk, def), mitigate(Math.round(pen1 * atk.critDamage), atk, def)];
        for (const { e, i } of [...normal, ...dbl]) {
          if (e.damage === N) c.ok(); else c.bad(`${s} hit size differs from the mitigated attack`, { index: i, timestamp: e.timestamp, expected: N, actual: e.damage });
        }
        for (const { e, i } of crit) {
          if (e.damage === C) c.ok(); else c.bad(`${s} crit size differs from the mitigated crit`, { index: i, timestamp: e.timestamp, expected: C, actual: e.damage });
        }
        for (const { e, i } of pen) {
          if (P.includes(e.damage)) c.ok(); else c.bad(`${s} penetrating block size is not a penetration value`, { index: i, timestamp: e.timestamp, expected: P, actual: e.damage });
        }
      } else {
        // self-consistency: one value per kind; a double hit repeats the plain value; a crit is larger
        const vals = (a) => [...new Set(a.map(({ e }) => e.damage))].sort((x, y) => x - y);
        const nv = vals(normal);
        const cv = vals(crit);
        for (const [label, v] of [['hit', nv], ['crit', cv]]) {
          if (v.length <= 1) c.ok(); else c.bad(`${s} ${label} sizes are not constant`, { actual: v.slice(0, 6) });
        }
        for (const { e, i } of dbl) {
          if (!nv.length || e.damage === nv[0]) c.ok(); else c.bad(`${s} double hit differs from a plain hit`, { index: i, expected: nv[0], actual: e.damage });
        }
        if (nv.length && cv.length) {
          if (cv[0] >= nv[0]) c.ok(); else c.bad(`${s} crit is smaller than a plain hit`, { expected: `>= ${nv[0]}`, actual: cv[0] });
        }
      }
    }
  });

  // ---- hp-chain: a hit never raises its target's HP; HP stays under max; the log ends at the result ----
  run('hp-chain', (c) => {
    const plainLog = sheet ? sheet.plain : evidencePlain;
    let prev = null;
    ticks.forEach((e, i) => {
      const { side, kind } = rowSide(e);
      if (prev && (kind === 'hit' || kind === 'crit') && !e.doubleHit && side) {
        const f = `${other(side)}HpAfter`; // the target's HP (its regen and spells come earlier in the tick)
        if (e[f] <= prev[f]) c.ok();
        else c.bad(`${side} hit raised the target's HP`, { index: i, timestamp: e.timestamp, expected: `<= ${prev[f]}`, actual: e[f] });
      }
      if (e.type !== 'time_up') prev = e;
      for (const s of SIDES) {
        // buffs (spells, stacks) raise max HP, so the cap holds for plain duels only
        if (plainLog && e[`${s}HpAfter`] > res[`${s}MaxHp`] && !e.type.endsWith('_regen') && e.type !== 'time_up') {
          c.bad(`${s} HP is above its max`, { index: i, timestamp: e.timestamp, expected: `<= ${res[`${s}MaxHp`]}`, actual: e[`${s}HpAfter`] });
        }
      }
    });
    const last = ticks[ticks.length - 1];
    if (last) {
      for (const s of SIDES) {
        const want = res[`${s}HpRemaining`];
        const got = Math.max(0, last[`${s}HpAfter`]);
        if (got === want) c.ok(); else c.bad(`last row ${s} HP differs from ${s}HpRemaining`, { expected: want, actual: got });
      }
    }
  });

  return finish();
}
