// Fortress boss replay check: compares a `/fortress/boss-fight/start` response (rows in `combatLog`) with the
// app's Fortress fight (pve/fortressBoss.js: the arena duel under FORTRESS_FIGHT_RULES). Rules:
// Game/clan-fortress.md §1.4 (the Fortress departures), Game/combat-pvp.md §4, §6, §7, §11 (the duel).
// The server's RNG is not ours, so only what does not depend on it is compared exactly: the tick grid, both
// swing clocks, the spell schedule, regen pulses, hit sizes and the boss's hit range. The deterministic
// schedules come from running the app's own fight twice with two seeds; a schedule the two runs disagree on
// depends on draws and is not compared. A rule whose substantive comparison did not run reports `skipped`
// with the reason, never a pass. Pure (the two runs use their own seeded rng).
import { FORTRESS_BOSSES, FORTRESS_CONSTANTS } from '../../game/fortress.js';
import { pvpRatingToFraction, REGEN_PULSE_MS } from '../pvp/attack.js';
import { createDuelState } from '../pvp/reactions.js';
import { parseEventType } from '../pvp/events.js';
import { createStackCombat } from '../core/stacks.js';
import { openingSummonWindowMs } from '../core/minions.js';
import { fighterDuelArgs } from '../pvp/resolver.js';
import { laneRng } from '../rng.js';
import {
  FORTRESS_FIGHT_RULES, fortressPlayerDuelArgs, fortressBossDuelArgs, simulateFortressBoss,
} from './fortressBoss.js';

const TICK = FORTRESS_CONSTANTS.bossTickIntervalMs;
const FIGHT_MS = FORTRESS_CONSTANTS.bossFightDurationMs;
export const MAX_PER_RULE = 5;
export const FORTRESS_REPLAY_RULES = Object.freeze([
  'shape', 'terminal', 'boss', 'max-hp', 'tick-grid', 'player-swings', 'boss-swings', 'spell-casts', 'hit-sizes',
  'regen', 'stack-sigils', 'hp-chain',
]);

// Row kinds one swing leaves: swinger-named (hit, crit, lost swing) and target-named (avoid, minion).
const SWING_BY_SWINGER = ['hit', 'crit', 'blind', 'paralyze', 'fear'];
const SWING_BY_TARGET = ['miss', 'block', 'minion_damaged'];
const SPELL_SCHEDULE = ['spell_cast', 'spell_buff_start', 'spell_end'];

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
  let timer = 0;
  for (let t = base + TICK; t <= end; t += TICK) {
    timer += TICK;
    if (timer >= interval) { timer -= interval; out.push(t); }
  }
  return out;
}

const swingTimes = (rows, side) => {
  const t = new Set();
  for (const e of rows) {
    const { side: s, kind } = parseEventType(e.type);
    if ((s === side && SWING_BY_SWINGER.includes(kind)) || (s && s !== side && SWING_BY_TARGET.includes(kind))) t.add(e.timestamp);
  }
  return [...t].sort((x, y) => x - y);
};
const spellSchedule = (rows) => rows
  .filter((e) => { const { side, kind } = parseEventType(e.type); return side === 'attacker' && SPELL_SCHEDULE.includes(kind); })
  .map((e) => `${e.timestamp} ${e.type} ${e.spell?.species ?? e.spell?.name ?? ''}`);
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const firstDiff = (a, b) => { const i = a.findIndex((v, k) => v !== b[k]); return i < 0 ? Math.min(a.length, b.length) : i; };
// a buff among the player's own spells that changes one of these entity fields
const buffs = (spells, stats) => (spells ?? []).some((c) => {
  const sp = c.spell;
  return sp && (sp.spellType === 'TRANSFORM' || (sp.spellType === 'BUFF' && (sp.effects ?? []).some((e) => stats.includes(e.stat))));
});

/**
 * Runs every rule on one response.
 * @param {Object} response  `/fortress/boss-fight/start` body: `{combatLog, bossMaxHp, rawDamage, fightDurationMs, ...}`
 * @param {{attacker?: Object, group?: 'TOP'|'BOTTOM'|'CORE', rules?: Object}} [opts]  the player's Fighter
 *   (the sheet the server used) and the boss group
 * @returns {{ok: boolean, mismatches: Array<Object>, rules: Array<Object>, totalMismatches: number}}
 */
export function fortressReplayCheck(response, { attacker = null, group = null, rules: R = FORTRESS_FIGHT_RULES } = {}) {
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
    if (r.failed > 0) r.status = 'fail';
    else if (r.status === 'pass' && r.checked === 0) { r.status = 'skipped'; r.note ??= 'nothing to compare'; }
    return r;
  };
  const finish = () => ({ ok: !rules.some((r) => r.status === 'fail'), mismatches, rules, totalMismatches: total });

  const rows = response?.combatLog;
  const shape = run('shape', (c) => {
    if (!Array.isArray(rows)) return c.bad('response has no combatLog array');
    for (const k of ['bossMaxHp', 'rawDamage', 'fightDurationMs']) {
      if (Number.isFinite(response[k])) c.ok(); else c.bad(`${k} is not a number`, { actual: response[k] });
    }
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
    for (const r of FORTRESS_REPLAY_RULES) if (r !== 'shape') rules.push({ rule: r, status: 'skipped', checked: 0, failed: 0, note: 'malformed response' });
    return finish();
  }

  const boss = group ? FORTRESS_BOSSES[group] : null;
  // the app's fight inputs and two seeded runs of it, when the attacker is known
  let model = null;
  if (attacker && boss) {
    const a = fortressPlayerDuelArgs(attacker, R);
    const d = fortressBossDuelArgs(group, R);
    const s = createDuelState({
      attackerStats: a.stats, defenderStats: d.stats, attackerSummon: a.summon, defenderSummon: d.summon,
      attackerShield: a.shield, defenderShield: d.shield, attackerEquipped: a.equipped, defenderEquipped: d.equipped,
      attackerGlyphCombat: a.glyphCombat, defenderGlyphCombat: d.glyphCombat, attackerStackCtx: a.stackCtx,
      defenderStackCtx: d.stackCtx, attackerSpellRuntimes: null, defenderSpellRuntimes: null, rng: () => 0.5,
    });
    const runs = [1, 2].map((seed) => simulateFortressBoss({ fighter: a, group, rng: laneRng(seed), log: true, rules: R }).combatLog);
    const arena = fighterDuelArgs(attacker); // what the arena would have stacked
    model = {
      args: a, P: s.attacker, B: s.defender, runs,
      window: openingSummonWindowMs([s.attackerMinion, s.defenderMinion]),
      arenaStacks: createStackCombat(arena.equipped, true, arena.glyphCombat?.stack, arena.stackCtx).active,
    };
  }
  const window = model?.window ?? Math.max(0, ...rows.filter((e) => e.timestamp === 0).map((e) => e.summonReadyMs ?? 0));
  const last = rows.at(-1);
  const end = last?.timestamp ?? 0;
  const needSheet = 'needs the attacker\'s sheet and the boss group';

  // ---- terminal: the 60 s bell or a death, and the reported raw damage ----
  run('terminal', (c) => {
    if (!last) return c.bad('empty combatLog');
    if (response.fightDurationMs === FIGHT_MS) c.ok();
    else c.bad('fightDurationMs is not the boss fight duration', { expected: FIGHT_MS, actual: response.fightDurationMs });
    const timeUp = rows.findIndex((e) => e.type === 'time_up');
    if (timeUp >= 0) {
      if (timeUp === rows.length - 1 || R.timeUpDeadRow) c.ok();
      else c.bad('rows follow time_up', { index: timeUp + 1, actual: rows[timeUp + 1].type });
      if (rows[timeUp].timestamp === FIGHT_MS + window) c.ok();
      else c.bad('time_up is not at the bell', { expected: FIGHT_MS + window, actual: rows[timeUp].timestamp });
    } else if (/^(attacker|defender)_dead$/.test(last.type)) {
      c.ok();
      if (last.timestamp <= FIGHT_MS + window) c.ok(); else c.bad('fight ran past the bell', { actual: last.timestamp });
    } else c.bad('the log ends with neither time_up nor a death row', { actual: last.type });
    const raw = response.bossMaxHp - Math.max(0, last.defenderHpAfter);
    if (raw === response.rawDamage) c.ok(); else c.bad('rawDamage is not the boss HP lost', { expected: raw, actual: response.rawDamage });
  });

  // ---- boss: the table's boss and the Fortress spell resist ----
  run('boss', (c) => {
    if (!boss) return c.skip('needs the boss group');
    if (response.bossMaxHp === boss.baseHp) c.ok(); else c.bad('bossMaxHp is not the table HP', { expected: boss.baseHp, actual: response.bossMaxHp });
    if (response.bossName == null) c.note('no bossName in the response');
    else if (response.bossName === boss.name) c.ok(); else c.bad('bossName is not the table name', { expected: boss.name, actual: response.bossName });
    if (response.bossSpellResist == null) c.note('no bossSpellResist in the response');
    else if (response.bossSpellResist === R.bossSpellResist) c.ok();
    else c.bad('bossSpellResist differs from the model', { expected: R.bossSpellResist, actual: response.bossSpellResist });
    if (rows[0]?.defenderHpAfter <= boss.baseHp) c.ok(); else c.bad('boss HP starts above the table HP', { actual: rows[0]?.defenderHpAfter });
  });

  // ---- max-hp: the player fights at the sheet HP (no x8 pool) ----
  run('max-hp', (c) => {
    if (!model) return c.skip(needSheet);
    const max = model.P.maxHp;
    const first = rows.find((e) => e.timestamp > 0) ?? rows[0];
    if (first.attackerHpAfter <= max && first.attackerHpAfter >= max - Math.max(0, first.damage)) c.ok();
    else c.bad('the player does not start at the sheet HP', { expected: max, actual: first.attackerHpAfter });
    if (buffs(model.args.spells, ['HP_PERCENT'])) return c.note('a max-HP buff may raise the cap: only the start is checked');
    rows.forEach((e, i) => {
      if (e.attackerHpAfter <= max) c.ok();
      else c.bad('player HP is above the sheet HP', { index: i, timestamp: e.timestamp, expected: `<= ${max}`, actual: e.attackerHpAfter });
    });
  });

  // ---- tick-grid: every row on the 10 ms boss tick ----
  run('tick-grid', (c) => {
    rows.forEach((e, i) => {
      if (e.timestamp === 0 || (e.timestamp - window) % TICK === 0) c.ok();
      else c.bad('row off the 10 ms tick grid', { index: i, timestamp: e.timestamp });
    });
  });

  // ---- player-swings: the app's swing clock (sheet speed and its own attack-speed buffs) ----
  run('player-swings', (c) => {
    if (!model) return c.skip(needSheet);
    const [m1, m2] = model.runs.map((r) => swingTimes(r, 'attacker').filter((t) => t <= end));
    if (!sameList(m1, m2)) return c.skip('the swing clock depends on draws (two seeded runs disagree)');
    const actual = swingTimes(rows, 'attacker');
    if (sameList(actual, m1)) { for (let i = 0; i < actual.length; i++) c.ok(); return; }
    const at = firstDiff(actual, m1);
    c.bad('player swing times differ from the app\'s clock', { index: at, expected: m1[at], actual: actual[at] });
  });

  // ---- boss-swings: every round(1000 / speed) ms, never lost to Blind ----
  run('boss-swings', (c) => {
    if (!boss) return c.skip('needs the boss group');
    const want = modelSwingTimes(Math.round(1000 / boss.attackSpeed), window, end);
    const actual = swingTimes(rows, 'defender');
    if (sameList(actual, want)) for (let i = 0; i < actual.length; i++) c.ok();
    else {
      const at = firstDiff(actual, want);
      c.bad(`boss swing times differ from a ${Math.round(1000 / boss.attackSpeed)} ms clock`, { index: at, expected: want[at], actual: actual[at] });
    }
    if (!R.bossBlindable) {
      rows.forEach((e, i) => {
        if (e.type === 'defender_blind' || e.type === 'defender_blinded') c.bad('the boss was blinded', { index: i, timestamp: e.timestamp });
      });
    }
  });

  // ---- spell-casts: the player's cast, buff and end rows on the app's schedule ----
  run('spell-casts', (c) => {
    if (!model) return c.skip(needSheet);
    const [m1, m2] = model.runs.map((r) => spellSchedule(r.filter((e) => e.timestamp <= end)));
    if (!sameList(m1, m2)) return c.skip('the spell schedule depends on draws (two seeded runs disagree)');
    const actual = spellSchedule(rows);
    if (!m1.length && !actual.length) return c.skip('no spell is cast');
    if (sameList(actual, m1)) { for (let i = 0; i < actual.length; i++) c.ok(); return; }
    const at = firstDiff(actual, m1);
    c.bad('the spell schedule differs from the app\'s', { index: at, expected: m1[at], actual: actual[at] });
  });

  // sizes of a plain hit, a crit and the boss's range against this player
  const sizes = model && {
    N: mitigate(model.P.attack, model.P, model.B),
    C: mitigate(Math.round(model.P.attack * model.P.critDamage), model.P, model.B),
    lo: mitigate(Math.round(model.B.attack * (1 - R.bossDamageVariance)), model.B, model.P),
    hi: mitigate(Math.round(model.B.attack * (1 + R.bossDamageVariance)), model.B, model.P),
  };
  const playerSizesFixed = model && !buffs(model.args.spells, ['ATTACK_PERCENT', 'CRIT_DAMAGE']);

  // ---- hit-sizes: plain hit = the attack, crit = attack x crit damage, boss hits in its range ----
  run('hit-sizes', (c) => {
    if (!model) return c.skip(needSheet);
    const bossDrFixed = !buffs(model.args.spells, ['DAMAGE_REDUCTION']);
    rows.forEach((e, i) => {
      const { side, kind } = parseEventType(e.type);
      if (side === 'attacker' && (kind === 'hit' || kind === 'crit') && playerSizesFixed) {
        const want = kind === 'crit' ? sizes.C : sizes.N;
        if (e.damage === want) c.ok();
        else c.bad(`player ${kind} size differs from the sheet`, { index: i, timestamp: e.timestamp, expected: want, actual: e.damage });
      } else if (side === 'defender' && kind === 'hit') {
        const lo = bossDrFixed ? sizes.lo : 1;
        if (e.damage >= lo && e.damage <= sizes.hi) c.ok();
        else c.bad('boss hit outside its range', { index: i, timestamp: e.timestamp, expected: `${lo}-${sizes.hi}`, actual: e.damage });
      }
    });
    if (!playerSizesFixed) c.note('an attack or crit-damage buff changes the player\'s sizes: only boss hits compared');
  });

  // ---- regen: pulses on the 100 ms grid, sized from the sheet HP ----
  run('regen', (c) => {
    const regen = rows.map((e, i) => ({ e, i })).filter(({ e }) => e.type.endsWith('_regen'));
    for (const { e, i } of regen) {
      if (e.timestamp > window && (e.timestamp - window) % REGEN_PULSE_MS === 0) c.ok();
      else c.bad('regen pulse off the 100 ms grid', { index: i, timestamp: e.timestamp });
    }
    if (!model) return c.skip(`pulse sizes not compared (grid only): ${needSheet}`);
    if (buffs(model.args.spells, ['HP_REGEN', 'HP_PERCENT'])) return c.skip('pulse sizes not compared (grid only): a regen or max-HP buff');
    const P = model.P;
    const want = P.hpRegen > 0 ? Math.max(1, Math.round((P.rawMaxHp * P.hpRegen) / 100 / 10)) : 0;
    for (const { e, i } of regen) {
      if (parseEventType(e.type).side !== 'attacker') { c.bad('the boss regenerated', { index: i }); continue; }
      if (e.damage === want || (e.damage > 0 && e.damage < want && e.attackerHpAfter === P.maxHp)) c.ok();
      else c.bad('player regen pulse has the wrong size', { index: i, timestamp: e.timestamp, expected: want, actual: e.damage });
    }
  });

  // ---- stack-sigils: a stack sigil the arena would stack never raises a hit ----
  run('stack-sigils', (c) => {
    if (!model) return c.skip(needSheet);
    if (R.stackSigils) return c.skip('the rules keep the arena stacks');
    if (!model.arenaStacks) return c.skip('no stack sigil equipped');
    if (!playerSizesFixed) return c.skip('an attack or crit-damage buff changes the player\'s sizes');
    const from = rows.findIndex((e) => e.type === 'attacker_miss' || e.type === 'attacker_block');
    if (from < 0) return c.skip('the player never avoided a boss swing, so no stack would have formed');
    for (let i = from + 1; i < rows.length; i++) {
      const e = rows[i];
      const { side, kind } = parseEventType(e.type);
      if (side !== 'attacker' || (kind !== 'hit' && kind !== 'crit')) continue;
      const want = kind === 'crit' ? sizes.C : sizes.N;
      if (e.damage === want) c.ok();
      else c.bad(`player ${kind} after an avoid differs from the unstacked size`, { index: i, timestamp: e.timestamp, expected: want, actual: e.damage });
    }
  });

  // ---- hp-chain: each player strike takes exactly its damage off the boss; a boss hit never heals ----
  run('hp-chain', (c) => {
    const exactPlayer = model ? !(model.P.shieldMax > 0) : false;
    for (let i = 1; i < rows.length; i++) {
      const e = rows[i];
      const p = rows[i - 1];
      const { side, kind } = parseEventType(e.type);
      if (side === 'attacker' && (kind === 'hit' || kind === 'crit')) {
        const want = Math.max(0, p.defenderHpAfter - e.damage);
        if (!R.perStrikeBossHp && e.doubleHit) continue;
        if (e.defenderHpAfter === want) c.ok();
        else c.bad('boss HP did not drop by the strike', { index: i, timestamp: e.timestamp, expected: want, actual: e.defenderHpAfter });
      } else if (side === 'defender' && kind === 'hit') {
        const want = Math.max(0, p.attackerHpAfter - e.damage);
        if (exactPlayer ? e.attackerHpAfter === want : e.attackerHpAfter <= p.attackerHpAfter) c.ok();
        else c.bad('player HP after a boss hit is wrong', { index: i, timestamp: e.timestamp, expected: exactPlayer ? want : `<= ${p.attackerHpAfter}`, actual: e.attackerHpAfter });
      }
    }
    if (!exactPlayer) c.note('player HP after a boss hit is only held to "never rises" (no sheet, or a shield)');
  });

  return finish();
}
