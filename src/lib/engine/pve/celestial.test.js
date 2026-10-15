// Celestial Trial engine: one test per mechanic, on synthetic fighters with scripted rolls.
// Rules under test: Game/combat-pve.md §20.
import { describe, it, expect } from 'vitest';
import {
  simulateCelestial, celestialBossStats, celestialAddStats, celestialRolls, celestialMaxHoldCount,
  defaultTankIndex, CELESTIAL_ASSUMPTIONS,
} from './celestial.js';
import { laneRng } from '../rng.js';

const sheet = (o = {}) => ({
  totalHp: 1_000_000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 2, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0, totalPvpAttack: 0,
  totalPvpDefense: 0, ...o,
});
const fighter = (stats, extra = {}) => ({ stats: sheet(stats), class: 'WARRIOR', spec: 'WARRIOR_DPS', level: 85, sigils: [], ...extra });
const tank = (stats, extra = {}) => fighter(stats, { spec: 'WARRIOR_TANK', ...extra });

/** Rolls that never proc, every add swinging `phase` ms after it spawns; `over` replaces any method. */
const scripted = (over = {}, phase = 500) => ({
  crit: () => false, double: () => false, blind: () => false, paralyze: () => false, avoid: () => false,
  addPhase: () => phase, ...over,
});
const run = (o) => simulateCelestial({ difficulty: 'HARD', log: true, rolls: scripted(), ...o });
const rows = (r, type) => r.log.filter((t) => t.type === type);
// a boss no synthetic party can kill inside the window that matters
const TOUGH = 1;

describe('boss and add scaling', () => {
  it('HARD level 85 and 95 match the server logs (bossMaxHp, add HP, attack)', () => {
    expect(celestialBossStats(85, 'HARD')).toMatchObject({ hp: 8388341867, attack: 266866, attackSpeed: 1.9, spellResist: 45 });
    expect(celestialBossStats(95, 'HARD')).toMatchObject({ hp: 33935521328, attack: 477916 });
    expect(celestialAddStats(85, 'HARD')).toMatchObject({ hp: 419417093, attack: 53373 });
    expect(celestialAddStats(95, 'HARD')).toMatchObject({ hp: 1696776066, attack: 95583, attackSpeed: 1 });
    expect(celestialBossStats(85, 'NORMAL')).toMatchObject({ hp: 2461903877, spellResist: 0 });
  });

  it('scales by the party\'s highest level', () => {
    const r = run({ party: [fighter({}, { level: 85 }), tank({}, { level: 95 })], tankIndex: 1 });
    expect(r.level).toBe(95);
    expect(r.bossMaxHp).toBe(33935521328);
  });

  it('MYTHIC is refused (its party-power HP scaling is server-side)', () => {
    expect(() => run({ party: [tank({})], difficulty: 'MYTHIC' })).toThrow(/not simulated/);
  });
});

describe('clock and time limit', () => {
  it('starts at 500 ms with a Burden update per player, ticks every 10 ms, swings on round(1000/AS)', () => {
    const r = run({ party: [fighter({ totalAttackSpeed: 2.85 }), tank({})], tankIndex: 1 });
    expect(r.log.slice(0, 2).map((t) => [t.timestamp, t.type, t.burdenStacks])).toEqual([[500, 'burden_update', 0], [500, 'burden_update', 0]]);
    const swings = rows(r, 'player_attack').filter((t) => t.playerIndex === 0).slice(0, 3).map((t) => t.timestamp);
    expect(swings).toEqual([860, 1210, 1560]); // 351 ms interval, remainder kept, 10 ms grid
    const boss = rows(r, 'boss_attack').slice(0, 2).map((t) => t.timestamp);
    expect(boss).toEqual([1030, 1560]); // 526 ms
  });

  it('a boss alive at the time limit is a timed-out loss (240 s NORMAL, 360 s HARD)', () => {
    const party = [tank({ totalHp: 1e15, totalAttack: TOUGH })];
    const normal = simulateCelestial({ party, difficulty: 'NORMAL', rolls: scripted() });
    expect(normal).toMatchObject({ won: false, timedOut: true, timeMs: 240000 });
    const hard = simulateCelestial({ party, difficulty: 'HARD', rolls: scripted() });
    expect(hard).toMatchObject({ won: false, timedOut: true, timeMs: 360000 });
  });
});

describe('Gatekeeper\'s Burden', () => {
  it('HARD: each add costs 4 % max HP (clamped on every change), 5 % regen, and adds 10 % damage taken', () => {
    const r = run({ party: [tank({ totalHp: 1e8, totalHpRegen: 10, totalDamageReduction: 20 })], tankIndex: 0 });
    const upd = rows(r, 'burden_update').find((t) => t.burdenStacks === 1);
    expect(upd.timestamp).toBe(10500);
    expect(upd.playerHpsAfter[0]).toBeLessThanOrEqual(96e6);
    const add = rows(r, 'add_attack')[0];
    expect(add.timestamp).toBe(11000);
    const addAtk = celestialAddStats(85, 'HARD').attack;
    expect(add.damage).toBe(Math.round(addAtk * (1 - 20 / 100) * 1.1));
    // regen pulse: round(sheetHp * 10% / 10 * (1 - 0.05 n))
    const before = r.log.filter((t) => t.timestamp < 11100).at(-1).playerHpsAfter[0];
    const pulse = r.log.find((t) => t.type === 'player_regen' && t.timestamp === 11100);
    expect(pulse.playerHpsAfter[0] - before).toBe(Math.min(Math.round(1e6 * 0.95), 96e6 - before));
  });

  it('NORMAL: player attack grows 25 % per living add', () => {
    const r = run({
      difficulty: 'NORMAL', party: [fighter({ totalAttack: 1000 }), tank({ totalHp: 1e12 })], tankIndex: 1,
      tactics: { focus: 'BOSS' },
    });
    const at = (ts) => rows(r, 'player_attack').find((t) => t.playerIndex === 0 && t.timestamp > ts).damage;
    expect(at(1000)).toBe(1000);
    expect(at(20600)).toBe(1250);
  });
});

describe('HARD Block Fury', () => {
  it('+1 per tank block, -0.015 per tick (floored at 0), logged rounded, multiplies every attack', () => {
    let blocked = false;
    const rolls = scripted({ avoid: (p, pct, ts) => { if (!blocked && ts === 1030) { blocked = true; return true; } return false; } });
    const r = run({ party: [fighter({ totalAttack: 100000 }), tank({ totalBlockChance: 50 })], tankIndex: 1, rolls });
    const block = r.log.find((t) => t.type === 'player_block');
    expect(block).toMatchObject({ timestamp: 1030, blockFuryStacks: 1, playerIndex: 1 });
    // 1 - 0.015k rounds to 0 after 34 ticks: 1030 + 340 = 1370
    const after = r.log.filter((t) => t.timestamp > 1030 && t.blockFuryStacks !== undefined);
    expect(after.find((t) => t.timestamp >= 1370).blockFuryStacks).toBe(0);
    expect(after.filter((t) => t.timestamp < 1360).every((t) => t.blockFuryStacks === 1)).toBe(true);
    // the next swing of player 0 (at 1500 ms: 8 ticks of decay later) is round(100000 * (1 + 0.12 * 0.88))
    const hit = rows(r, 'player_attack').find((t) => t.playerIndex === 0 && t.timestamp > 1030);
    const f = 1 - 0.015 * ((hit.timestamp - 1030) / 10);
    expect(hit.damage).toBe(Math.round(100000 * (1 + 0.12 * f)));
  });

  it('avoids by a player who is not the tank pay no Fury', () => {
    const rolls = scripted({ avoid: () => true });
    const r = run({ party: [fighter({ totalMissChance: 50 })], tankIndex: 0, rolls });
    expect(r.log.find((t) => t.type === 'player_block')).toMatchObject({ playerIndex: 0, blockFuryStacks: 1 });
    const solo = run({ party: [fighter({ totalMissChance: 50 }), tank({})], tankIndex: 1, rolls: scripted({ avoid: (p) => p === 0 }) });
    expect(solo.log.every((t) => (t.blockFuryStacks ?? 0) === 0)).toBe(true);
  });
});

describe('Judgment Strike', () => {
  it('every 30 s from 500 ms on the tank, x5.5, unblockable, frozen 990 ms per boss paralysis', () => {
    const r = run({ party: [tank({ totalHp: 1e12, totalBlockChance: 50 })], tankIndex: 0, rolls: scripted({ avoid: () => true }) });
    const js = rows(r, 'judgment_strike');
    expect(js.slice(0, 2).map((t) => t.timestamp)).toEqual([30500, 60500]);
    const n = r.log.filter((t) => t.type === 'burden_update' && t.timestamp <= 30500).at(-1).burdenStacks;
    expect(js[0].damage).toBe(Math.round(266866 * 5.5 * 1 * (1 + 0.1 * n)));
    // one paralysis proc at 5000 ms freezes the timer for 99 ticks
    let done = false;
    const para = run({
      party: [fighter({ totalParalyzeChance: 1 }), tank({ totalHp: 1e12 })], tankIndex: 1,
      rolls: scripted({ paralyze: (p, pct, ts) => (!done && ts >= 5000 ? (done = true) : false) }),
    });
    expect(rows(para, 'judgment_strike')[0].timestamp).toBe(30500 + 990);
    expect(rows(para, 'boss_paralyze').length).toBeGreaterThan(0);
  });
});

describe('Celestial Overload', () => {
  it('starts on the spawn that brings 7 adds (HARD), multiplies only the boss auto-attack by 6', () => {
    const r = run({ party: [tank({ totalHp: 1e13, totalAttack: TOUGH })], tankIndex: 0, tactics: { focus: 'BOSS' } });
    const start = rows(r, 'overload_start')[0];
    expect(start.timestamp).toBe(70500);
    const idx = r.log.indexOf(start);
    expect(r.log.slice(idx - 2, idx).map((t) => t.type)).toEqual(['add_spawn', 'burden_update']);
    const boss = rows(r, 'boss_attack').find((t) => t.timestamp > 70500);
    expect(boss.damage).toBe(Math.round(266866 * 1 * 1 * (1 + 0.1 * 7) * 6));
    const add = rows(r, 'add_attack').find((t) => t.timestamp > 70500);
    expect(add.damage).toBe(Math.round(53373 * (1 + 0.1 * 7)));
    expect(r.overloadMs).toBe(70500);
  });

  it('[assumed] ends when the living adds fall below the threshold; Judgment takes it (both labelled)', () => {
    // holdCount 6: the party kills the 7th add down to 6
    const r = run({ party: [fighter({ totalAttack: 5e7, totalAttackSpeed: 1, totalHp: 1e13 }), tank({ totalHp: 1e13, totalAttack: TOUGH })], tankIndex: 1, tactics: { focus: 'HOLD', holdCount: 6 } });
    const start = rows(r, 'overload_start')[0];
    const end = rows(r, 'overload_end')[0];
    expect(end.timestamp).toBeGreaterThan(start.timestamp);
    expect(r.log.filter((t) => t.timestamp <= end.timestamp && t.type === 'add_death').length).toBeGreaterThan(0);
    const never = run({ party: [tank({ totalHp: 1e13, totalAttack: TOUGH })], tankIndex: 0, tactics: { focus: 'BOSS' } });
    const js = rows(never, 'judgment_strike').find((t) => t.timestamp > 70500);
    const n = 7 + Math.floor((js.timestamp - 70500) / 10000);
    expect(js.damage).toBe(Math.round(266866 * 5.5 * 1 * (1 + 0.1 * Math.min(n, 12)) * 6));
    const off = run({ party: [tank({ totalHp: 1e13, totalAttack: TOUGH })], tankIndex: 0, tactics: { focus: 'BOSS' }, rules: { overloadJudgment: false } });
    expect(rows(off, 'judgment_strike').find((t) => t.timestamp > 70500).damage).toBe(Math.round(js.damage / 6));
    expect(CELESTIAL_ASSUMPTIONS.overloadEnd.text).toMatch(/assumed/);
  });
});

describe('targeting', () => {
  it('HOLD: the oldest living add while more than holdCount live, else the boss; spells stay on the boss', () => {
    const r = run({ party: [fighter({ totalAttack: 1000, totalAttackSpeed: 2 }), tank({ totalHp: 1e13 })], tankIndex: 1, tactics: { focus: 'HOLD', holdCount: 2 } });
    const firstAdd = rows(r, 'player_attack_add')[0];
    expect(firstAdd.timestamp).toBeGreaterThanOrEqual(30500); // the 3rd add
    expect(firstAdd.addId).toBe(1);
    expect(rows(r, 'player_attack').filter((t) => t.timestamp > 30500 && t.timestamp < 40500)).toHaveLength(0);
  });

  it('holdCount is clamped to [1, min(maxAlive, addsThreshold)]', () => {
    expect(celestialMaxHoldCount('HARD')).toBe(7);
    expect(celestialMaxHoldCount('NORMAL')).toBe(5);
  });

  it('the default tank is the member with a tank spec', () => {
    expect(defaultTankIndex([fighter({}), tank({})])).toBe(1);
    expect(defaultTankIndex([tank({}), fighter({})])).toBe(0);
  });

  it('enemies hit the tank; when it dies they retarget the survivor without resetting their timers', () => {
    const r = run({ party: [fighter({ totalHp: 1e12 }), tank({ totalHp: 300000 })], tankIndex: 1, tactics: { focus: 'BOSS' } });
    const death = rows(r, 'player_death')[0];
    expect(death.playerIndex).toBe(1);
    expect(death.playerHpsAfter[1]).toBe(0);
    const before = r.log.filter((t) => t.type === 'boss_attack' && t.timestamp < death.timestamp);
    expect(before.every((t) => t.playerIndex === 1)).toBe(true);
    const after = r.log.filter((t) => t.type === 'boss_attack' && t.timestamp > death.timestamp);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((t) => t.playerIndex === 0)).toBe(true);
    // the boss stays on its 526 ms grid: swing k lands at ceil((500 + 526k) / 10) * 10
    const slots = new Set(Array.from({ length: 800 }, (_, k) => Math.ceil((500 + 526 * k) / 10) * 10));
    expect(after.every((t) => slots.has(t.timestamp))).toBe(true);
    expect(before.every((t) => slots.has(t.timestamp))).toBe(true);
    // no regen, swing or spell from the dead tank
    expect(r.log.some((t) => t.timestamp > death.timestamp && t.playerIndex === 1 && /^player_(attack|crit|regen)/.test(t.type))).toBe(false);
  });

  it('the party loses when the last player dies', () => {
    const r = run({ party: [tank({ totalHp: 200000 })], tankIndex: 0 });
    expect(r).toMatchObject({ won: false, timedOut: false });
    expect(r.timeMs).toBe(rows(r, 'player_death')[0].timestamp);
  });
});

describe('stack player', () => {
  const bulwark = (extra) => tank({ totalHp: 1e9, totalBlockChance: 50 }, {
    sigils: [{ species: 'BULWARK_OF_THORNS', level: 3 }], ...extra,
  });
  it('Bulwark stacks and thorns run only for the stack player', () => {
    const rolls = scripted({ avoid: (p, pct, ts) => (ts / 10) % 2 === 0 });
    const asStack = run({ party: [fighter({}), bulwark()], tankIndex: 1, stackPlayerIndex: 1, rolls });
    expect(Math.max(...asStack.log.map((t) => t.bulwarkStacks ?? 0))).toBeGreaterThan(0);
    expect(rows(asStack, 'thorns_reflect').length).toBeGreaterThan(0);
    const notStack = run({ party: [fighter({}), bulwark()], tankIndex: 1, stackPlayerIndex: 0, rolls });
    expect(notStack.log.every((t) => (t.bulwarkStacks ?? 0) === 0)).toBe(true);
    expect(rows(notStack, 'thorns_reflect')).toHaveLength(0);
  });
});

describe('Monte Carlo rolls', () => {
  it('draw from the injected rng only, and repeat with the seed', () => {
    const party = [fighter({ totalCritChance: 50, totalDoubleHit: 30, totalAttack: 5e6 }), tank({ totalHp: 1e8, totalBlockChance: 40 })];
    const a = simulateCelestial({ party, difficulty: 'NORMAL', rng: laneRng(7), tankIndex: 1 });
    const b = simulateCelestial({ party, difficulty: 'NORMAL', rng: laneRng(7), tankIndex: 1 });
    expect(a).toEqual(b);
    const phases = new Set();
    const r = celestialRolls(laneRng(3));
    for (let i = 0; i < 2000; i++) phases.add(r.addPhase());
    expect(Math.min(...phases)).toBe(10);
    expect(Math.max(...phases)).toBe(1000);
    expect([...phases].every((p) => p % 10 === 0)).toBe(true);
  });

  it('needs an rng or a rolls object', () => {
    expect(() => simulateCelestial({ party: [tank({})], difficulty: 'HARD' })).toThrow(/rng/);
  });
});
