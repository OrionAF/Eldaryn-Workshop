// Golden tests on real server captures (stripped fixtures in this folder).
//  (a) profile-warrior-l72.json: import it and recompute the active preset; every one of the server's
//      computedStats keys must match exactly (Game/stats.md, Game/mounts-glyphs.md §8).
//  (b) arena-fight-warrior.json: the replay check must find no mismatch (engine/pvp/replayCheck.js).
import { describe, it, expect } from 'vitest';
import profile from './profile-warrior-l72.json';
import fight from './arena-fight-warrior.json';
import { normaliseCharacter } from '../../model/index.js';
import { isGameProfile, gameProfileToCharacter } from '../../model/gameProfile.js';
import { computePresetStats } from '../../build/stats.js';
import { replayCheck } from '../../engine/pvp/replayCheck.js';

describe('real profile capture (Warrior L72)', () => {
  it('is recognised as a game profile', () => {
    expect(isGameProfile(profile)).toBe(true);
  });

  it('reproduces every server computedStats key for the active preset', () => {
    const character = normaliseCharacter(gameProfileToCharacter(profile));
    const { computed } = computePresetStats(character, character.activePresetId, { realm: 'base' });
    const keys = Object.keys(profile.computedStats);
    expect(keys).toHaveLength(35);
    for (const key of keys) {
      expect(Math.abs(computed[key] - profile.computedStats[key]), key).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('real arena fight capture (Warrior)', () => {
  const rule = (report, name) => report.rules.find((r) => r.rule === name);
  // the attacker is the profile's character: its server computedStats are the sheet the fight used
  const attacker = {
    class: 'WARRIOR', spec: 'WARRIOR_TANK', stats: profile.computedStats,
    sigils: ['IRON_BASTION', 'WARBORN_FURY'].map((species) => ({ species, level: 5 })),
  };

  it('passes the replay check with no mismatch; without a sheet the schedules are reported skipped', () => {
    const report = replayCheck(fight);
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
    const status = Object.fromEntries(report.rules.map((r) => [r.rule, r.status]));
    for (const name of ['shape', 'terminal', 'max-hp', 'hp-chain']) expect(status[name], name).toBe('pass');
    // spells and stacks are on the field: the grid held, but no schedule was compared
    for (const name of ['opening', 'swing-times', 'regen', 'spell-casts', 'hit-sizes']) expect(status[name], name).toBe('skipped');
  });

  it('with the attacker\'s computedStats alone: the 562 ms swing schedule and the 57 376 / 22 950 regen pulses are compared', () => {
    const report = replayCheck(fight, { attacker });
    expect(report.mismatches).toEqual([]);
    expect(report.ok).toBe(true);
    const swings = rule(report, 'swing-times');
    expect(swings.status).toBe('pass');
    expect(swings.checked).toBe(2); // the 10 ms grid, then the attacker's whole schedule
    const regen = rule(report, 'regen');
    expect(regen.status).toBe('pass');
    expect(regen.checked).toBeGreaterThan(100);
    const pulses = new Set(fight.result.ticks.filter((e) => e.type === 'attacker_regen').map((e) => e.damage));
    expect(pulses.has(57376)).toBe(true);
    expect(pulses.has(22950)).toBe(true);
  });

  it('a shifted swing clock or a wrong regen pulse now fails (it used to pass on the grid alone)', () => {
    const shifted = JSON.parse(JSON.stringify(fight));
    for (const e of shifted.result.ticks) if (e.type === 'defender_block' || e.type === 'attacker_hit') e.timestamp += 10;
    shifted.result.ticks.sort((x, y) => x.timestamp - y.timestamp);
    expect(rule(replayCheck(shifted, { attacker }), 'swing-times').status).toBe('fail');
    const wrong = replayCheck(fight, { attacker: { ...attacker, stats: { ...profile.computedStats, totalHpRegen: 10 } } });
    expect(rule(wrong, 'regen').status).toBe('fail');
  });
});
