import { describe, it, expect } from 'vitest';
import { parseSheetText } from './sheetText.js';
import { sheetKeysForClass } from '../engine/pipeline/sheet.js';

const WARRIOR = sheetKeysForClass('WARRIOR', 'base');
const parse = (text, keys = WARRIOR, cls = 'WARRIOR') => parseSheetText(text, keys, cls);

describe('parseSheetText', () => {
  it('reads "." as thousands on flat rows and as a decimal point on percent rows', () => {
    const r = parse('Attack 48.124\nHealth 1.234.567\nCrit Chance 6.2%\nBlock Chance: 62.2');
    expect(r.values).toEqual({ totalAttack: 48124, totalHp: 1234567, totalCritChance: 6.2, totalBlockChance: 62.2 });
    expect(r.unmatched).toEqual([]);
  });

  it('reads Attack Speed and Crit Damage as the shown percent', () => {
    expect(parse('Attack Speed 187.5%\nCrit Damage\t250%').values).toEqual({ totalAttackSpeed: 1.875, totalCritDamage: 2.5 });
  });

  it('accepts colons, tabs, wide gaps and any letter case', () => {
    const r = parse('ATTACK:48.124\nhealth\t\t2.000\npvp attack    500');
    expect(r.values).toEqual({ totalAttack: 48124, totalHp: 2000, totalPvpAttack: 500 });
  });

  it('matches the class display labels as well as the sheet labels', () => {
    expect(parse('Attack % 12.5\nAttack (bonus) 13\nDMG Reduction 4.1').values)
      .toEqual({ totalAttackPercent: 13, totalDamageReduction: 4.1 });
  });

  it('skips blank lines and reports unknown labels', () => {
    const r = parse('\n  \nAttack 100\nFoo 12\nStats\n');
    expect(r.values).toEqual({ totalAttack: 100 });
    expect(r.unmatched).toEqual([{ line: 'Foo 12', reason: 'unknown' }, { line: 'Stats', reason: 'unknown' }]);
  });

  it('a repeated label: the last one wins and appears once', () => {
    const r = parse('Attack 100\nHealth 5\nAttack 200');
    expect(r.values.totalAttack).toBe(200);
    expect(r.rows.map((x) => x.key)).toEqual(['totalHp', 'totalAttack']);
  });

  it('reports a number that does not read, and does not apply it', () => {
    const r = parse('Attack -3\nHealth\nCrit Chance abc');
    expect(r.values).toEqual({});
    expect(r.unmatched.map((u) => u.reason)).toEqual(['invalid', 'invalid', 'invalid']);
  });

  it('a stat another class shows is reported, not applied', () => {
    const r = parse('Soul Link 12\nMiss Chance 3', WARRIOR);
    expect(r.values).toEqual({});
    expect(r.unmatched.map((u) => u.reason)).toEqual(['other', 'other']);
    const nec = parseSheetText('Soul Link 12', sheetKeysForClass('NECROMANCER', 'base'), 'NECROMANCER');
    expect(nec.values).toEqual({ totalSoulLink: 12 });
  });

  it('empty or missing text gives nothing', () => {
    expect(parse('')).toEqual({ values: {}, rows: [], unmatched: [] });
    expect(parse(null)).toEqual({ values: {}, rows: [], unmatched: [] });
  });
});
