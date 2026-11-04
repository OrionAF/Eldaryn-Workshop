// Combat Power against the server's totalPower on two real profiles (Game/stats.md §8). Each profile is
// imported as the app imports it; the live loadout is applied to the profile's selected preset, which must reproduce the server's figure exactly.
// Both captures predate 2.9.1, so the server's pet term is the V1 one (`v1Pet`); the app now scores the
// converted core with petV2TotalPower, and every other term must still match the server.
import { describe, it, expect } from 'vitest';
import sentinel from './profile-sentinel-l85.json';
import warrior from './profile-warrior-l73.json';
import mystic291 from './profile-mystic-l79-291.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { presetPower } from '../../build/power.js';
import { computePresetStats } from '../../build/stats.js';
import { coreTotalPower } from '../../engine/sources/petCore.js';
import { POWER_TERMS } from '../../engine/power.js';

function imported(profile) {
  const report = [];
  const character = normaliseCharacter(gameProfileToCharacter(profile, { report }));
  const live = report.find((r) => r.kind === 'liveLoadout')?.presetId ?? character.activePresetId;
  return { character, live };
}

describe.each([
  ['Sentinel L85', sentinel, 159408, { equipment: 59593, sigils: 2380, enchants: 6408, transcendence: 5100, mount: 3300, relics: 1780, talents: 4350, awakening: 5250, level: 3400 }],
  ['Warrior L73', warrior, 17712, { equipment: 19615, sigils: 1340, enchants: 4828, transcendence: 2200, mount: 1650, relics: 1120, talents: 4350, awakening: 5250, level: 2920 }],
])('real profile %s', (_, profile, v1Pet, terms) => {
  const { character, live } = imported(profile);

  it('imports its live loadout into the expected preset, whose stats are the server\'s', () => {
    expect(character.presets.some((x) => x.id === live)).toBe(true);
    const { computed } = computePresetStats(character, live, { realm: 'base' });
    for (const key of ['totalAttack', 'totalHp']) expect(computed[key], key).toBe(profile.computedStats[key]);
  });

  it(`Combat Power equals the server's totalPower (${profile.totalPower}) with the V1 pet term`, () => {
    const p = presetPower(character, live);
    const rest = POWER_TERMS.filter((k) => k !== 'pet').reduce((s, k) => s + p.exact[k], 0);
    expect(Math.round(rest + v1Pet)).toBe(profile.totalPower);
    const core = character.pets.cores.find((c) => c.id === character.presets.find((x) => x.id === live).petId);
    expect(p.exact.pet).toBe(coreTotalPower(core.rarity.toUpperCase(), character.pets.altar.level, character.pets.altar.tier));
    expect(p.terms).toEqual({ ...terms, pet: Math.round(p.exact.pet) });
    expect(p.gaps).toEqual([]);
  });
});

// The first 2.9.1 capture (petV2): the server's pet term is the core's, so the whole figure and every
// computedStats key must match with no V1 correction.
describe('real profile Mystic L79 (2.9.1, Pet Cores)', () => {
  const { character, live } = imported(mystic291);

  it('reproduces every server computedStats key for the live preset', () => {
    const { computed } = computePresetStats(character, live, { realm: 'base' });
    for (const key of Object.keys(mystic291.computedStats)) {
      expect(Math.abs(computed[key] - mystic291.computedStats[key]), key).toBeLessThanOrEqual(1e-9);
    }
  });

  it(`Combat Power equals the server's totalPower (${mystic291.totalPower})`, () => {
    const p = presetPower(character, live);
    expect(Math.round(POWER_TERMS.reduce((s, k) => s + p.exact[k], 0))).toBe(mystic291.totalPower);
    expect(p.terms.pet).toBe(8222);
    expect(p.gaps).toEqual([]);
  });

  it('a preset with no petV2CoreId follows the active core', () => {
    expect(character.presets.map((x) => x.petId)).toEqual([mystic291.petV2.activeCoreId, mystic291.petV2.activeCoreId]);
  });
});
