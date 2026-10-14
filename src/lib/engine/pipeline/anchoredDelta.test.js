import { describe, it, expect } from 'vitest';
import { anchoredDelta } from './anchoredDelta.js';
import { calculateTotalStats } from './totals.js';

const BASE = { attack: 10, hp: 100, attackSpeed: 1, critChance: 0, critDamage: 1.5 };
const gear = (...secondaryStats) => ({ RING: { primaryStats: { attack: 0, hp: 0 }, secondaryStats } });
const calc = (equipment, ctx = {}) =>
  calculateTotalStats(BASE, equipment, null, null, null, null, null, undefined, null, null, null, ctx);

describe('anchoredDelta (rebuild-plan §4; softCapGainFromSheet L1080334-1080366)', () => {
  it('capped stat below the soft cap is plain addition and drops no raw key', () => {
    const out = anchoredDelta({ totalCritChance: 30 }, { totalCritChance: 10 });
    expect(out).toEqual({ totalCritChance: 40 });
  });

  it('starts from the printed raw: Block raw 80 + 40 = 120 -> 70 (stats.md §4.3)', () => {
    const out = anchoredDelta({ totalBlockChance: 62.2, rawBlockChance: 80 }, { totalBlockChance: 40 });
    expect(out.totalBlockChance).toBe(70);
    expect(out.rawBlockChance).toBe(120);
  });

  it('without a printed raw it inverts the curve: 62.2 -> raw ~79.9, +40 -> 70', () => {
    const out = anchoredDelta({ totalBlockChance: 62.2 }, { totalBlockChance: 40 });
    expect(out.totalBlockChance).toBe(70);
    expect(out.rawBlockChance).toBeGreaterThan(119);
    expect(out.rawBlockChance).toBeLessThan(121);
  });

  it('crit 50 (soft cap) + 10 raw: 50 + 40*(1-(80/90)^2) = 58.4, raw 60', () => {
    const out = anchoredDelta({ totalCritChance: 50 }, { totalCritChance: 10 });
    expect(out.totalCritChance).toBe(58.4);
    expect(out.rawCritChance).toBe(60);
  });

  it('a negative delta that falls back under the soft cap removes the raw key', () => {
    const out = anchoredDelta({ totalCritChance: 58.4, rawCritChance: 60 }, { totalCritChance: -20 });
    expect(out.totalCritChance).toBe(40);
    expect('rawCritChance' in out).toBe(false);
  });

  it('a stat at the hard cap (raw not recoverable) is left unchanged', () => {
    const out = anchoredDelta({ totalCritChance: 90 }, { totalCritChance: 5 });
    expect(out.totalCritChance).toBe(90);
  });

  it('matches a full recompute of the build (crit raw 60 -> 70)', () => {
    const before = calc(gear({ type: 'CRIT_CHANCE', value: 60 }));
    const after = calc(gear({ type: 'CRIT_CHANCE', value: 70 }));
    const out = anchoredDelta(before, { totalCritChance: 10 });
    expect(out.totalCritChance).toBe(after.totalCritChance);
    expect(out.rawCritChance).toBe(after.rawCritChance);
  });

  it('Attack: unflattens by Attack%, adds flat, reflattens', () => {
    const out = anchoredDelta({ totalAttack: 1200, totalAttackPercent: 20 }, { totalAttack: 100 });
    expect(out.totalAttack).toBe(1320); // (1000+100) * 1.2
    const pct = anchoredDelta({ totalAttack: 1200, totalAttackPercent: 20 }, { totalAttackPercent: 10 });
    expect(pct.totalAttack).toBe(1300); // 1000 * 1.3
    expect(pct.totalAttackPercent).toBe(30);
  });

  it('Attack / HP honour the form multipliers', () => {
    const bear = { attackMult: 0.9, gearHpMult: 1.6 };
    expect(anchoredDelta({ totalAttack: 900 }, { totalAttack: 100 }, { formConfig: bear }).totalAttack).toBe(990);
    // hp 1700 = 1100 flat + 600 from the 1.6x gear; +100 gear hp adds 160
    expect(anchoredDelta({ totalHp: 1700 }, { totalHp: 100 }, { formConfig: bear }).totalHp).toBe(1860);
  });

  it('matches a full recompute for Attack and HP', () => {
    const eq = (a, h) => ({ WEAPON: { primaryStats: { attack: a, hp: h }, secondaryStats: [{ type: 'ATTACK_PERCENT', value: 20 }, { type: 'HEALTH_PERCENT', value: 10 }] } });
    const before = calc(eq(990, 4900));
    const after = calc(eq(1090, 5400));
    const out = anchoredDelta(before, { totalAttack: 100, totalHp: 500 });
    expect(out.totalAttack).toBe(after.totalAttack);
    expect(out.totalHp).toBe(after.totalHp);
  });

  it('a zero change returns the sheet unchanged and never mutates the input', () => {
    const sheet = Object.freeze({ totalAttack: 1203, totalHp: 5501, totalAttackPercent: 20 });
    const out = anchoredDelta(sheet, { totalAttack: 0, totalCritChance: 0 });
    expect(out).toEqual(sheet);
    expect(out).not.toBe(sheet);
  });

  it('Attack Speed delta is scaled by the form attackSpeedMult', () => {
    const out = anchoredDelta({ totalAttackSpeed: 1.5 }, { totalAttackSpeed: 0.1 }, { formConfig: { attackSpeedMult: 1.1 } });
    expect(out.totalAttackSpeed).toBe(1.61);
  });

  it('class rules make the delta inert (stats.md §3.3)', () => {
    const sheet = { totalCritChance: 0, totalDamageReduction: 0, totalSpellCritChance: 0, totalBlockChance: 0 };
    expect(anchoredDelta(sheet, { totalCritChance: 10 }, { playerClass: 'NECROMANCER' }).totalCritChance).toBe(0);
    expect(anchoredDelta(sheet, { totalDamageReduction: 10 }, { playerClass: 'MYSTIC' }).totalDamageReduction).toBe(0);
    const druid = { playerClass: 'MYSTIC', formConfig: { unlocksBlockAndDr: true } };
    expect(anchoredDelta(sheet, { totalBlockChance: 10 }, druid).totalBlockChance).toBe(10);
    expect(anchoredDelta(sheet, { totalSpellCritChance: 10 }, { playerClass: 'MYSTIC', activeSpec: 'MYSTIC_MAGE' }).totalSpellCritChance).toBe(10);
    expect(anchoredDelta(sheet, { totalSpellCritChance: 10 }, { playerClass: 'MYSTIC', activeSpec: 'MYSTIC_DRUID' }).totalSpellCritChance).toBe(0);
  });

  it('fearChance folds into Disruption; uncapped stats add and round', () => {
    const out = anchoredDelta(
      { totalDisruptionChance: 5, totalSpellDamage: 10.5, totalPvpAttack: 100, totalMinionAttackSpeed: 1.5 },
      { fearChance: 2, totalSpellDamage: 4.26, totalPvpAttack: 20.4, totalMinionAttackSpeed: 3 },
    );
    expect(out.totalDisruptionChance).toBe(7);
    expect(out.totalSpellDamage).toBe(14.8);
    expect(out.totalPvpAttack).toBe(120);
    expect(out.totalMinionAttackSpeed).toBe(4.5); // uncapped in the pipeline
  });
});
