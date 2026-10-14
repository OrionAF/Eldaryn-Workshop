import { describe, it, expect } from 'vitest';
import raw from '../../data/game/talents.json';
import {
  TALENT_SPEC_KEYS,
  talentSpec,
  talentSpecsForClass,
  talentTiers,
  talentById,
  tierPointsRequired,
  TALENT_CONSTANTS,
} from './talents.js';

describe('talent trees (talents.md §1, §5)', () => {
  it('has eight specs, two per class', () => {
    expect(TALENT_SPEC_KEYS).toHaveLength(8);
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      expect(talentSpecsForClass(cls)).toHaveLength(2);
    }
  });

  it('returns the JSON tiers for a spec, with the tier count from the JSON', () => {
    const key = TALENT_SPEC_KEYS[0];
    expect(talentTiers(key)).toEqual(raw.specs[key].tiers);
    expect(talentTiers(key)).toHaveLength(raw.specs[key].tiers.length);
    expect(talentSpec('NOPE')).toBeNull();
    expect(talentTiers('NOPE')).toEqual([]);
  });

  it('finds a talent by id across specs', () => {
    const first = raw.specs[TALENT_SPEC_KEYS[0]].tiers[0].talents[0];
    const hit = talentById(first.id);
    expect(hit).toMatchObject({ id: first.id, name: first.name, specKey: TALENT_SPEC_KEYS[0], tier: 1 });
    expect(talentById('nope')).toBeNull();
  });
});

describe('tier gating and constants (talents.md §2, §4)', () => {
  it('reads tier thresholds from the JSON', () => {
    const thresholds = TALENT_CONSTANTS.tierThresholds;
    thresholds.forEach((value, i) => expect(tierPointsRequired(i + 1)).toBe(value));
    expect(tierPointsRequired(thresholds.length + 1)).toBeNull();
  });

  it('matches each spec tier pointsRequired to the threshold list', () => {
    for (const key of TALENT_SPEC_KEYS) {
      for (const tier of talentTiers(key)) {
        expect(tier.pointsRequired).toBe(tierPointsRequired(tier.tier));
      }
    }
  });
});
