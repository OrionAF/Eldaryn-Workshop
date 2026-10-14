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
  it('passes the replay check with no mismatch', () => {
    const report = replayCheck(fight);
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
    const status = Object.fromEntries(report.rules.map((r) => [r.rule, r.status]));
    for (const rule of ['shape', 'terminal', 'max-hp', 'swing-times', 'regen', 'hp-chain']) expect(status[rule], rule).toBe('pass');
    for (const rule of ['opening', 'spell-casts', 'hit-sizes']) expect(status[rule], rule).toBe('skipped');
  });
});
