import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from './fixtures.js';
import { computePresetStats } from './stats.js';
import { computeResidual, applyResidual, absorbIntoBase } from './residual.js';
import { diffSheet, summariseDiff } from '../engine/pipeline/sheetDiff.js';

describe('computeResidual', () => {
  const c = fixtureCharacter('WARRIOR');
  const { computed } = computePresetStats(c, 'p1');

  it('is empty when the sheet matches the computed stats', () => {
    expect(computeResidual(computed, computed, { playerClass: 'WARRIOR' })).toEqual({});
  });

  it('ignores differences inside the tolerance (Attack +-1, percent +-0.1, multipliers +-0.01)', () => {
    const sheet = { ...computed, totalAttack: computed.totalAttack + 1, totalLifesteal: computed.totalLifesteal + 0.1, totalCritDamage: computed.totalCritDamage + 0.01 };
    expect(computeResidual(computed, sheet)).toEqual({});
  });

  it('plain stats are total differences; capped stats are raw differences', () => {
    const sheet = { ...computed, totalAttack: computed.totalAttack + 5000, totalSpellDamage: computed.totalSpellDamage + 3, totalCritChance: computed.totalCritChance + 4 };
    const r = computeResidual(computed, sheet);
    expect(r.totalAttack).toBe(5000);
    expect(r.totalSpellDamage).toBeCloseTo(3, 6);
    expect(r.totalCritChance).toBeGreaterThan(3.9); // crit chance sits below the soft cap here: raw == total
  });

  it('skips Dominion and rows the class does not show', () => {
    const n = fixtureCharacter('NECROMANCER');
    const comp = computePresetStats(n, 'p1').computed;
    const r = computeResidual(comp, { ...comp, totalDominion: 50, totalCritChance: 40 }, { playerClass: 'NECROMANCER' });
    expect(r.totalDominion).toBeUndefined();
    expect(r.totalCritChance).toBeUndefined();
  });

  it('uses a printed raw value above the soft cap', () => {
    const base = { totalCritChance: 60, rawCritChance: 60 };
    const sheet = { totalCritChance: 62, rawCritChance: 70 };
    const r = computeResidual(base, sheet);
    expect(r.totalCritChance).toBeGreaterThan(0);
  });
});

describe('applyResidual', () => {
  const c = fixtureCharacter('SENTINEL');
  const { computed } = computePresetStats(c, 'p1');

  it('reproduces the sheet when applied to the same computed stats', () => {
    const sheet = {
      ...computed,
      totalAttack: computed.totalAttack + 4000,
      totalHp: computed.totalHp - 3000,
      totalSpellDamage: computed.totalSpellDamage + 2.5,
      totalAttackSpeed: Number((computed.totalAttackSpeed + 0.08).toFixed(2)),
      totalPvpAttack: computed.totalPvpAttack + 10,
    };
    const r = computeResidual(computed, sheet);
    const back = applyResidual(computed, r);
    for (const row of diffSheet(back, sheet)) expect(row.withinTolerance, row.key).toBe(true);
    expect(summariseDiff(diffSheet(back, sheet)).unexplained).toBe(0);
  });

  it('does not mutate its input and clamps at zero', () => {
    const before = JSON.stringify(computed);
    const out = applyResidual(computed, { totalAttack: -1e12, totalSpellDamage: -1e6 });
    expect(JSON.stringify(computed)).toBe(before);
    expect(out.totalAttack).toBe(0);
    expect(out.totalSpellDamage).toBe(0);
  });

  it('adds raw points before the soft cap curve', () => {
    const near = { totalCritChance: 59, totalAttack: 1 };
    const out = applyResidual(near, { totalCritChance: 30 });
    expect(out.totalCritChance).toBeGreaterThan(59);
    expect(out.totalCritChance).toBeLessThan(89); // diminishing returns past the soft cap
    expect(out.rawCritChance).toBeGreaterThanOrEqual(89); // the raw sum is kept above the soft cap
  });
});

describe('absorbIntoBase', () => {
  it('moves the base-stat residuals into baseResidual so recomputing matches the sheet', () => {
    for (const cls of ['WARRIOR', 'MYSTIC']) {
      const c = fixtureCharacter(cls);
      const res = computePresetStats(c, 'p1');
      const sheet = {
        ...res.computed,
        totalAttack: res.computed.totalAttack + 7000,
        totalHp: res.computed.totalHp + 25000,
        totalCritDamage: Number((res.computed.totalCritDamage + 0.2).toFixed(2)),
        totalSpellDamage: res.computed.totalSpellDamage + 4,
      };
      const residual = computeResidual(res.computed, sheet, { playerClass: cls });
      const { base, residual: rest } = absorbIntoBase(c.baseResidual, res.computed, residual, res.ctx);
      expect(rest.totalSpellDamage).toBeCloseTo(4, 6); // not a base stat: carried
      expect(rest.totalAttack).toBeUndefined();
      expect(base.attack).toBeGreaterThan(c.baseResidual.attack);

      const absorbed = { ...c, baseResidual: base };
      const after = computePresetStats(absorbed, 'p1').computed;
      // the % buckets are rounded to 1 dp in the computed stats, which limits the precision to ~1e-5
      expect(Math.abs(after.totalAttack - sheet.totalAttack)).toBeLessThanOrEqual(Math.max(2, sheet.totalAttack * 2e-5));
      expect(Math.abs(after.totalHp - sheet.totalHp)).toBeLessThanOrEqual(Math.max(2, sheet.totalHp * 2e-5));
      expect(Math.abs(after.totalCritDamage - sheet.totalCritDamage)).toBeLessThanOrEqual(0.01);
    }
  });

  it('keeps the base non-negative', () => {
    const c = fixtureCharacter('WARRIOR');
    const { computed } = computePresetStats(c, 'p1');
    const { base } = absorbIntoBase(c.baseResidual, computed, { totalAttack: -1e9, totalHp: -1e9 });
    expect(base.attack).toBe(0);
    expect(base.hp).toBe(0);
  });
});
