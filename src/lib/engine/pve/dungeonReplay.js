// Dungeon replay check (backlog §7): holds a dungeon step's tick log (`/dungeon/fight-prepare` result, rows
// already mapped to `player_*` / `mob_*` by mapFightTicks) to the rules of the app's dungeon fight
// (pve/fight.js simulatePve in the dungeon mode). Rules: Game/combat-pve.md §2 (tick), §4 (swings), §5-§7
// (hits, regen), §10 (spells), §13 (shield), §14 (the step), §17 (event stream), §21 (what a server log
// showed). The server's RNG is not ours, so a rule compares what does not depend on a draw (the clocks,
// the cast schedule, the sizes a hit can have) and reconstructs the HP and shield chains from the rows.
// Only attack rows carry the shield, so the shield is rebuilt between them: spell heals, regen pulses on
// the 100 ms grid (rows only while HP is below max), lifesteal and absorbs. A rule whose substantive
// comparison did not run reports `skipped` with the reason, never a pass. Pure; no rng.
// The raid mode (`mode: 'raid'`, Game/combat-pve.md §21.1) reads the same row shape, but every living mob
// swings while the player fights the first one: rows of the mobs behind the target interleave with the
// target's, each mob's clock starts at an unknown point of its swing, and the shield takes hits 1:1. The
// raid rules follow the target through its fights and check the mobs behind it on their own clocks; see
// RAID_REPLAY_RULES. A `/raid/fight-prepare` (or dungeon prepare) response has no outcome fields, so
// the outcome is read from the rows.
import { applyDamageReduction } from '../core/rolls.js';
import { absorbWithShield, shieldRefillAmount, regenShieldRefillAmount } from '../core/shield.js';
import { applyCombatCeiling, ceilingFor, capConfig } from '../core/caps.js';
import { initSpellRuntimes } from '../core/spells.js';
import { PVE_MODES, preparePveFighter, mobEntityOf } from './fight.js';

export const MAX_PER_RULE = 5;
export const DUNGEON_REPLAY_RULES = Object.freeze([
  'shape', 'tick-grid', 'terminal', 'mobs', 'transitions', 'player-swings', 'mob-swings', 'spell-schedule',
  'spell-damage', 'spell-heals', 'hit-sizes', 'mob-hp', 'regen', 'hp-chain', 'shield-chain', 'shield-cap',
]);
// the raid adds `ledger`: the HP and shield chain rebuilt from the log alone (no sheet), which a raid's
// 1:1 shield makes exact (see combat-pve.md §21.1)
export const RAID_REPLAY_RULES = Object.freeze([...DUNGEON_REPLAY_RULES.slice(0, -1), 'ledger', 'shield-cap']);
const REGEN_PULSE_MS = 100;
const SPELL_VAMP_CEILING = ceilingFor('SPELL_VAMP');
const SPELL_RESIST_HARD = capConfig('SPELL_RESIST').hard;

// mapTickType L1670711-1670925: the engine's event type as the dungeon log names it. spell_*, minion_* and
// thorns_reflect keep their names; any other type maps to undefined.
const TYPE_MAP = Object.freeze({
  attacker_hit: 'player_attack', attacker_crit: 'player_crit', attacker_regen: 'player_regen',
  defender_hit: 'mob_attack', attacker_block: 'player_block', defender_block: 'mob_block',
  attacker_miss: 'player_miss', defender_miss: 'mob_block', defender_blinded: 'mob_blinded',
  defender_blind: 'mob_blind', defender_paralyzed: 'mob_paralyzed', defender_paralyze: 'mob_paralyze',
  defender_silenced: 'mob_silenced', defender_staggered: 'mob_staggered', defender_feared: 'mob_feared',
  defender_fear: 'mob_fear', attacker_instability: 'player_instability', attacker_dead: 'player_death',
  defender_dead: 'mob_death',
});
const KEPT = /^(spell_(cast|damage|dot_tick|heal_tick|buff_start|end|debuff_applied|debuff_stack|debuff_tick|debuff_expired)|minion_(summoned|hit|crit|damaged|heal|dead|buff|buff_end)|thorns_reflect)$/;
export const mapTickType = (type) => TYPE_MAP[type] ?? (KEPT.test(type) ? type : undefined);

// mapFightTicks L1670515-1670710: one fight's engine events as dungeon rows.
const COPIED = ['spell', 'debuffStacks', 'debuffMaxStacks', 'debuffPermanent', 'damagePerTick', 'paralyzeMs', 'fearMs'];
const COPIED_IF_SET = [['staggerStacks', 'staggerStacks'], ['chronoFlux', 'chronoFlux'], ['bulwarkStacks', 'bulwarkStacks'],
  ['sunderStacks', 'sunderStacks'], ['attackerShieldHp', 'playerShieldHp'], ['momentumStacks', 'momentumStacks'],
  ['minionHp', 'minionHp'], ['minionMaxHp', 'minionMaxHp'], ['minionRespawnMs', 'minionRespawnMs'], ['summonReadyMs', 'summonReadyMs']];
export function mapFightTicks(ticks, mobIndex) {
  return ticks.map((e) => {
    const r = {
      timestamp: e.timestamp, type: mapTickType(e.type), damage: e.damage, playerHpAfter: e.attackerHp,
      // a raid mob behind the target stamps its own index on its events (fight.js simulateFight)
      mobHpAfter: e.defenderHp, mobIndex: e.mobIndex ?? mobIndex, ...(e.doubleHit ? { doubleHit: true } : {}),
    };
    for (const k of COPIED) if (e[k] !== undefined) r[k] = e[k];
    if (e.isCrit) r.isCrit = true;
    for (const [from, to] of COPIED_IF_SET) if (e[from] != null) r[to] = e[from];
    return r;
  });
}

/**
 * A simulatePve dungeon run (with `log: true`) in the shape of the server's dungeon result
 * (simulateDungeonStep L1671071-1671135): rows per mob through mapFightTicks, `playerShieldMax` when the
 * player has a shield. The run's log is one array; a mob's rows end at its `defender_dead`.
 * @param {Object} sim  simulatePve result
 * @param {{shieldMax?: number}} [o]
 */
export function dungeonResponseOf(sim, { shieldMax = 0 } = {}) {
  const rows = [];
  let mob = 0;
  let from = 0;
  const log = sim.log ?? [];
  for (let i = 0; i < log.length; i++) {
    if (log[i].type !== 'defender_dead') continue;
    rows.push(...mapFightTicks(log.slice(from, i + 1), mob));
    mob += 1;
    from = i + 1;
  }
  if (from < log.length) rows.push(...mapFightTicks(log.slice(from), mob));
  return {
    result: {
      success: sim.won, ticks: rows, totalDuration: sim.timeMs, mobsDefeated: sim.mobsDefeated,
      playerHpRemaining: sim.won ? sim.hpLeft : 0, ...(shieldMax > 0 ? { playerShieldMax: shieldMax } : {}),
    },
  };
}

const PLAYER_SWING = new Set(['player_attack', 'player_crit', 'mob_block']);
const MOB_SWING = new Set(['mob_attack', 'player_block', 'player_miss', 'player_death', 'mob_blind', 'mob_paralyze', 'mob_fear']);
const MOB_HIT = new Set(['mob_attack', 'player_block', 'player_miss', 'player_death']);
// rows outside the spell pass that take their damage off the mob
const MOB_DAMAGE = new Set([...PLAYER_SWING, 'spell_debuff_tick', 'thorns_reflect']);
const SPELL_PASS = /^spell_(cast|damage|dot_tick|heal_tick|buff_start|end|debuff_applied|debuff_stack)$/;
// control states the spell pass puts on the target; fight.js emits them ahead of the pass's spell rows
// with the HP after the pass, as the raid log shows (mob_silenced before Null Pulse's cast)
const SPELL_CONTROL = new Set(['mob_paralyzed', 'mob_silenced', 'mob_feared', 'mob_blinded']);
const SCHEDULE_TYPES = new Set(['spell_cast', 'spell_dot_tick', 'spell_damage', 'spell_end']);
// what a raid's gap between fights can log: the mobs' swings and the regen pulse (§21.1)
const GAP_TYPES = new Set([...MOB_SWING, 'player_regen', 'minion_damaged', 'minion_dead']);
const OUTCOME_FIELDS = ['success', 'mobsDefeated', 'playerHpRemaining'];
const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const firstDiff = (a, b) => { const i = a.findIndex((v, k) => v !== b[k]); return i < 0 ? Math.min(a.length, b.length) : i; };
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6;

/** Swing times of a clock with a constant interval: one timer step per tick from `start` to `end`. */
function modelSwingTimes(interval, start, end, dt) {
  const out = [];
  if (!(interval > 0) || !Number.isFinite(interval)) return out;
  let timer = 0;
  for (let t = start + dt; t <= end; t += dt) {
    timer += dt;
    if (timer >= interval) { timer -= interval; out.push(t); }
  }
  return out;
}

/**
 * A raid mob's swings when its clock starts at some timer value: one timer step per tick the mob may
 * swing in (`opp`, their timestamps), a swing whenever the timer reaches the interval. The start point is
 * unknown (combat-pve.md §21.1), so every start that yields the observed first swing is tried. The interval
 * and the tick are whole ms, so whole-ms starts cover every case. Returns the best candidate: an exact
 * match when one exists, else the one agreeing longest with `got`.
 */
function fitRandomClock(interval, opp, got, dt) {
  const run = (t0) => {
    const out = [];
    let timer = t0;
    for (const fc of opp) {
      timer += dt;
      if (timer >= interval) { timer -= interval; out.push(fc); }
    }
    return out;
  };
  let lo = 0;
  let hi = interval - 1;
  if (got.length) {
    const n = opp.indexOf(got[0]);
    if (n < 0) return { match: false, want: run(0) };
    // the first swing is the (n+1)th step: t0 + (n+1) dt >= interval > t0 + n dt
    lo = Math.max(0, interval - (n + 1) * dt);
    hi = Math.min(interval - 1, interval - n * dt - 1);
  }
  let best = null;
  for (let t0 = lo; t0 <= hi; t0++) {
    const want = run(t0);
    if (sameList(want, got)) return { match: true, want };
    const d = firstDiff(want, got);
    if (!best || d > best.d) best = { d, want };
  }
  return { match: false, want: best ? best.want : run(0) };
}

/**
 * The spell pass's event schedule for DAMAGE spells (processSpellsTick L1090474-1092344, opening delay
 * L1090372-1090472), on the fight clock (spells only advance inside a fight, so the 500 ms gaps between
 * mobs do not count). Per tick and in runtime order: a running DoT ticks the tick after its cast, then
 * every tickIntervalMs while time remains, and ends with `spell_end` when its duration runs out; a spell
 * casts when its cooldown is out and no effect of it runs. Returns `[fc, type, species]` triples.
 */
function damageSpellSchedule(configs, dt, fcEnd) {
  const rts = initSpellRuntimes(configs); // fresh runtimes: cooldowns at the opening delay
  const out = [];
  for (let fc = dt; fc <= fcEnd; fc += dt) {
    for (const rt of rts) {
      const sp = rt.config.spell;
      const species = rt.config.species;
      if (rt.cooldownRemaining > 0) rt.cooldownRemaining = Math.max(0, rt.cooldownRemaining - dt);
      if (rt.isEffectActive) {
        rt.nextTickIn -= dt;
        rt.effectRemaining -= dt;
        if (rt.nextTickIn <= 0 && rt.effectRemaining > 0) {
          out.push([fc, 'spell_dot_tick', species]);
          rt.nextTickIn += sp.tickIntervalMs ?? 1000;
        }
        if (rt.effectRemaining > 0) continue;
        rt.isEffectActive = false;
        out.push([fc, 'spell_end', species]);
      }
      if (rt.cooldownRemaining > 0) continue;
      out.push([fc, 'spell_cast', species]);
      if (sp.isDoT) {
        rt.isEffectActive = true;
        rt.effectRemaining = sp.durationMs ?? 0;
        rt.nextTickIn = 0;
      } else {
        out.push([fc, 'spell_damage', species]);
      }
      rt.cooldownRemaining = sp.cooldownMs;
    }
  }
  return out;
}

/**
 * The app's inputs for the attacker and the step's mobs: the player entity, its shield, its spell configs.
 * @param {Object} attacker  a Fighter (or a preparePveFighter result)
 * @param {Array<Object>} mobs  the step's MobSpecs, in order
 * @param {string} mode  a PVE_MODES key
 */
function modelOf(attacker, mobs, mode) {
  const prepared = attacker?.fresh ? attacker : attacker ? preparePveFighter(attacker) : null;
  const m = PVE_MODES[mode];
  const out = {
    dt: m.dtMs, gap: m.interMobGapMs ?? 0, mitigation: m.shieldMitigation, liveResist: !!m.liveLoop,
    raid: !!m.allMobsSwing, P: null, mobs: null,
  };
  if (prepared) {
    const f = prepared.fresh();
    out.P = f.player;
    out.shield = prepared.inputs.shield;
    out.spells = prepared.inputs.spells;
    out.summon = !!prepared.inputs.summon;
    out.stacks = !!f.stacks;
    out.chrono = !!f.chrono;
  }
  if (Array.isArray(mobs) && mobs.length) out.mobs = mobs.map((mob) => mobEntityOf(mob));
  return out;
}

// a spell among the player's own that changes one of these entity fields while it runs
const buffs = (configs, stats) => (configs ?? []).some((c) => {
  const sp = c.spell;
  return sp && (sp.spellType === 'TRANSFORM' || ((sp.spellType === 'BUFF' || sp.spellType === 'DEFENSE')
    && (sp.effects ?? []).some((e) => stats.includes(e.stat))));
});

/**
 * Runs every rule on one dungeon or raid step result.
 * @param {Object} response  the result (`{result}` or the bare result: `{success, ticks, totalDuration,
 *   mobsDefeated, playerHpRemaining, playerShieldMax?}`), or a fight-prepare response (`{ticks,
 *   totalDuration, playerShieldMax?}` plus any other fields, without the three outcome fields)
 * @param {{attacker?: Object, mobs?: Array<Object>, mode?: string}} [opts]  the player's Fighter (the sheet
 *   the server used), the step's mobs in order, and the PVE mode (default 'dungeon'; 'raid' for a village
 *   raid step)
 * @returns {{ok: boolean, mismatches: Array<Object>, rules: Array<Object>, totalMismatches: number}}
 */
export function dungeonReplayCheck(response, { attacker = null, mobs = null, mode = 'dungeon' } = {}) {
  const res = response?.result ?? response;
  const mismatches = [];
  const rules = [];
  let total = 0;
  const run = (rule, fn) => {
    const r = { rule, status: 'pass', checked: 0, failed: 0 };
    rules.push(r);
    const c = {
      skip(note) { r.status = 'skipped'; r.note = note; },
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

  const M = modelOf(attacker, mobs, mode);
  const raid = M.raid;
  const ruleList = raid ? RAID_REPLAY_RULES : DUNGEON_REPLAY_RULES;
  const rows = res?.ticks;
  // a prepare response carries none of the outcome fields; a result with only some of them is malformed
  const prepared = !!res && typeof res === 'object' && OUTCOME_FIELDS.every((k) => res[k] === undefined);
  // ---- shape: the rest of the rules need a well-formed log ----
  const shape = run('shape', (c) => {
    if (!res || typeof res !== 'object' || !Array.isArray(rows)) return c.bad('result has no ticks array');
    if (prepared) c.note('prepare response: no success, mobsDefeated or playerHpRemaining; the outcome is read from the rows');
    else {
      if (typeof res.success === 'boolean') c.ok(); else c.bad('success is not a boolean', { actual: res.success });
      for (const k of ['mobsDefeated', 'playerHpRemaining']) {
        if (Number.isFinite(res[k])) c.ok(); else c.bad(`${k} is not a number`, { actual: res[k] });
      }
    }
    if (Number.isFinite(res.totalDuration)) c.ok(); else c.bad('totalDuration is not a number', { actual: res.totalDuration });
    let prevTs = -Infinity;
    let prevMob = 0;
    // raid: the target is the first living mob; it changes on the tick after its mob_death (§21.1)
    let target = 0;
    let deathTs = null;
    rows.forEach((e, i) => {
      if (!e || typeof e.type !== 'string' || !Number.isFinite(e.timestamp) || !Number.isFinite(e.damage)
        || !Number.isFinite(e.playerHpAfter) || !Number.isFinite(e.mobHpAfter) || !Number.isInteger(e.mobIndex)) {
        return c.bad('row is missing timestamp/type/damage/hp/mobIndex fields', { index: i });
      }
      if (e.timestamp < prevTs) c.bad('timestamps go backwards', { index: i, timestamp: e.timestamp, expected: `>= ${prevTs}` });
      else if (raid) {
        if (deathTs !== null && e.timestamp > deathTs) { target += 1; deathTs = null; }
        if (e.mobIndex < target) c.bad('a row from a mob that already died', { index: i, expected: `>= ${target}`, actual: e.mobIndex });
        else if (e.type === 'mob_death' && e.mobIndex !== target) c.bad('a mob other than the target died', { index: i, expected: target, actual: e.mobIndex });
        else c.ok();
        if (e.type === 'mob_death' && e.mobIndex === target && deathTs === null) deathTs = e.timestamp;
      } else if (e.mobIndex !== prevMob && e.mobIndex !== prevMob + 1) c.bad('mobIndex skips or goes back', { index: i, expected: prevMob + 1, actual: e.mobIndex });
      else c.ok();
      prevTs = e.timestamp;
      prevMob = e.mobIndex;
    });
  });
  if (shape.status === 'fail') {
    for (const r of ruleList) if (r !== 'shape') rules.push({ rule: r, status: 'skipped', checked: 0, failed: 0, note: 'malformed result' });
    return finish();
  }

  const { dt, gap } = M;
  const P = M.P;
  const needSheet = 'needs the attacker\'s sheet';
  const needMobs = 'needs the step\'s mobs';
  const last = rows.at(-1);

  // segments: one per fight, from its start (previous end + gap; the first at the gap) to its last row.
  // A dungeon fight's rows carry its mob's index. A raid fight is the target's: it also holds the rows of
  // the mobs behind it, including those on the target's death tick (fight.js lets them swing after a
  // swing kill), so the target only changes on a later tick.
  const segs = [];
  const segOf = [];
  if (raid) {
    let target = 0;
    let deathTs = null;
    rows.forEach((e, i) => {
      if (deathTs !== null && e.timestamp > deathTs) { target += 1; deathTs = null; }
      let s = segs[target];
      if (!s) segs[target] = s = { mob: target, first: i, last: i, deathIdx: -1 };
      s.last = i;
      segOf[i] = s;
      if (e.type === 'mob_death' && e.mobIndex === target && deathTs === null) { deathTs = e.timestamp; s.deathIdx = i; }
    });
  } else {
    for (const [i, e] of rows.entries()) {
      let s = segs[e.mobIndex];
      if (!s) segs[e.mobIndex] = s = { mob: e.mobIndex, first: i, last: i };
      s.last = i;
      segOf[i] = s;
    }
  }
  let base = 0;
  segs.forEach((s, k) => {
    s.start = k === 0 ? gap : segs[k - 1].end + gap;
    s.end = rows[s.last].timestamp;
    s.died = raid ? s.deathIdx >= 0 : rows[s.last].type === 'mob_death';
    s.base = base; // fight-clock time at the segment's start
    // raid: the segment also holds the gap before its fight, in which the mobs and the regen pulse run on
    // (§21.1); `from` is the wall-clock time the segment's rows come after
    s.from = raid && k > 0 ? segs[k - 1].end : s.start;
    s.t = []; // the target's own rows (a dungeon fight's are all of them)
    for (let i = s.first; i <= s.last; i++) if (rows[i].mobIndex === s.mob) s.t.push(i);
    base += s.end - s.start;
  });
  const fcEnd = base;
  const segAtFc = (fc) => segs.find((s) => fc > s.base && fc <= s.base + (s.end - s.start));
  // the length of the spell pass at the head of one tick's rows: spell rows, with the control rows the
  // pass emits ahead of them (only when a spell row follows)
  const passLen = (list) => {
    let k = 0;
    let spell = false;
    while (k < list.length && (SPELL_PASS.test(rows[list[k]].type) || SPELL_CONTROL.has(rows[list[k]].type))) {
      if (SPELL_PASS.test(rows[list[k]].type)) spell = true;
      k++;
    }
    return spell ? k : 0;
  };
  // the mob died to the spell or debuff pass of its last tick (spells run before the swings, §2)
  const spellKill = (s) => s.died && s.t.some((i) => rows[i].timestamp === s.end && rows[i].type.startsWith('spell_') && rows[i].mobHpAfter <= 0);
  // the mob died to thorns, which land after its own swing in that tick (fight.js step 10)
  const thornsKill = (s) => s.died && s.t.some((i) => rows[i].timestamp === s.end && rows[i].type === 'thorns_reflect' && rows[i].mobHpAfter <= 0);
  // the regen pulses. A dungeon's restart with each fight, every 100 ms of it. A raid's run on one clock
  // from the first fight's start, gaps included (§21.1); it steps on every combat tick, so not on a tick
  // whose spell or debuff pass killed the target (fight.js returns before the combat tick).
  const raidPulses = new Set();
  if (raid && segs.length) {
    const skip = new Set(segs.filter(spellKill).map((s) => s.end));
    let timer = 0;
    for (let t = segs[0].start + dt; t <= last.timestamp; t += dt) {
      if (skip.has(t)) continue;
      timer += dt;
      if (timer >= REGEN_PULSE_MS) { timer -= REGEN_PULSE_MS; raidPulses.add(t); }
    }
  }
  const isPulse = (t, s) => (raid ? raidPulses.has(t) : t > s.start && (t - s.start) % REGEN_PULSE_MS === 0);
  const pulseNote = raid ? 'regen pulse off the 100 ms clock that runs from the first fight' : 'regen pulse off the 100 ms grid of its fight';

  // ---- tick-grid: every row on the mode's tick, counted from its fight's start ----
  // raid: from the first fight's start, since the mobs swing through the gaps (§21.1)
  run('tick-grid', (c) => {
    for (const s of segs) {
      const o = raid ? segs[0].start : s.start;
      for (let i = s.first; i <= s.last; i++) {
        const t = rows[i].timestamp;
        if (t > o && (t - o) % dt === 0) c.ok();
        else c.bad(`row off the ${dt} ms tick grid of its fight (start ${s.start})`, { index: i, timestamp: t });
      }
    }
  });

  // ---- terminal: the outcome fields agree with the rows; a loss ends on the player_death row ----
  run('terminal', (c) => {
    if (!last) return c.bad('empty ticks');
    const deaths = rows.filter((e) => e.type === 'mob_death').length;
    if (Number.isFinite(res.mobsDefeated)) {
      if (res.mobsDefeated === deaths) c.ok(); else c.bad('mobsDefeated is not the number of mob_death rows', { expected: deaths, actual: res.mobsDefeated });
    }
    if (res.totalDuration === last.timestamp) c.ok(); else c.bad('totalDuration is not the last row', { expected: last.timestamp, actual: res.totalDuration });
    let success = res.success;
    if (prepared) {
      // no outcome field: a player_death row is a loss, every mob dead a win
      success = !rows.some((e) => e.type === 'player_death');
      if (success && M.mobs && deaths !== M.mobs.length) c.bad('no player_death row and mobs left alive', { expected: M.mobs.length, actual: deaths });
      c.note(`outcome read from the rows: ${success ? 'win' : 'loss'}`);
    } else if (M.mobs) {
      const won = deaths === M.mobs.length;
      if (res.success === won) c.ok(); else c.bad('success disagrees with the mobs killed', { expected: won, actual: res.success });
    }
    const hpLeft = Number.isFinite(res.playerHpRemaining) ? [res.playerHpRemaining] : [];
    if (success) {
      if (last.type === 'mob_death') c.ok(); else c.bad('a win does not end on mob_death', { actual: last.type });
      if (hpLeft.length) {
        if (res.playerHpRemaining === last.playerHpAfter) c.ok(); else c.bad('playerHpRemaining is not the last HP', { expected: last.playerHpAfter, actual: res.playerHpRemaining });
      }
    } else {
      const d = rows.findIndex((e) => e.type === 'player_death');
      if (d === rows.length - 1) c.ok(); else c.bad(d < 0 ? 'a loss has no player_death row' : 'rows follow player_death', { index: d < 0 ? undefined : d + 1 });
      if (last.playerHpAfter === 0 && hpLeft.every((v) => v === 0)) c.ok();
      else c.bad('the dead player has HP left', { expected: 0, actual: [last.playerHpAfter, ...hpLeft] });
      if (last.playerShieldHp === undefined || last.playerShieldHp === 0) c.ok();
      else c.bad('the death row carries a shield', { expected: 0, actual: last.playerShieldHp });
    }
  });

  // ---- mobs: one fight per mob in order, each starting at the catalogue HP ----
  // the mob's HP before its first row: a spell-pass row carries the HP after the whole pass, any other
  // row the HP after itself
  const mobStartHp = (s) => {
    if (!s.t.length) return null;
    const e0 = rows[s.t[0]];
    const list = s.t.filter((i) => rows[i].timestamp === e0.timestamp);
    const k = passLen(list);
    if (!k) return e0.mobHpAfter + (MOB_DAMAGE.has(e0.type) ? e0.damage : 0);
    let dmg = 0;
    for (const i of list.slice(0, k)) if (rows[i].type === 'spell_damage' || rows[i].type === 'spell_dot_tick') dmg += rows[i].damage;
    return e0.mobHpAfter + dmg;
  };
  run('mobs', (c) => {
    if (!M.mobs) return c.skip(needMobs);
    if (segs.length <= M.mobs.length) c.ok(); else c.bad('more fights than mobs', { expected: M.mobs.length, actual: segs.length });
    for (const s of segs) {
      const mob = M.mobs[s.mob];
      if (!mob) continue;
      const hp = mobStartHp(s);
      if (hp === null) continue;
      // a first hit that kills is logged in full, so it only bounds the HP from above
      const overkill = rows[s.t[0]].mobHpAfter === 0 && hp > mob.maxHp;
      if (hp === mob.maxHp || overkill) c.ok(); else c.bad(`mob ${s.mob + 1} does not start at the catalogue HP`, { index: s.t[0], expected: mob.maxHp, actual: hp });
    }
    if (raid) {
      rows.forEach((e, i) => {
        if (e.mobIndex === segOf[i].mob) return;
        if (e.mobIndex < M.mobs.length) c.ok(); else c.bad('a row from a mob the step does not have', { index: i, expected: `< ${M.mobs.length}`, actual: e.mobIndex });
      });
    }
  });

  // ---- transitions: a mob dies on its mob_death row; the next fight starts gap ms later ----
  run('transitions', (c) => {
    segs.forEach((s, k) => {
      const nxt = segs[k + 1];
      const deathRow = raid ? s.deathIdx : s.last;
      if (nxt) {
        if (s.died) c.ok(); else c.bad(`mob ${s.mob + 1}'s rows end without mob_death`, { index: s.last, actual: rows[s.last].type });
        if (deathRow >= 0 && rows[deathRow].mobHpAfter === 0) c.ok(); else c.bad('mob_death with HP left', { index: deathRow, actual: rows[deathRow]?.mobHpAfter });
      }
      if (raid && k > 0) {
        // the gap before a raid fight holds only the mobs' swings and regen pulses; the player's own
        // swings and spells wait for the fight's start (an assumption of §21.1)
        for (let i = s.first; i <= s.last && rows[i].timestamp <= s.start; i++) {
          if (GAP_TYPES.has(rows[i].type)) c.ok();
          else c.bad(`${rows[i].type} in the ${gap} ms before mob ${s.mob + 1}'s fight`, { index: i, expected: `> ${s.start}`, actual: rows[i].timestamp });
        }
      } else if (rows[s.first].timestamp > s.start) c.ok();
      else c.bad(`mob ${s.mob + 1}'s first row is not after its start (${k ? 'death + ' : ''}${gap} ms)`, { index: s.first, expected: `> ${s.start}`, actual: rows[s.first].timestamp });
      for (let i = s.first; i < s.last; i++) {
        const e = rows[i];
        if (e.type === 'player_death') c.bad('rows follow a death in the same fight', { index: i + 1 });
        else if (e.type === 'mob_death') {
          // raid: after a swing kill the mobs behind the target still swing in that tick (fight.js)
          const after = rows.slice(i + 1, s.last + 1);
          if (!raid || after.some((r) => r.timestamp !== e.timestamp || r.mobIndex === s.mob)) c.bad('rows follow a death in the same fight', { index: i + 1 });
          else c.ok();
        }
      }
    });
  });

  // ---- player-swings: round(1000 / attackSpeed) ms from each fight's start, remainder carried (§4) ----
  run('player-swings', (c) => {
    if (!P) return c.skip(needSheet);
    if (M.summon) return c.skip('a summon opening shifts the swing clock');
    if (M.stacks || buffs(M.spells, ['ATTACK_SPEED'])) return c.skip('an attack-speed buff or Elusive changes the swing clock');
    const interval = Math.round(1000 / P.attackSpeed);
    for (const s of segs) {
      let want = modelSwingTimes(interval, s.start, s.end, dt);
      if (spellKill(s)) want = want.filter((t) => t !== s.end);
      // raid: the player swings at the target only (§21.1)
      const got = [...new Set(s.t.map((i) => rows[i]).filter((e) => PLAYER_SWING.has(e.type)).map((e) => e.timestamp))];
      if (sameList(got, want)) { for (let i = 0; i < got.length; i++) c.ok(); continue; }
      const at = firstDiff(got, want);
      c.bad(`mob ${s.mob + 1}: player swing times differ from a ${interval} ms clock`, { timestamp: got[at] ?? want[at], expected: want[at], actual: got[at] });
    }
    c.note(`${interval} ms`);
  });

  // ---- mob-swings: each mob on its own round(1000 / attackSpeed) clock from its fight's start ----
  run('mob-swings', (c) => {
    if (!M.mobs) return c.skip(needMobs);
    if (raid) return raidMobSwings(c);
    if (rows.some((e) => /^spell_debuff/.test(e.type))) return c.skip('a debuff on the mob may slow its swing clock');
    if (M.summon) return c.skip('a summon opening shifts the swing clock');
    const notes = [];
    for (const s of segs) {
      const mob = M.mobs[s.mob];
      if (!mob) continue;
      const interval = Math.round(1000 / mob.attackSpeed);
      notes.push(interval);
      let want = modelSwingTimes(interval, s.start, s.end, dt);
      if (s.died && !thornsKill(s)) want = want.filter((t) => t !== s.end);
      const got = [...new Set(rows.slice(s.first, s.last + 1).filter((e) => MOB_SWING.has(e.type)).map((e) => e.timestamp))];
      if (sameList(got, want)) { for (let i = 0; i < got.length; i++) c.ok(); continue; }
      const at = firstDiff(got, want);
      c.bad(`mob ${s.mob + 1}: swing times differ from a ${interval} ms clock`, { timestamp: got[at] ?? want[at], expected: want[at], actual: got[at] });
    }
    if (notes.length) c.note(`${notes.join(' / ')} ms`);
  });

  // Raid clocks (combat-pve.md §21.1): every living mob swings, each from an unknown point of its swing,
  // so a mob's first swing only has to come within one interval, and every later swing follows from it.
  // The clocks run on the wall clock from the first fight's start, through the gaps after a target's
  // death, and a mob that becomes the target keeps its clock (the 2026-11-13 log). Inside one tick the
  // mobs swing by index (the target is the first living one); none swings once the player is dead, and
  // none behind the target on a tick the spell or debuff pass killed it (fight.js returns before the
  // combat tick).
  function raidMobSwings(c) {
    if (M.summon) return c.skip('a minion takes the mobs\' swings');
    const lastRow = rows.length - 1;
    const killer = last.type === 'player_death' ? last.mobIndex : null;
    const debuffed = rows.some((e) => /^spell_debuff/.test(e.type));
    const held = new Set(rows.filter((e, i) => (e.type === 'mob_paralyzed' || e.type === 'mob_feared') && e.mobIndex === segOf[i].mob).map((e) => e.mobIndex));
    const notes = [];
    const skipped = [];
    M.mobs.forEach((mob, j) => {
      const interval = Math.round(1000 / mob.attackSpeed);
      if (!(interval > 0) || !Number.isFinite(interval)) return;
      // a debuff or a paralysis on the target may hold its clock; the mobs behind it carry none
      if ((debuffed || held.has(j)) && j < segs.length) { skipped.push(j + 1); return; }
      notes.push(interval);
      const opp = [];
      for (const s of segs) {
        if (s.mob > j) break; // mob j died as the target of an earlier fight
        const spellDeath = spellKill(s);
        for (let t = s.from + dt; t <= s.end; t += dt) {
          if (t === s.end && s.died && ((j === s.mob && !thornsKill(s)) || spellDeath)) continue;
          if (killer !== null && t === last.timestamp && j > killer) continue;
          opp.push(t);
        }
      }
      const got = [...new Set(rows.filter((e) => e.mobIndex === j && MOB_SWING.has(e.type)).map((e) => e.timestamp))];
      const fit = fitRandomClock(interval, opp, got, dt);
      if (fit.match) {
        if (got.length) for (let i = 0; i < got.length; i++) c.ok();
        else c.ok(); // no swing, and a start exists that leaves none in the window
        return;
      }
      const at = firstDiff(got, fit.want);
      c.bad(got.length
        ? `mob ${j + 1}: swing times fit no start point of a ${interval} ms clock`
        : `mob ${j + 1} never swung, but every start point of a ${interval} ms clock gives it a swing`, {
        index: got.length ? rows.findIndex((e) => e.mobIndex === j && MOB_SWING.has(e.type) && e.timestamp === got[at]) : lastRow,
        timestamp: got[at] ?? fit.want[at], expected: fit.want[at], actual: got[at],
      });
    });
    if (notes.length) c.note(`${notes.join(' / ')} ms; start points not compared, spacing from each mob's first swing on`);
    if (skipped.length) c.note(`mob ${skipped.join(', ')} skipped: a debuff or paralysis on the target may hold its clock`);
  }

  // ---- spell-schedule: casts, DoT ticks and ends of the DAMAGE spells, in runtime order per tick ----
  const configs = M.spells ?? [];
  const damageConfigs = configs.filter((cf) => cf.spell?.spellType === 'DAMAGE');
  run('spell-schedule', (c) => {
    if (!P) return c.skip(needSheet);
    if (!damageConfigs.length) return c.skip('no DAMAGE spell equipped');
    const species = new Set(damageConfigs.map((cf) => cf.species));
    if (damageConfigs.length < configs.length) c.note('only the DAMAGE spells\' schedule is compared');
    const want = damageSpellSchedule(damageConfigs, dt, fcEnd).map(([fc, type, sp]) => {
      const s = segAtFc(fc);
      return `${s.start + fc - s.base} ${type} ${sp}`;
    });
    const got = rows.filter((e) => SCHEDULE_TYPES.has(e.type) && species.has(e.spell?.species))
      .map((e) => `${e.timestamp} ${e.type} ${e.spell.species}`);
    if (sameList(got, want)) { for (let i = 0; i < got.length; i++) c.ok(); return; }
    const at = firstDiff(got, want);
    c.bad('the spell schedule differs from the cooldowns, the opening delay and the DoT cycle', { index: at, expected: want[at], actual: got[at] });
  });

  const cfgBySpecies = new Map(configs.map((cf) => [cf.species, cf]));
  const mobAt = (e) => M.mobs?.[e.mobIndex] ?? null;
  // ---- spell-damage: modSpellDmg with the mob's spell resist (§10.2) ----
  run('spell-damage', (c) => {
    if (!P) return c.skip(needSheet);
    if (!M.mobs) return c.skip(needMobs);
    if (buffs(configs, ['SPELL_DAMAGE', 'SPELL_CRIT', 'ATTACK_PERCENT', 'CRIT_DAMAGE']) || configs.some((cf) => cf.spell?.momentum)) {
      return c.skip('a spell-damage, attack or momentum buff changes the sizes');
    }
    let drSeen = false;
    rows.forEach((e, i) => {
      if (e.type !== 'spell_damage' && e.type !== 'spell_dot_tick') return;
      const cf = cfgBySpecies.get(e.spell?.species);
      const mob = mobAt(e);
      if (!cf || !mob) return;
      const sp = cf.spell;
      const pct = e.type === 'spell_damage' && sp.spellType === 'DEBUFF' ? sp.initialAttackPercent : sp.attackPercent;
      const b = pct ? Math.floor((P.attack * pct) / 100) : (e.type === 'spell_dot_tick' ? sp.damagePerTick : sp.baseDamage) ?? 0;
      const R = M.liveResist ? mob.spellResist : mob.spellResist + mob.damageReduction;
      if (mob.damageReduction > 0) drSeen = true;
      const mod = (x) => (x <= 0 ? 0 : Math.max(1, Math.floor(x * (1 + P.spellDamage / 100) * (1 - Math.min(R, SPELL_RESIST_HARD) / 100))));
      const want = mod(e.isCrit ? b * P.critDamage : b);
      if (e.damage === want) c.ok();
      else c.bad(`${e.spell.species} ${e.isCrit ? 'crit ' : ''}${e.type} size differs from the sheet (spell resist ${R})`, { index: i, timestamp: e.timestamp, expected: want, actual: e.damage });
    });
    if (!drSeen) c.note('every mob has DR 0: the live loop\'s resist (spell resist only) and the shared engine\'s (spell resist + DR) agree here');
  });

  // ---- spell-heals: every spell hit is followed, in its tick, by its vamp heal ----
  const vamp = P ? applyCombatCeiling(P.spellVamp, SPELL_VAMP_CEILING) : 0;
  run('spell-heals', (c) => {
    if (!P) return c.skip(needSheet);
    if (buffs(configs, ['SPELL_VAMP']) || configs.some((cf) => cf.spell?.momentum)) return c.skip('a spell-vamp buff changes the heal');
    rows.forEach((e, i) => {
      if (e.type !== 'spell_damage' && e.type !== 'spell_dot_tick') return;
      const want = Math.floor((e.damage * vamp) / 100);
      const h = rows[i + 1];
      if (want <= 0) {
        if (h?.type === 'spell_heal_tick' && h.timestamp === e.timestamp && h.spell?.species === e.spell?.species) c.bad('a heal row with no vamp', { index: i + 1 });
        else c.ok();
        return;
      }
      if (!h || h.type !== 'spell_heal_tick' || h.timestamp !== e.timestamp || h.spell?.species !== e.spell?.species) {
        c.bad(`${e.spell?.species} ${e.type} is not followed by its heal in the same tick`, { index: i, timestamp: e.timestamp, expected: want, actual: h ? `${h.timestamp} ${h.type}` : null });
      } else if (h.damage !== want) {
        c.bad(`${e.spell?.species} vamp heal differs from floor(damage x ${vamp}%)`, { index: i + 1, timestamp: h.timestamp, expected: want, actual: h.damage });
      } else c.ok();
    });
    rows.forEach((h, i) => {
      if (h.type !== 'spell_heal_tick') return;
      const p = rows[i - 1];
      const cf = cfgBySpecies.get(h.spell?.species);
      const vampRow = p && (p.type === 'spell_damage' || p.type === 'spell_dot_tick') && p.timestamp === h.timestamp && p.spell?.species === h.spell?.species;
      if (vampRow || cf?.spell?.spellType === 'HEAL' || cf?.spell?.selfHealPercent) c.ok();
      else c.bad('a heal row with no spell hit before it', { index: i, timestamp: h.timestamp });
    });
  });

  // a mob's swing on the player, before the shield: its attack through the player's DR; a blocked or
  // missed swing pierces for its penetration share unless the player has Miss
  const mobRaw = (e, mob) => (e.type === 'mob_attack' || e.type === 'player_death'
    ? applyDamageReduction(mob.attack, P.damageReduction)
    : P.missChance > 0 ? 0 : applyDamageReduction(Math.round((mob.attack * (mob.penetration ?? 0)) / 100), P.damageReduction));
  // sizes of the player's swings and the mob's raw hit
  const playerSizesFixed = P && !buffs(configs, ['ATTACK_PERCENT', 'CRIT_DAMAGE', 'PENETRATION']) && !M.stacks;
  // a DR, Block or Miss buff (Iron Bastion) or Bulwark changes what a mob's swing does to the player
  const mobSizesFixed = P && !buffs(configs, ['DAMAGE_REDUCTION', 'BLOCK_CHANCE', 'MISS_CHANCE']) && !M.stacks;
  // ---- hit-sizes: player hits from the sheet against the mob's DR; mob hits within the shield's range ----
  run('hit-sizes', (c) => {
    if (!P && !raid) return c.skip(needSheet);
    if (!M.mobs) return c.skip(needMobs);
    if (!P) {
      // raid without the sheet: the shield takes a hit 1:1, so a row's damage is the raw hit (§21.1).
      // The player's DR is unknown: each mob's full hits must agree and stay within its attack.
      const seen = new Map();
      rows.forEach((e, i) => {
        if (e.type !== 'mob_attack' && e.type !== 'player_death') return;
        const mob = mobAt(e);
        if (!mob) return;
        const top = mob.critChance > 0 ? Math.round(mob.attack * mob.critDamage) : mob.attack;
        if (!(e.damage > 0 && e.damage <= top)) {
          return c.bad(`${e.type} outside 1-${top} (mob ${e.mobIndex + 1}'s attack)`, { index: i, timestamp: e.timestamp, expected: `1-${top}`, actual: e.damage });
        }
        const first = seen.get(e.mobIndex);
        if (first === undefined || mob.critChance > 0) { seen.set(e.mobIndex, e.damage); return c.ok(); }
        if (e.damage === first) c.ok();
        else c.bad(`mob ${e.mobIndex + 1}'s hits differ in size (no mob crit)`, { index: i, timestamp: e.timestamp, expected: first, actual: e.damage });
      });
      return c.note('the player\'s DR is unknown without the sheet: each mob\'s hits compared with each other and with its attack; player hits and pierces need the sheet');
    }
    rows.forEach((e, i) => {
      const mob = mobAt(e);
      if (!mob) return;
      if (PLAYER_SWING.has(e.type) && playerSizesFixed) {
        let want;
        if (e.type === 'mob_block') {
          if (mob.missChance > 0 || !(P.penetration > 0)) want = [0];
          else {
            const b = Math.round((P.attack * P.penetration) / 100);
            want = [b, Math.round(b * P.critDamage)].map((x) => applyDamageReduction(x, mob.damageReduction));
          }
        } else if (e.type === 'player_crit') want = [applyDamageReduction(Math.round(P.attack * P.critDamage), mob.damageReduction)];
        else want = [applyDamageReduction(P.attack, mob.damageReduction)];
        if (want.includes(e.damage)) c.ok();
        else c.bad(`${e.type} size differs from the sheet`, { index: i, timestamp: e.timestamp, expected: want.join(' or '), actual: e.damage });
      } else if (MOB_HIT.has(e.type) && mobSizesFixed) {
        const raw = mobRaw(e, mob);
        const lo = P.shieldMax > 0 ? raw * (1 - M.mitigation) : raw;
        if (e.damage >= Math.round(lo) && e.damage <= raw) c.ok();
        else c.bad(`${e.type} outside the mob's range (raw ${raw}, shield mitigation ${M.mitigation})`, { index: i, timestamp: e.timestamp, expected: `${Math.round(lo)}-${raw}`, actual: e.damage });
      }
    });
    if (!playerSizesFixed) c.note('an attack, crit-damage or penetration buff or a stack sigil changes the player\'s sizes: player hits not compared');
    if (!mobSizesFixed) c.note('a DR, Block or Miss buff or a stack sigil changes the mobs\' hits: mob hits not compared');
  });

  // ---- mob-hp: every hit takes exactly its damage off the mob; spell rows carry the pass's end value ----
  run('mob-hp', (c) => {
    const behindHp = new Map(); // raid: the HP each mob behind the target shows
    for (const s of segs) {
      const T = s.t;
      if (T.length) {
        let hp = M.mobs?.[s.mob] ? M.mobs[s.mob].maxHp : mobStartHp(s);
        let p = 0;
        while (p < T.length) {
          const t = rows[T[p]].timestamp;
          let q = p;
          while (q < T.length && rows[T[q]].timestamp === t) q++;
          const list = T.slice(p, q);
          // the spell pass: its rows all carry the HP after the whole pass
          const k = passLen(list);
          let dmg = 0;
          for (const i of list.slice(0, k)) if (rows[i].type === 'spell_damage' || rows[i].type === 'spell_dot_tick') dmg += rows[i].damage;
          hp = Math.max(0, hp - dmg);
          for (const i of list.slice(0, k)) {
            if (rows[i].mobHpAfter === hp) c.ok();
            else c.bad('a spell row does not carry the mob HP after the spell pass', { index: i, timestamp: t, expected: hp, actual: rows[i].mobHpAfter });
          }
          for (const i of list.slice(k)) {
            const e = rows[i];
            if (MOB_DAMAGE.has(e.type)) hp = Math.max(0, hp - e.damage);
            if (e.type === 'mob_death' ? e.mobHpAfter === 0 && hp === 0 : e.mobHpAfter === hp) c.ok();
            else c.bad(`${e.type}: mob HP is not the running value`, { index: i, timestamp: t, expected: e.type === 'mob_death' ? 0 : hp, actual: e.mobHpAfter });
          }
          p = q;
        }
      }
      if (!raid) continue;
      // the mobs behind the target take no damage: player hits, spells and reflects land on the target
      // (§21.1); their HP is the catalogue's, or without the mobs their first logged value
      for (let i = s.first; i <= s.last; i++) {
        const e = rows[i];
        if (e.mobIndex === s.mob) continue;
        const want = M.mobs?.[e.mobIndex]?.maxHp ?? behindHp.get(e.mobIndex) ?? e.mobHpAfter;
        behindHp.set(e.mobIndex, want);
        if (e.mobHpAfter === want) c.ok();
        else c.bad(`mob ${e.mobIndex + 1} behind the target lost HP`, { index: i, timestamp: e.timestamp, expected: want, actual: e.mobHpAfter });
      }
    }
  });

  // ---- the HP and shield chains: rebuilt tick by tick, pulses included ----
  // Per tick (§2): the spell pass heals (clamped to max HP; the shield refills with the overflow, or the
  // whole vamp heal with vampAlwaysRefills), then processCombatTick: a regen pulse every 100 ms of the fight
  // (a player_regen row only while HP is below max; the overflow refills the shield), the player's swing
  // (lifesteal on the hit, clamped), the mob's swing (absorbWithShield at the mode's mitigation). Combat
  // rows carry the shield at the end of the tick (L1088990-1089030). In a raid the mobs behind the target
  // swing after the target's combat tick, and every combat row of the tick carries the shield after all
  // of them (the 2026-11-13 log, §21.1); the regen pulse runs on its raid clock, gaps included.
  // `S` is the sheet the chain uses: the attacker's, or for the raid's `ledger` one read from the log.
  // `lifesteal: null` takes the HP after a player swing from its row (a heal of at least 0 up to max HP);
  // `checkDamage: false` skips the logged-damage comparison (the ledger takes the raw hit from it).
  function rebuild(S) {
    const out = { regen: [], hp: [], shield: [], cap: [] };
    const { maxHp, shieldMax, pulse, vampRefills, regenRefills } = S;
    let hp = maxHp;
    let shield = shieldMax;
    const refill = (x) => { if (x > 0 && shieldMax > 0 && shield < shieldMax) shield = Math.min(shieldMax, shield + x); };
    const checkShield = (i, t, what) => {
      const v = rows[i].playerShieldHp;
      if (v === undefined) return;
      if (near(v, shield)) out.shield.push(['ok']);
      else out.shield.push([`${rows[i].type}: shield is not the value ${what}`, { index: i, timestamp: t, expected: shield, actual: v }]);
      if (v > shieldMax + 1e-6) out.cap.push(['shield above its cap', { index: i, timestamp: t, expected: `<= ${shieldMax}`, actual: v }]);
    };
    for (const s of segs) {
      const byTs = new Map();
      for (let i = s.first; i <= s.last; i++) {
        let l = byTs.get(rows[i].timestamp);
        if (!l) byTs.set(rows[i].timestamp, (l = []));
        l.push(i);
      }
      const times = new Set(byTs.keys());
      if (raid) { for (const t of raidPulses) if (t > s.from && t <= s.end) times.add(t); } else {
        for (let t = s.start + REGEN_PULSE_MS; t <= s.end; t += REGEN_PULSE_MS) times.add(t);
      }
      for (const t of [...times].sort((a, b) => a - b)) {
        const idx = byTs.get(t) ?? [];
        const k = passLen(idx);
        const spellIdx = idx.slice(0, k);
        // spell pass
        let heal = 0;
        let vampHeal = 0;
        for (const i of spellIdx) {
          const e = rows[i];
          if (e.type !== 'spell_heal_tick') continue;
          heal += e.damage;
          const p = rows[i - 1];
          if (p && (p.type === 'spell_damage' || p.type === 'spell_dot_tick') && p.timestamp === t) vampHeal += e.damage;
        }
        if (heal > 0) {
          const prev = hp;
          hp = Math.min(maxHp, hp + heal);
          refill(shieldRefillAmount({ ownerHpDelta: heal, ownerVampHeal: vampHeal }, hp - prev, vampRefills));
        }
        // the tick's rows, stamped with the shield at its end: spell rows too when they carry one (the
        // 2026-11-13 log: at 2 500 they hold the full-HP regen pulse of the combat tick), but HP after
        // the pass (the 2026-10-29 log at 1 500)
        const pending = [];
        for (const i of spellIdx) {
          if (near(rows[i].playerHpAfter, hp)) out.hp.push(['ok']);
          else out.hp.push([`${rows[i].type}: player HP is not the value after the spell pass`, { index: i, timestamp: t, expected: hp, actual: rows[i].playerHpAfter }]);
          pending.push(i);
        }
        const rest = idx.slice(k);
        // a mob killed by the spell pass takes no combat tick, and the mobs behind it do not swing
        if (spellIdx.some((i) => rows[i].mobHpAfter <= 0)) {
          for (const i of rest) if (rows[i].type !== 'mob_death') out.hp.push(['a combat row after a spell kill', { index: i, timestamp: t }]);
          for (const i of pending) checkShield(i, t, 'at the end of its tick');
          continue;
        }
        // combat tick: regen pulse first
        let regenRow = null;
        if (pulse > 0 && isPulse(t, s)) {
          const applied = hp < maxHp ? Math.min(pulse, maxHp - hp) : 0;
          const ri = rest.find((i) => rows[i].type === 'player_regen');
          if (applied > 0) {
            hp += applied;
            if (ri === undefined) out.regen.push([`missing regen pulse (HP ${hp - applied} below max ${maxHp})`, { timestamp: t, expected: hp }]);
            else if (rest[0] !== ri) out.regen.push(['the regen row is not the first combat row of its tick', { index: ri, timestamp: t }]);
            else if (!near(rows[ri].playerHpAfter, hp) || rows[ri].damage !== 0) {
              out.regen.push(['regen pulse has the wrong size', { index: ri, timestamp: t, expected: `+${applied} to ${hp}, damage 0`, actual: `${rows[ri].playerHpAfter}, damage ${rows[ri].damage}` }]);
            } else out.regen.push(['ok']);
            regenRow = ri;
          } else if (ri !== undefined) out.regen.push(['a regen row at full HP', { index: ri, timestamp: t }]);
          else out.regen.push(['ok']);
          refill(regenShieldRefillAmount(pulse, applied, regenRefills));
        } else if (rest.some((i) => rows[i].type === 'player_regen')) {
          out.regen.push([pulseNote, { index: rest.find((i) => rows[i].type === 'player_regen'), timestamp: t }]);
        }
        for (const i of rest) {
          const e = rows[i];
          if (i === regenRow) { pending.push(i); continue; }
          if (PLAYER_SWING.has(e.type)) {
            if (S.lifesteal === null) {
              if (e.playerHpAfter >= hp - 1e-6 && e.playerHpAfter <= maxHp + 1e-6) hp = e.playerHpAfter;
            } else if (S.lifesteal > 0 && hp < maxHp) hp += Math.min(Math.floor((e.damage * S.lifesteal) / 100), maxHp - hp);
          } else if (MOB_HIT.has(e.type)) {
            const mob = M.mobs?.[e.mobIndex];
            const raw = S.raw(e, mob);
            const before = shield;
            const a = absorbWithShield(shield, raw, S.mitigation);
            shield = a.shieldHp;
            hp -= a.hpDamage;
            if (hp <= 0) hp = 0;
            if (S.checkDamage) {
              if (e.damage === Math.round(a.effectiveDamage)) out.shield.push(['ok']);
              else out.shield.push([`${e.type}: logged damage is not the shield-effective cost of a ${raw} hit on a ${before} shield`, { index: i, timestamp: t, expected: Math.round(a.effectiveDamage), actual: e.damage }]);
            }
          } else if (e.type === 'player_regen') {
            continue;
          }
          if (near(e.playerHpAfter, hp)) out.hp.push(['ok']);
          else out.hp.push([`${e.type}: player HP is not the running value`, { index: i, timestamp: t, expected: hp, actual: e.playerHpAfter }]);
          pending.push(i);
        }
        for (const i of pending) checkShield(i, t, 'at the end of its tick');
      }
    }
    return out;
  }

  const chainSkip = !P ? needSheet
    : !M.mobs ? needMobs
      : M.summon ? 'a minion takes the mob\'s swings'
        : (M.stacks || M.chrono || buffs(configs, ['HP_PERCENT', 'HP_REGEN', 'LIFESTEAL', 'DAMAGE_REDUCTION', 'BLOCK_CHANCE', 'MISS_CHANCE']))
          ? 'a buff, stack sigil or transform changes max HP, regen, lifesteal or defences'
          : rows.some((e) => e.type === 'player_instability' || e.type === 'thorns_reflect') ? 'Oblivion pulses or thorns are not modelled'
            : null;
  const chain = chainSkip ? null : rebuild({
    maxHp: P.maxHp, shieldMax: P.shieldMax,
    pulse: P.hpRegen > 0 ? Math.max(1, Math.round((P.maxHp * P.hpRegen) / 100 / 10)) : 0,
    vampRefills: !!P.shieldVampAlwaysRefills, regenRefills: !!P.shieldRegenAlwaysRefills,
    lifesteal: P.lifesteal, raw: mobRaw, mitigation: M.mitigation, checkDamage: true,
  });
  const replayChain = (list) => (c) => {
    if (chainSkip) return c.skip(chainSkip);
    for (const [msg, extra] of list) { if (msg === 'ok') c.ok(); else c.bad(msg, extra); }
  };
  run('regen', (c) => {
    if (chainSkip) {
      // the grid alone, without the chain
      rows.forEach((e, i) => {
        if (e.type !== 'player_regen') return;
        if (isPulse(e.timestamp, segOf[i])) c.ok(); else c.bad(pulseNote, { index: i, timestamp: e.timestamp });
      });
      return c.skip(`pulse sizes and missing pulses not compared (grid only): ${chainSkip}`);
    }
    replayChain(chain.regen)(c);
    if (P.hpRegen > 0) c.note(`pulse ${Math.max(1, Math.round((P.maxHp * P.hpRegen) / 100 / 10))} every ${REGEN_PULSE_MS} ms`);
  });
  run('hp-chain', (c) => replayChain(chain?.hp)(c));
  run('shield-chain', (c) => {
    if (!chainSkip && !(P.shieldMax > 0)) return c.skip('no shield');
    replayChain(chain?.shield)(c);
  });

  // ---- ledger (raid): the HP and shield chain from the log alone ----
  // At the raid's 0 mitigation a hit's row damage is the raw hit and the shield takes it 1:1 (§21.1), so
  // the chain needs no sheet: max HP is the highest logged HP (the player starts full), the regen pulse is
  // the logged pulses' size, the shield starts at playerShieldMax, a swing's lifesteal is read from its
  // row. Whether vamp heals and full pulses refill the shield whole or by the overflow is read from the
  // log too: the four combinations are rebuilt and the closest one is kept (its choice is noted).
  if (raid) {
    run('ledger', (c) => {
      if (M.mitigation !== 0) return c.skip('needs the raid\'s 0 shield mitigation');
      if (P && chainSkip && chainSkip !== needMobs) return c.skip(chainSkip);
      if (rows.some((e) => /^minion_/.test(e.type) || e.type === 'player_instability' || e.type === 'thorns_reflect')) {
        return c.skip('a minion, Oblivion pulses or thorns are not modelled');
      }
      const shieldMax = Number.isFinite(res.playerShieldMax) ? res.playerShieldMax : 0;
      // the player starts full with a full shield: a first row that is a hit shows max HP less what
      // got past that shield; any other first row shows max HP
      const e0 = rows[0];
      const maxHp = Math.max(...rows.map((e) => e.playerHpAfter),
        e0 && MOB_HIT.has(e0.type) ? e0.playerHpAfter + Math.max(0, e0.damage - shieldMax) : 0);
      const deltas = new Map();
      rows.forEach((e, i) => {
        if (e.type !== 'player_regen' || i === 0 || !(e.playerHpAfter < maxHp)) return;
        const d = e.playerHpAfter - rows[i - 1].playerHpAfter;
        if (d > 0) deltas.set(d, (deltas.get(d) ?? 0) + 1);
      });
      if (!deltas.size) return c.skip('the regen pulse is not readable from the log (no pulse below max HP)');
      const pulse = [...deltas.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      let best = null;
      for (const vampRefills of [false, true]) {
        for (const regenRefills of [false, true]) {
          const out = rebuild({
            maxHp, shieldMax, pulse, vampRefills, regenRefills, lifesteal: null, raw: (e) => e.damage, mitigation: 0, checkDamage: false,
          });
          const list = [...out.regen, ...out.hp, ...out.shield, ...out.cap];
          const bad = list.filter(([m]) => m !== 'ok').length;
          if (!best || bad < best.bad) best = { bad, list, vampRefills, regenRefills };
        }
      }
      for (const [msg, extra] of best.list) { if (msg === 'ok') c.ok(); else c.bad(msg, extra); }
      c.note(`read from the log: max HP ${maxHp}, pulse ${pulse} every ${REGEN_PULSE_MS} ms, shield ${shieldMax}; `
        + `vamp heals refill the shield ${best.vampRefills ? 'whole' : 'by the overflow'}, pulses ${best.regenRefills ? 'whole' : 'by the overflow'}`);
    });
  }

  run('shield-cap', (c) => {
    const cap = res.playerShieldMax;
    if (P && P.shieldMax > 0) {
      if (cap === P.shieldMax) c.ok(); else c.bad('playerShieldMax is not floor(maxHp x shield %)', { expected: P.shieldMax, actual: cap });
    }
    if (!Number.isFinite(cap)) return P?.shieldMax > 0 ? undefined : c.skip('no shield');
    rows.forEach((e, i) => {
      if (e.playerShieldHp === undefined) return;
      if (e.playerShieldHp <= cap) c.ok();
      else c.bad('shield above playerShieldMax', { index: i, timestamp: e.timestamp, expected: `<= ${cap}`, actual: e.playerShieldHp });
    });
    if (chain) for (const [msg, extra] of chain.cap) c.bad(msg, extra);
  });

  return finish();
}
