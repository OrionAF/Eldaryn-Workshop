import { describe, it, expect } from 'vitest';
import {
  calculateFortressBonuses, getFortressBuffCombatForClass, remapFortressBonusesForClass,
  calculateStarXpBonusPercent, calculateFortressNonCombatBonuses, emptyFortressBonuses,
} from './fortress.js';
import { FORTRESS_BUFFS } from '../../game/fortress.js';

const bottom = (cls, ids = ['BOTTOM_1']) => calculateFortressBonuses(ids, cls);
const nonZero = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0));

describe('calculateFortressBonuses (L1222325-1222567)', () => {
  it('empty or unknown ids give zeros', () => {
    expect(calculateFortressBonuses([])).toEqual(emptyFortressBonuses());
    expect(calculateFortressBonuses(['NOPE'])).toEqual(emptyFortressBonuses());
  });

  it('TOP (class independent): attack 5, speed 0.03, crit 3, pen 3, pvp attack 15', () => {
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      expect(nonZero(calculateFortressBonuses(['TOP_1'], cls))).toEqual({
        attackPercent: 5, attackSpeed: 0.03, critChance: 3, penetration: 3, pvpAttack: 15,
      });
    }
  });

  it('BOTTOM remap, Warrior: hp 5, regen 3, DR 5, block 3, pvp def 15 (default class)', () => {
    expect(nonZero(calculateFortressBonuses(['BOTTOM_1']))).toEqual({
      hpPercent: 5, hpRegen: 3, damageReduction: 5, blockChance: 3, pvpDefense: 15,
    });
  });

  it('BOTTOM remap, Sentinel: DR -> miss 5, block -> blind 3, no DR or block (L1222835)', () => {
    expect(nonZero(bottom('SENTINEL'))).toEqual({
      hpPercent: 5, hpRegen: 3, missChance: 5, blindChance: 3, pvpDefense: 15,
    });
  });

  it('BOTTOM remap, Mystic: lifesteal 5, hpRegen 3+3', () => {
    expect(nonZero(bottom('MYSTIC'))).toEqual({
      hpPercent: 5, hpRegen: 6, lifesteal: 5, pvpDefense: 15,
    });
  });

  it('BOTTOM remap, Necromancer: hpPercent 5+5, hpRegen 3+3', () => {
    expect(nonZero(bottom('NECROMANCER'))).toEqual({ hpPercent: 10, hpRegen: 6, pvpDefense: 15 });
  });

  it('each group counts once: both TOP fortresses do not double the buff (sum over groups)', () => {
    expect(calculateFortressBonuses(['TOP_1', 'TOP_2']).attackPercent).toBe(5);
    const all = calculateFortressBonuses(['TOP_1', 'TOP_2', 'BOTTOM_2', 'CORE'], 'WARRIOR');
    expect(all.attackPercent).toBe(5);
    expect(all.hpPercent).toBe(5);
    expect(all.pvpAttack).toBe(15 + 25);
    expect(all.pvpDefense).toBe(15 + 25);
  });

  it('CORE gives only PVP ratings (25/25)', () => {
    expect(nonZero(calculateFortressBonuses(['CORE'], 'MYSTIC'))).toEqual({ pvpAttack: 25, pvpDefense: 25 });
  });

  it('does not mutate the shared buff table', () => {
    const before = JSON.stringify(FORTRESS_BUFFS);
    calculateFortressBonuses(['BOTTOM_1'], 'NECROMANCER');
    expect(JSON.stringify(FORTRESS_BUFFS)).toBe(before);
  });
});

describe('getFortressBuffCombatForClass (L1222835-1222947)', () => {
  it('a class without a remap gets the input back', () => {
    const c = FORTRESS_BUFFS.BOTTOM.combat;
    expect(getFortressBuffCombatForClass(c, 'WARRIOR')).toBe(c);
    expect(getFortressBuffCombatForClass(c)).toBe(c);
  });

  it('adds onto an existing destination and deletes the source key', () => {
    const out = getFortressBuffCombatForClass({ damageReduction: 5, blockChance: 3, hpRegen: 3 }, 'MYSTIC');
    expect(out).toEqual({ lifesteal: 5, hpRegen: 6 });
  });

  it('a zero source stays put (value 0 is not moved)', () => {
    const out = getFortressBuffCombatForClass({ damageReduction: 0, attackPercent: 5 }, 'SENTINEL');
    expect(out).toEqual({ damageReduction: 0, attackPercent: 5 });
  });
});

describe('remapFortressBonusesForClass (L1222568-1222660)', () => {
  const sum = { ...emptyFortressBonuses(), hpPercent: 5, hpRegen: 3, damageReduction: 5, blockChance: 3 };

  it('Warrior and unknown classes are returned unchanged', () => {
    expect(remapFortressBonusesForClass(sum, 'WARRIOR')).toBe(sum);
  });

  it('nothing to remap returns the input', () => {
    const none = emptyFortressBonuses();
    expect(remapFortressBonusesForClass(none, 'SENTINEL')).toBe(none);
  });

  it('matches the pre-sum remap for every class', () => {
    for (const cls of ['SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      expect(remapFortressBonusesForClass(calculateFortressBonuses(['BOTTOM_1'], 'WARRIOR'), cls))
        .toEqual(calculateFortressBonuses(['BOTTOM_1'], cls));
    }
  });
});

describe('non-combat bonuses (L1222661-1222805, L1224454-1224469)', () => {
  it('star XP is max(0, floor(stars)) * 4', () => {
    expect(calculateStarXpBonusPercent(0)).toBe(0);
    expect(calculateStarXpBonusPercent(3)).toBe(12);
    expect(calculateStarXpBonusPercent(2.9)).toBe(8);
    expect(calculateStarXpBonusPercent(-2)).toBe(0);
  });

  it('group bonus once per group; star XP per owned fortress when stars are given', () => {
    expect(calculateFortressNonCombatBonuses(['TOP_1', 'TOP_2', 'CORE'])).toEqual({
      xpIncomePercent: 5 + 10, bonusCrusadeSeals: 2, bonusRaidKeys: 1,
    });
    const withStars = calculateFortressNonCombatBonuses(['TOP_1', 'TOP_2'], { TOP_1: 2, TOP_2: 5 });
    expect(withStars.xpIncomePercent).toBe(5 + 8 + 20);
  });

  it('empty list gives zeros', () => {
    expect(calculateFortressNonCombatBonuses([])).toEqual({ xpIncomePercent: 0, bonusCrusadeSeals: 0, bonusRaidKeys: 0 });
  });
});
