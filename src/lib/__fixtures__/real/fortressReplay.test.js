// Replay check of a real Fortress boss fight (backlog §15) against the app's Fortress fight rules
// (engine/pve/fortressBoss.js, Game/clan-fortress.md §1.4). The attacker comes through the app's own
// import and build path, as real.test.js does for the arena capture.
import { describe, it, expect } from 'vitest';
import profile from './profile-sentinel-l85-miss.json';
import fight from './fortress-boss-top-fight.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { buildFighter } from '../../build/fighter.js';
import { fortressReplayCheck, FORTRESS_REPLAY_RULES } from '../../engine/pve/fortressReplay.js';

const c = normaliseCharacter(gameProfileToCharacter(profile));
const attacker = buildFighter(c, c.activePresetId);
const check = (log, opts = {}) => fortressReplayCheck(log, { attacker, group: 'TOP', ...opts });
const rule = (report, name) => report.rules.find((r) => r.rule === name);
const clone = () => JSON.parse(JSON.stringify(fight));

describe('real Fortress boss fight (TOP, Sentinel L85)', () => {
  it('the attacker is the sheet the fight used', () => {
    expect(attacker.stats.totalAttack).toBe(2280378);
    expect(attacker.stats.totalHp).toBe(2757745);
    expect(attacker.sigils.map((s) => s.species)).toEqual(['ELUSIVE_SUPREMACY', 'BLINDING_MARK', 'MIST_VEIL']);
  });

  it('passes every rule, each with substantive checks; none is skipped', () => {
    const report = check(fight);
    expect(report.mismatches).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.rules.map((r) => r.rule)).toEqual([...FORTRESS_REPLAY_RULES]);
    for (const r of report.rules) {
      expect(r.status, `${r.rule}: ${r.note ?? ''}`).toBe('pass');
      expect(r.checked, r.rule).toBeGreaterThan(0);
    }
    expect(rule(report, 'player-swings').checked).toBeGreaterThanOrEqual(171);
    expect(rule(report, 'boss-swings').checked).toBeGreaterThanOrEqual(60);
    expect(rule(report, 'hit-sizes').checked).toBeGreaterThanOrEqual(209 + 25);
  });

  it('without the attacker the sheet rules report skipped with a reason, never a pass', () => {
    const report = fortressReplayCheck(fight, { group: 'TOP' });
    expect(report.ok).toBe(true);
    for (const name of ['player-swings', 'hit-sizes', 'spell-casts', 'max-hp', 'regen', 'stack-sigils']) {
      expect(rule(report, name).status, name).toBe('skipped');
      expect(rule(report, name).note, name).toMatch(/\w/);
    }
  });

  it('a shifted player swing, a boss swing off the 1 s clock, an Elusive-sized hit, an off-range boss hit, an x8 HP or a late time_up fails', () => {
    const shifted = clone();
    shifted.combatLog.find((e) => e.type === 'attacker_crit' && e.timestamp > 20000).timestamp += 10;
    shifted.combatLog.sort((a, b) => a.timestamp - b.timestamp);
    expect(rule(check(shifted), 'player-swings').status).toBe('fail');

    const boss = clone();
    boss.combatLog.find((e) => e.type === 'defender_hit').timestamp += 10;
    boss.combatLog.sort((a, b) => a.timestamp - b.timestamp);
    expect(rule(check(boss), 'boss-swings').status).toBe('fail');

    const stacked = clone();
    stacked.combatLog.find((e) => e.type === 'attacker_hit' && e.timestamp > 30000).damage = Math.round(2280378 * 1.054);
    expect(rule(check(stacked), 'hit-sizes').status).toBe('fail');
    expect(rule(check(stacked), 'stack-sigils').status).toBe('fail');

    const hard = clone();
    hard.combatLog.find((e) => e.type === 'defender_hit').damage = 600;
    expect(rule(check(hard), 'hit-sizes').status).toBe('fail');

    const x8 = clone();
    for (const e of x8.combatLog) e.attackerHpAfter += 2757745 * 7;
    expect(rule(check(x8), 'max-hp').status).toBe('fail');

    const late = clone();
    late.combatLog.at(-1).timestamp = 60010;
    expect(rule(check(late), 'terminal').status).toBe('fail');
  });

  it('a blinded boss swing or a cast off the cooldown fails', () => {
    const blind = clone();
    const i = blind.combatLog.findIndex((e) => e.type === 'attacker_miss');
    blind.combatLog[i] = { ...blind.combatLog[i], type: 'defender_blind' };
    expect(rule(check(blind), 'boss-swings').status).toBe('fail');

    const early = clone();
    for (const e of early.combatLog) if (e.timestamp === 12010 && e.type.startsWith('attacker_spell')) e.timestamp = 11010;
    early.combatLog.sort((a, b) => a.timestamp - b.timestamp);
    expect(rule(check(early), 'spell-casts').status).toBe('fail');
  });
});
