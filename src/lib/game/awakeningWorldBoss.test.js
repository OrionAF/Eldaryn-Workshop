import { describe, it, expect } from 'vitest';
import { AWAKENING_PATHS, AWAKENING_KEYS, AWAKENING_CONSTANTS } from './awakening.js';
import { WORLD_BOSS_AFFINITIES, WORLD_BOSS_CONSTANTS, WORLD_BOSSES, WORLD_BOSS_POSITION_REWARDS, WORLD_BOSS_SEASON } from './worldBoss.js';

describe('awakening catalogue', () => {
  it('has the 17 keys and 15 max points', () => {
    expect(AWAKENING_KEYS).toHaveLength(17);
    expect(AWAKENING_CONSTANTS.maxPoints).toBe(AWAKENING_CONSTANTS.maxPointLevel - AWAKENING_CONSTANTS.firstPointLevel + 1);
  });
  it('every bundle uses known keys', () => {
    const bundles = [];
    for (const p of Object.values(AWAKENING_PATHS)) {
      bundles.push(p.bonusPerLevel);
      for (const o of [...Object.values(p.specOverrides), ...Object.values(p.classOverrides)]) bundles.push(o.bonusPerLevel);
    }
    for (const b of bundles) for (const k of Object.keys(b)) expect(AWAKENING_KEYS).toContain(k);
  });
  it('matches cited values', () => {
    expect(AWAKENING_PATHS.SHADOW.bonusPerLevel.penetrationFlat).toBe(0.6);
    expect(AWAKENING_PATHS.RADIANT.classOverrides.SENTINEL.bonusPerLevel.missChanceFlat).toBe(1);
    expect(AWAKENING_PATHS.SHADOW.specOverrides.MYSTIC_MAGE.bonusPerLevel.spellDamageFlat).toBe(2);
  });
});

describe('world boss catalogue', () => {
  it('has the window and tick', () => {
    expect(WORLD_BOSS_CONSTANTS.fightDurationMs).toBe(60000);
    expect(WORLD_BOSS_CONSTANTS.tickIntervalMs).toBe(100);
    expect(WORLD_BOSS_SEASON.anchorMs).toBe(Date.UTC(2026, 0, 21));
  });
  it('has three affinities and one boss', () => {
    expect(Object.keys(WORLD_BOSS_AFFINITIES)).toEqual(['NONE', 'FORTIFIED', 'ENRAGED']);
    expect(WORLD_BOSS_AFFINITIES.ENRAGED.maxFightDurationMs).toBe(300000);
    expect(Object.values(WORLD_BOSS_AFFINITIES).map((a) => a.name)).toEqual(['Dormant', 'Adamant Scales', 'Rising Wrath']);
    expect(WORLD_BOSSES[0].hp).toBe(2e10);
  });
  it('reward tiers are contiguous', () => {
    const t = WORLD_BOSS_POSITION_REWARDS;
    for (let i = 1; i < t.length; i++) expect(t[i].minPosition).toBe(t[i - 1].maxPosition + 1);
  });
});
