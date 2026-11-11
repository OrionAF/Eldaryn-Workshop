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
import { presetPower, powerInputs } from '../../build/power.js';
import { resolvePreset, equipSetKey } from '../../build/presetInputs.js';
import { calculatePowerBreakdown } from '../../engine/power.js';
import { itemStatLevel, calculateStatQuality } from '../../game/gear.js';
import { computePresetStats } from '../../build/stats.js';
import { withPre294Relics } from './relicsPre294.js'; // the captures predate the 2.9.4 relic tables
import { coreTotalPower } from '../../engine/sources/petCore.js';
import { POWER_TERMS } from '../../engine/power.js';

// The captures predate 2.9.3, whose item quality caps a not-all-100 item at Q99 (gear.md §5.1); the
// server scored them with the earlier rule, the rounded mean of the stat qualities. (The test setup loads
// the app before any module mock could apply, so the inputs are rebuilt here instead.)
function preQ99Power(character, presetId) {
  const { input } = powerInputs(character, presetId);
  const items = Object.values(character.equipment?.[equipSetKey(resolvePreset(character, presetId), 'base')]?.items ?? {});
  const equipment = input.equipment.map((e, i) => {
    const stats = items[i]?.secondaryStats ?? [];
    if (!e || stats.length === 0) return e;
    const L = itemStatLevel(e.itemLevel, e.realm);
    return { ...e, quality: Math.round(stats.reduce((sum, x) => sum + calculateStatQuality(x.type, x.value, L), 0) / stats.length) };
  });
  return calculatePowerBreakdown({ ...input, equipment });
}

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
    const { computed } = withPre294Relics(() => computePresetStats(character, live, { realm: 'base' }));
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

// The first 2.9.1 capture (petV2): every computedStats key must match. Its server pet term is the 2.9.1
// petV2TotalPower (Epic, tier 3, altar 2: 1200 x 185 / 27); 2.9.3 rescored it (pet-cores.md §7), so the
// figure matches with that term swapped in, like the V1 captures above.
describe('real profile Mystic L79 (2.9.1, Pet Cores)', () => {
  const { character, live } = imported(mystic291);

  it('reproduces every server computedStats key for the live preset', () => {
    const { computed } = withPre294Relics(() => computePresetStats(character, live, { realm: 'base' }));
    for (const key of Object.keys(mystic291.computedStats)) {
      expect(Math.abs(computed[key] - mystic291.computedStats[key]), key).toBeLessThanOrEqual(1e-9);
    }
  });

  it(`Combat Power equals the server's totalPower (${mystic291.totalPower}) with the 2.9.1 pet term`, () => {
    const p = presetPower(character, live);
    const old = preQ99Power(character, live);
    const rest = POWER_TERMS.filter((k) => k !== 'pet').reduce((s, k) => s + old.exact[k], 0);
    expect(Math.round(rest + (1200 * 185) / 27)).toBe(mystic291.totalPower);
    expect(p.terms.pet).toBe(2432);
    expect(p.gaps).toEqual([]);
  });

  it('a preset with no petV2CoreId follows the active core', () => {
    expect(character.presets.map((x) => x.petId)).toEqual([mystic291.petV2.activeCoreId, mystic291.petV2.activeCoreId]);
  });
});
