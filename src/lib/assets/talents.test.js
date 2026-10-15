import { describe, it, expect } from 'vitest';
import { talentImage } from './talents.js';
import { TALENT_SPEC_KEYS, talentTiers } from '../game/talents.js';

// Coverage fence like assets.test.js: a renamed talent or dropped file fails here, not as a blank tile.
describe('talent art', () => {
  it('every talent of every tree that has art resolves to an image', () => {
    const missing = [];
    for (const key of TALENT_SPEC_KEYS.filter((k) => !k.startsWith('NECROMANCER'))) {
      for (const tier of talentTiers(key)) for (const t of tier.talents) if (!talentImage(key, t.name)) missing.push(`${key}/${t.name}`);
    }
    expect(missing).toEqual([]);
  });

  it('handles apostrophes in names', () => {
    expect(talentImage('WARRIOR_TANK', "Guardian's Might")).toBeTruthy();
    expect(talentImage('SENTINEL_MARKSMANSHIP', "Hunter's Drain")).toBeTruthy();
  });

  it('returns null, not a throw, for trees without art and for unknown input', () => {
    expect(talentImage('NECROMANCER_DEATHLORD', 'Anything')).toBeNull();
    expect(talentImage('WARRIOR_DPS', 'No Such Talent')).toBeNull();
    expect(talentImage(null, 'x')).toBeNull();
    expect(talentImage('WARRIOR_DPS', '')).toBeNull();
  });
});
