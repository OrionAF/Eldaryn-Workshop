// Combat Power against the server's totalPower on two real profiles (Game/stats.md §8). Each profile is
// imported as the app imports it; the live loadout's preset (the active one, or the appended "Live
// loadout" when the live state differs) must reproduce the server's figure exactly.
import { describe, it, expect } from 'vitest';
import sentinel from './profile-sentinel-l85.json';
import warrior from './profile-warrior-l73.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { presetPower } from '../../build/power.js';
import { computePresetStats } from '../../build/stats.js';

function imported(profile) {
  const report = [];
  const character = normaliseCharacter(gameProfileToCharacter(profile, { report }));
  const live = report.find((r) => r.kind === 'liveLoadout')?.presetId ?? character.activePresetId;
  return { character, live };
}

describe.each([
  ['Sentinel L85', sentinel, 'live-loadout', { equipment: 59593, sigils: 2380, enchants: 6408, transcendence: 5100, pet: 159408, mount: 3300, relics: 1780, talents: 4350, awakening: 5250, level: 3400 }],
  ['Warrior L73', warrior, 'default', { equipment: 19615, sigils: 1340, enchants: 4828, transcendence: 2200, pet: 17712, mount: 1650, relics: 1120, talents: 4350, awakening: 5250, level: 2920 }],
])('real profile %s', (_, profile, liveId, terms) => {
  const { character, live } = imported(profile);

  it('imports its live loadout into the expected preset, whose stats are the server\'s', () => {
    expect(live).toBe(liveId);
    const { computed } = computePresetStats(character, live, { realm: 'base' });
    for (const key of ['totalAttack', 'totalHp']) expect(computed[key], key).toBe(profile.computedStats[key]);
  });

  it(`Combat Power equals the server's totalPower (${profile.totalPower})`, () => {
    const p = presetPower(character, live);
    expect(p.power).toBe(profile.totalPower);
    expect(p.terms).toEqual(terms);
    expect(p.gaps).toEqual([]);
  });
});
