import { describe, it, expect } from 'vitest';
import { calculatePetBonuses, altarProgress, tierStatMultiplier, petSecondaryValue, emptyPetBonuses } from './pet.js';
import { calculateStoneBonuses, oblivionPowerForQuality, amplifyStatMultiplier } from './stones.js';
import { calculateMountBonuses, glyphSecondaryValue, mountEffectiveStats } from './mount.js';
import { calculateRelicBonuses, relicStatAt } from './relic.js';
import { PET_ALTAR_TOTAL_XP_TO_MAX } from '../../game/pets.js';
import { AMPLIFY_TABLE, OBLIVION_GRADES } from '../../game/stones.js';
import { relicsForClass } from '../../game/relics.js';

describe('pet source', () => {
  it('tier multiplier is t^2 - t + 1', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(tierStatMultiplier)).toEqual([1, 3, 7, 13, 21, 31, 43, 57]);
  });
  it('altar level from XP matches the catalogue totals', () => {
    expect(altarProgress(0, 1).level).toBe(1);
    expect(altarProgress(175, 1).level).toBe(2);
    expect(altarProgress(174, 1).level).toBe(1);
    for (const [tier, total] of Object.entries(PET_ALTAR_TOTAL_XP_TO_MAX)) {
      expect(altarProgress(total, Number(tier)).level).toBe(50);
      expect(altarProgress(total - 1, Number(tier)).level).toBe(49);
    }
  });
  it('Flame Toad at altar 50: flat stats floor, secondaries scale x1.98', () => {
    const b = calculatePetBonuses({
      species: 'FLAME_TOAD', altarLevel: 50, tier: 1,
      secondaryStats: [{ type: 'CRIT_CHANCE', value: 3.5 }, { type: 'PVP_ATTACK', value: 9 }],
    });
    expect(b.flatAttack).toBe(531); // 120 * 4.43
    expect(b.flatHp).toBe(3101); // 700 * 4.43
    expect(b.critChance).toBe(6.93);
    expect(b).not.toHaveProperty('pvpAttack');
    expect(calculatePetBonuses({ species: 'FLAME_TOAD', altarLevel: 50, tier: 3 }).flatAttack).toBe(3721);
  });
  it('derives level from altar and returns zeros for no pet or unknown species', () => {
    const a = calculatePetBonuses({ species: 'FLAME_TOAD', altar: { totalXp: 175, tier: 1 } });
    expect(a.flatAttack).toBe(Math.floor(120 * 1.07));
    expect(calculatePetBonuses(null)).toEqual(emptyPetBonuses());
    expect(calculatePetBonuses({ species: 'NOPE', altarLevel: 5 })).toEqual(emptyPetBonuses());
  });
  it('petSecondaryValue rounds to 2 dp', () => {
    expect(petSecondaryValue(0.07, 3)).toBe(0.07 * 1.04 > 0 ? parseFloat((0.07 * 1.04).toFixed(2)) : 0);
  });
});

describe('stones source', () => {
  it('amplify multiplier matches the catalogue ladder', () => {
    for (const r of AMPLIFY_TABLE) expect(amplifyStatMultiplier(r.targetLevel)).toBeCloseTo(r.statMultiplier, 9);
  });
  it('sums stats additively with amplify', () => {
    const b = calculateStoneBonuses([
      { type: 'PVE_ATTACK', amplifyLevel: 5, stats: [{ type: 'CRIT_CHANCE', value: 1 }, { type: 'PVP_ATTACK', value: 10 }] },
      { type: 'PVP', amplifyLevel: 0, stats: [{ type: 'CRIT_CHANCE', value: 0.5 }, { type: 'PVP_DEFENSE', value: 12 }] },
      { type: 'PVE_ATTACK', activated: false, amplifyLevel: 0, stats: [{ type: 'CRIT_CHANCE', value: 99 }] },
    ]);
    expect(b.critChance).toBeCloseTo(1.8, 9);
    expect(b.pvpAttack).toBeCloseTo(13, 9);
    expect(b.pvpDefense).toBe(12);
  });
  it('skips every falsy activated flag, not only false (L1205747)', () => {
    const stat = [{ type: 'CRIT_CHANCE', value: 5 }];
    const b = calculateStoneBonuses([
      { type: 'PVE_ATTACK', activated: null, stats: stat },
      { type: 'PVE_ATTACK', activated: 0, stats: stat },
      { type: 'PVE_ATTACK', activated: true, stats: stat },
    ]);
    expect(b.critChance).toBe(5);
  });
  it('Oblivion: grade base Attack/HP, power excludes amplify', () => {
    expect(oblivionPowerForQuality(1)).toBe(8);
    expect(oblivionPowerForQuality(100)).toBe(30);
    for (const g of OBLIVION_GRADES) {
      const b = calculateStoneBonuses([
        { type: 'OBLIVION', oblivionLevel: g.level, quality: 100, amplifyLevel: 10,
          stats: [{ type: 'OBLIVION_POWER', value: 30 }, { type: 'PVP_ATTACK', value: 10 }] },
      ]);
      expect(b.flatAttack).toBe(g.baseAttack);
      expect(b.flatHp).toBe(g.baseHp);
      expect(b.oblivionPower).toBeCloseTo(30 * g.powerGradeMult, 9);
      expect(b.pvpAttack).toBeCloseTo(16, 9);
    }
  });
});

describe('mount source', () => {
  it('level factor 1 + 0.1(L-1) with rounding', () => {
    expect(mountEffectiveStats({ baseHp: 10, baseAtk: 8, level: 3 })).toEqual({ hp: 12, atk: 10 });
    expect(mountEffectiveStats({ baseHp: 49, baseAtk: 40, level: 5 })).toEqual({ hp: 69, atk: 56 });
  });
  it('adds unsealed glyph secondaries and ignores sealed or secondary-less glyphs', () => {
    expect(glyphSecondaryValue({ stat: 'ATTACK_PERCENT', quality: 0.5 })).toBe(7.9);
    const b = calculateMountBonuses({ baseHp: 10, baseAtk: 8, level: 1 }, [
      { sealed: false, secondary: { stat: 'ATTACK_PERCENT', quality: 0.5 } },
      { sealed: false, secondary: { stat: 'HEALTH_PERCENT', quality: 1 } },
      { sealed: true, secondary: { stat: 'CRIT_CHANCE', quality: 1 } },
      { sealed: false, secondary: null },
    ]);
    expect(b.attackPercent).toBeCloseTo(8 + 7.9, 9);
    expect(b.hpPercent).toBe(10);
    expect(b.healthPercent).toBe(15);
    expect(b.critChance).toBe(0);
  });
  it('no mount gives zeros', () => {
    expect(Object.values(calculateMountBonuses(null)).every((v) => v === 0)).toBe(true);
  });
});

describe('relic source', () => {
  it('statAt is linear base -> max', () => {
    expect(relicStatAt(6, 26, 1, 10)).toBe(6);
    expect(relicStatAt(6, 26, 10, 10)).toBe(26);
    expect(relicStatAt(6, 26, 4, 10)).toBeCloseTo(6 + (20 * 3) / 9, 9);
    expect(relicStatAt(6, 26, 5, 1)).toBe(6);
  });
  it('maps HP_PERCENT to healthPercent and sums across relics', () => {
    const b = calculateRelicBonuses([{ id: 'relic_iron_heart', level: 10 }, { id: 'relic_iron_heart', level: 1 }, { id: 'nope', level: 3 }]);
    expect(b.healthPercent).toBe(32);
  });
  it('every catalogue relic bonus lands on a known key', () => {
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      for (const r of relicsForClass(cls)) {
        const b = calculateRelicBonuses([{ id: r.id, level: r.maxLevel }]);
        const total = r.bonuses.reduce((s, x) => s + x.max, 0);
        const got = Object.values(b).reduce((s, v) => s + v, 0);
        expect(got).toBeCloseTo(total, 6);
      }
    }
  });
});
