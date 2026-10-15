import { describe, it, expect } from 'vitest';
import { mapTickType, mapFightTicks, dungeonResponseOf, dungeonReplayCheck, DUNGEON_REPLAY_RULES } from './dungeonReplay.js';

describe('mapTickType (L1670711-1670925)', () => {
  it('names the engine events the way the dungeon log does', () => {
    expect(mapTickType('attacker_hit')).toBe('player_attack');
    expect(mapTickType('attacker_crit')).toBe('player_crit');
    expect(mapTickType('attacker_regen')).toBe('player_regen');
    expect(mapTickType('defender_hit')).toBe('mob_attack');
    expect(mapTickType('defender_block')).toBe('mob_block');
    expect(mapTickType('defender_miss')).toBe('mob_block');
    expect(mapTickType('attacker_block')).toBe('player_block');
    expect(mapTickType('attacker_miss')).toBe('player_miss');
    expect(mapTickType('defender_blinded')).toBe('mob_blinded');
    expect(mapTickType('defender_blind')).toBe('mob_blind');
    expect(mapTickType('attacker_dead')).toBe('player_death');
    expect(mapTickType('defender_dead')).toBe('mob_death');
    expect(mapTickType('spell_dot_tick')).toBe('spell_dot_tick');
    expect(mapTickType('thorns_reflect')).toBe('thorns_reflect');
    expect(mapTickType('minion_hit')).toBe('minion_hit');
    expect(mapTickType('no_such_event')).toBeUndefined();
  });
});

describe('mapFightTicks and dungeonResponseOf', () => {
  it('copies the fields the client copies and renames the HP and shield fields', () => {
    const [r] = mapFightTicks([{ timestamp: 10, type: 'attacker_crit', damage: 5, attackerHp: 9, defenderHp: 3, attackerShieldHp: 4, isCrit: true, doubleHit: false }], 2);
    expect(r).toEqual({ timestamp: 10, type: 'player_crit', damage: 5, playerHpAfter: 9, mobHpAfter: 3, mobIndex: 2, isCrit: true, playerShieldHp: 4 });
  });

  it('splits a run\'s log into mobs at each defender_dead', () => {
    const log = [
      { timestamp: 510, type: 'attacker_hit', damage: 1, attackerHp: 5, defenderHp: 0 },
      { timestamp: 510, type: 'defender_dead', damage: 0, attackerHp: 5, defenderHp: 0 },
      { timestamp: 1020, type: 'defender_hit', damage: 5, attackerHp: 0, defenderHp: 7 },
      { timestamp: 1020, type: 'attacker_dead', damage: 0, attackerHp: 0, defenderHp: 7 },
    ];
    const r = dungeonResponseOf({ won: false, timeMs: 1020, mobsDefeated: 1, hpLeft: 0, log }).result;
    expect(r.ticks.map((e) => [e.type, e.mobIndex])).toEqual([['player_attack', 0], ['mob_death', 0], ['mob_attack', 1], ['player_death', 1]]);
    expect(r).toMatchObject({ success: false, totalDuration: 1020, mobsDefeated: 1, playerHpRemaining: 0 });
    expect(r.playerShieldMax).toBeUndefined();
  });
});

describe('dungeonReplayCheck without a sheet', () => {
  it('a malformed result fails shape and skips every other rule', () => {
    const report = dungeonReplayCheck({ result: { ticks: 'x' } });
    expect(report.ok).toBe(false);
    expect(report.rules.map((r) => r.rule)).toEqual([...DUNGEON_REPLAY_RULES]);
    expect(report.rules.filter((r) => r.status === 'skipped')).toHaveLength(DUNGEON_REPLAY_RULES.length - 1);
  });

  it('holds a tiny log to its own grid, outcome and transitions', () => {
    const row = (timestamp, type, mobIndex, mobHpAfter, extra = {}) => ({ timestamp, type, damage: 0, playerHpAfter: 10, mobHpAfter, mobIndex, ...extra });
    const res = {
      success: true, mobsDefeated: 2, totalDuration: 1520, playerHpRemaining: 10,
      ticks: [row(510, 'player_attack', 0, 0, { damage: 4 }), row(510, 'mob_death', 0, 0), row(1020, 'player_attack', 1, 0, { damage: 4 }), row(1020, 'mob_death', 1, 0)],
    };
    // the second fight starts at 510 + 500 = 1010, so its first tick is 1020, and the log ends there
    res.totalDuration = 1020;
    const ok = dungeonReplayCheck(res);
    expect(ok.mismatches).toEqual([]);
    const early = structuredClone(res);
    early.ticks[2].timestamp = early.ticks[3].timestamp = 1005;
    early.totalDuration = 1005;
    const bad = dungeonReplayCheck(early);
    expect(bad.rules.find((r) => r.rule === 'tick-grid').status).toBe('fail');
    expect(bad.rules.find((r) => r.rule === 'transitions').status).toBe('fail');
  });
});
