// The Verify tab's entry point (features/verifyLog.js): which fight a server response is, and that each
// kind reaches its own checker with the picked target. The checkers' rules are tested beside them.
import { describe, it, expect } from 'vitest';
import arena from '../__fixtures__/real/arena-fight-warrior.json';
import dungeon from '../__fixtures__/real/dungeon-run-mystic-d4s8.json';
import raid from '../__fixtures__/real/raid-run-mystic-r4s8.json';
import fortress from '../__fixtures__/real/fortress-boss-top-fight.json';
import mystic from '../__fixtures__/real/profile-mystic-l50.json';
import sentinel from '../__fixtures__/real/profile-sentinel-l85-miss.json';
import { normaliseCharacter } from '../model/index.js';
import { gameProfileToCharacter } from '../model/gameProfile.js';
import { buildFighter } from '../build/fighter.js';
import { simulateWorldBoss, worldBossResponseOf } from '../engine/pve/worldBossReplay.js';
import { laneRng } from '../engine/rng.js';
import {
  FIGHT_KINDS, STEP_OPTIONS, detectFightKind, fightLogEvents, fortressGroupOf, describeFight, verifyFightLog, isPveKind,
} from './verifyLog.js';

const fighterOf = (profile) => {
  const c = normaliseCharacter(gameProfileToCharacter(profile));
  return buildFighter(c, c.activePresetId);
};
const statuses = (report) => Object.fromEntries(report.rules.map((r) => [r.rule, r.status]));
const worldBossLog = (affinity) => {
  const attacker = fighterOf(sentinel);
  return { attacker, response: worldBossResponseOf(simulateWorldBoss(attacker, affinity, laneRng(3))) };
};

describe('detectFightKind', () => {
  it('reads each fight from the response\'s own fields', () => {
    expect(detectFightKind(arena)).toBe('arena');
    expect(detectFightKind(dungeon)).toBe('dungeon');
    expect(detectFightKind(raid)).toBe('raid');
    expect(detectFightKind(fortress)).toBe('fortressBoss');
    expect(detectFightKind(worldBossLog('NONE').response)).toBe('worldBoss');
  });

  it('a log with no mob rows is an arena log; anything without a log is not a fight', () => {
    expect(detectFightKind({ ticks: [] })).toBe('arena');
    expect(detectFightKind({ result: { ticks: [{ type: 'attacker_hit' }] } })).toBe('arena');
    for (const x of [null, [], {}, { hello: 1 }, { ticks: 'no' }, { combatLog: 5 }]) expect(detectFightKind(x)).toBeNull();
  });

  it('a raid is told from a dungeon by rows that go back to an earlier mob', () => {
    const row = (mobIndex) => ({ timestamp: 500, type: 'mob_attack', mobIndex });
    expect(detectFightKind({ ticks: [row(0), row(0), row(1)] })).toBe('dungeon');
    expect(detectFightKind({ ticks: [row(0), row(2), row(0)] })).toBe('raid');
    expect(detectFightKind({ ticks: [row(3), row(3)] })).toBe('raid');
  });

  it('a packed log is the World Boss; a row list is the Fortress unless it carries the World Boss totals', () => {
    expect(detectFightKind({ combatLog: { v: 1, types: [], ticks: [] } })).toBe('worldBoss');
    expect(detectFightKind({ combatLog: [], damageDealt: 1 })).toBe('worldBoss');
    expect(detectFightKind({ combatLog: [], rawDamage: 1 })).toBe('fortressBoss');
    expect(detectFightKind({ combatLog: [] })).toBe('fortressBoss');
    expect(detectFightKind({ combatLog: 'AAAA' })).toBeNull();
  });
});

describe('fightLogEvents and fortressGroupOf', () => {
  it('counts the rows of every shape', () => {
    expect(fightLogEvents(arena)).toBe(arena.result.ticks.length);
    expect(fightLogEvents(raid)).toBe(raid.ticks.length);
    expect(fightLogEvents(fortress)).toBe(fortress.combatLog.length);
    expect(fightLogEvents(worldBossLog('NONE').response)).toBeGreaterThan(10);
    expect(fightLogEvents({ combatLog: 5 })).toBe(0);
    expect(fightLogEvents(null)).toBe(0);
  });

  it('names the fortress from the boss the response carries', () => {
    expect(fortressGroupOf(fortress)).toBe('TOP');
    expect(fortressGroupOf({ bossName: 'Core Overlord' })).toBe('CORE');
    expect(fortressGroupOf({ bossName: 'Someone' })).toBeNull();
    expect(fortressGroupOf(dungeon)).toBeNull();
  });
});

describe('describeFight', () => {
  it('says what the check was held against', () => {
    expect(describeFight('arena')).toBe('Arena duel');
    expect(describeFight('dungeon', {})).toBe('Dungeon');
    expect(describeFight('dungeon', { dungeon: 'dungeon_4', step: 8 })).toMatch(/^Dungeon: .+, step 8$/);
    expect(describeFight('raid', { raid: 'raid_4', step: 8 })).toBe('Village Raid: Shadow Enclave, step 8');
    expect(describeFight('worldBoss', { affinity: 'ENRAGED' })).toBe('World Boss (Rising Wrath)');
    expect(describeFight('fortressBoss', { group: 'TOP' })).toBe('Fortress Boss: Fortress Guardian');
    expect(describeFight('fortressBoss', {})).toBe('Fortress Boss');
  });
});

describe('verifyFightLog', () => {
  it('lists the five fights, arena first, and the eight steps', () => {
    expect(FIGHT_KINDS.map((k) => k.id)).toEqual(['arena', 'dungeon', 'raid', 'worldBoss', 'fortressBoss']);
    expect(STEP_OPTIONS.map((o) => o.value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(FIGHT_KINDS.filter((k) => isPveKind(k.id)).map((k) => k.id)).toEqual(['dungeon', 'raid', 'worldBoss', 'fortressBoss']);
  });

  it('dungeon: the real run passes every rule with its sheet and step, and skips the sheet rules without them', () => {
    const full = verifyFightLog(dungeon, { kind: 'dungeon', attacker: fighterOf(mystic), target: { dungeon: 'dungeon_4', step: 8 } });
    expect(full.ok).toBe(true);
    expect(full.rules.filter((r) => r.status !== 'pass')).toEqual([]);
    const bare = verifyFightLog(dungeon, { kind: 'dungeon' });
    expect(bare.ok).toBe(true);
    expect(bare.rules.some((r) => r.status === 'skipped' && r.note)).toBe(true);
  });

  it('a step that is only half picked is not looked up', () => {
    const half = verifyFightLog(dungeon, { kind: 'dungeon', target: { dungeon: 'dungeon_4', step: 0 } });
    expect(statuses(half)).toEqual(statuses(verifyFightLog(dungeon, { kind: 'dungeon' })));
  });

  it('Village Raid: the real log has no failing rule against its step, and the wrong step fails', () => {
    const right = verifyFightLog(raid, { kind: 'raid', target: { raid: 'raid_4', step: 8 } });
    expect(right.ok).toBe(true);
    expect(right.rules.some((r) => r.status === 'pass' && r.checked > 0)).toBe(true);
    const wrong = verifyFightLog(raid, { kind: 'raid', target: { raid: 'raid_1', step: 1 } });
    expect(wrong.ok).toBe(false);
  });

  it('Fortress Boss: the real fight passes with its sheet and group', () => {
    const report = verifyFightLog(fortress, { kind: 'fortressBoss', attacker: fighterOf(sentinel), target: { group: 'TOP' } });
    expect(report.ok).toBe(true);
    expect(report.rules.filter((r) => r.status === 'skipped')).toEqual([]);
  });

  it('World Boss: the app\'s own fight has no failing rule, with and without the sheet', () => {
    for (const affinity of ['NONE', 'FORTIFIED', 'ENRAGED']) {
      const { attacker, response } = worldBossLog(affinity);
      expect(verifyFightLog(response, { kind: 'worldBoss', attacker, target: { affinity } }).ok, affinity).toBe(true);
      const bare = verifyFightLog(response, { kind: 'worldBoss' });
      expect(bare.ok, affinity).toBe(true);
      expect(bare.rules.some((r) => r.status === 'skipped')).toBe(true);
    }
  });

  it('arena: needs both fighters to hold the log to them', () => {
    const report = verifyFightLog(arena, { kind: 'arena' });
    expect(report.rules.length).toBeGreaterThan(3);
    expect(report.rules.some((r) => r.status === 'skipped')).toBe(true);
  });

  it('an unknown fight is refused', () => {
    expect(() => verifyFightLog(arena, { kind: 'campaign' })).toThrow(/unknown fight/);
    expect(() => verifyFightLog(arena)).toThrow(/unknown fight/);
  });
});
