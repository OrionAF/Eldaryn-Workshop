import { describe, it, expect } from 'vitest';
import tinCan from '../__fixtures__/real/leaderboard-warrior-l95-tank.json';
import profile from '../__fixtures__/real/profile-warrior-l72.json';
import { fighterFromLeaderboard, isLeaderboardProfile } from './sheetFighter.js';
import { preparePveFighter } from '../engine/pve/fight.js';

describe('fighterFromLeaderboard', () => {
  it('recognises a leaderboard profile and not a full-state one', () => {
    expect(isLeaderboardProfile(tinCan)).toBe(true);
    expect(isLeaderboardProfile(profile)).toBe(false);
  });

  it('uses the server sheet as is, the worn sigils (Ancient apart), the altar tier and the major glyphs', () => {
    const f = fighterFromLeaderboard(tinCan);
    expect(f.stats).toEqual(tinCan.computedStats);
    expect(f).toMatchObject({ class: 'WARRIOR', spec: 'WARRIOR_TANK', level: 95, altarTier: 3, source: 'sheet' });
    expect(f.ancient).toEqual({ species: 'EARTHWARDEN', level: 1 });
    expect(f.sigils).toEqual([{ species: 'SUNDER_MARK', level: 2 }, { species: 'BULWARK_OF_THORNS', level: 3 }]);
    // two Enduring Brand glyphs: the Epic one sets Sunder's decay to 1.4/s (the L95 log's rate)
    const p = preparePveFighter(f);
    expect(p.inputs.stack.glyph).toEqual({ sunder: { decayPerSecond: 1.4 } });
    expect(p.inputs.spells.map((s) => s.species)).toEqual(['EARTHWARDEN']);
  });
});
