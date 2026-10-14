import { describe, it, expect } from 'vitest';
import { calculateTalentBonuses, ZERO_BONUS_KEYS } from './talents.js';
import { TALENT_SPECS, TALENT_SPEC_KEYS } from '../../game/talents.js';

const nz = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0));

describe('calculateTalentBonuses', () => {
  it('zero bundle has 26 keys for no spec / no allocation', () => {
    expect(Object.keys(calculateTalentBonuses(null, {}))).toHaveLength(26);
    expect(nz(calculateTalentBonuses('WARRIOR_TANK', {}))).toEqual({});
    expect(nz(calculateTalentBonuses('WARRIOR_TANK', undefined))).toEqual({});
  });
  it('sums valuePerRank * ranks (Warrior tank tier 1)', () => {
    const r = calculateTalentBonuses('WARRIOR_TANK', { tank_t1_fortitude: 5, tank_t1_thick_skin: 3, tank_t1_vitality: 2 });
    expect(nz(r)).toEqual({ hpPercent: 10, damageReductionFlat: 3, hpRegenFlat: 1 });
  });
  it('adds secondary bonuses (Druid, Deathlord)', () => {
    expect(nz(calculateTalentBonuses('MYSTIC_DRUID', { druid_t6_heart_of_the_great_bear: 2 }))).toEqual({
      hpPercent: 6, damageReductionFlat: 2,
    });
    expect(nz(calculateTalentBonuses('MYSTIC_DRUID', { druid_t6_fury_of_the_dire_wolf: 3 }))).toEqual({
      attackPercent: 9, attackSpeedFlat: 0.06,
    });
    expect(nz(calculateTalentBonuses('NECROMANCER_DEATHLORD', { death_t6_undying_bulwark: 3 }))).toEqual({
      minionHealthPercent: 12, minionLifestealFlat: 1.5,
    });
  });
  it('ignores ids from other specs and zero ranks', () => {
    expect(nz(calculateTalentBonuses('WARRIOR_DPS', { tank_t1_fortitude: 5, x: 3 }))).toEqual({});
  });
  it('every stat in the catalogue is in the zero template', () => {
    for (const k of TALENT_SPEC_KEYS)
      for (const tier of TALENT_SPECS[k].tiers)
        for (const t of tier.talents) {
          expect(ZERO_BONUS_KEYS).toContain(t.bonusPerRank.stat);
          if (t.secondaryBonusPerRank) expect(ZERO_BONUS_KEYS).toContain(t.secondaryBonusPerRank.stat);
        }
  });
});
