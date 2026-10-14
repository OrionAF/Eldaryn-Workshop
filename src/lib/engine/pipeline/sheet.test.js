import { describe, it, expect } from 'vitest';
import {
  SHEET_KEYS, TOTAL_KEYS, RAW_KEYS, isSheetKey, sheetKeyMeta, rawKeyOf, totalKeyOf, toleranceFor,
  sheetKeysForClass, normaliseSheetValues, toDisplay, fromDisplay, parseSheetInput,
} from './sheet.js';

describe('sheet key list', () => {
  it('has the 19 raw keys of stats.md §3.4 (none for Minion Attack Speed) and 34 totals', () => {
    expect(RAW_KEYS.length).toBe(19);
    expect(RAW_KEYS).not.toContain('rawMinionAttackSpeed');
    expect(TOTAL_KEYS.length).toBe(34); // 2 primaries + 28 stat rows (Fear folds into Disruption) + dominion + 3 conduits
    expect(SHEET_KEYS.length).toBe(TOTAL_KEYS.length + RAW_KEYS.length);
    expect(TOTAL_KEYS).toContain('totalDominion');
    expect(TOTAL_KEYS).toContain('totalHp');
    expect(TOTAL_KEYS).not.toContain('totalFearChance');
  });
  it('maps totals to raws and back', () => {
    expect(rawKeyOf('totalCritChance')).toBe('rawCritChance');
    expect(totalKeyOf('rawCritChance')).toBe('totalCritChance');
    expect(rawKeyOf('totalSpellDamage')).toBeNull();
    expect(rawKeyOf('totalMinionAttackSpeed')).toBeNull();
    expect(isSheetKey('rawSoulLink')).toBe(true);
    expect(isSheetKey('rawFoo')).toBe(false);
  });
  it('kinds, digits and tolerances follow rebuild-plan §4', () => {
    expect(sheetKeyMeta('totalAttack').kind).toBe('integer');
    expect(toleranceFor('totalAttack')).toBe(1);
    expect(toleranceFor('totalHp')).toBe(1);
    expect(toleranceFor('totalCritChance')).toBe(0.1);
    expect(toleranceFor('rawCritChance')).toBe(0.1);
    expect(toleranceFor('totalAttackSpeed')).toBe(0.01);
    expect(toleranceFor('totalCritDamage')).toBe(0.01);
    expect(toleranceFor('totalDominion')).toBe(0);
    expect(toleranceFor('totalPvpAttack')).toBe(1);
    expect(toleranceFor('nope')).toBe(0);
  });
  it('gates rows by class', () => {
    const necro = sheetKeysForClass('NECROMANCER');
    expect(necro).toContain('totalDominion');
    expect(necro).toContain('totalDisruptionChance');
    expect(necro).not.toContain('totalCritChance');
    expect(necro).not.toContain('totalLifesteal');
    expect(sheetKeysForClass('WARRIOR')).not.toContain('totalDominion');
    expect(sheetKeysForClass('WARRIOR')).toContain('totalBlockChance');
    expect(sheetKeysForClass('SENTINEL')).toContain('totalMissChance');
    expect(sheetKeysForClass('SENTINEL')).not.toContain('totalBlockChance');
  });
});

describe('normaliseSheetValues', () => {
  it('keeps only known keys with finite non-negative numbers', () => {
    expect(normaliseSheetValues({
      totalAttack: 1200, rawCritChance: 60, totalBogus: 3, totalHp: NaN, totalCritChance: -1, totalBlockChance: '4',
    })).toEqual({ totalAttack: 1200, rawCritChance: 60 });
    expect(normaliseSheetValues(null)).toEqual({});
  });
});

describe('display conversion', () => {
  it('multipliers show x100', () => {
    expect(toDisplay('totalCritDamage', 1.5)).toBe(150);
    expect(fromDisplay('totalAttackSpeed', 187)).toBe(1.87);
    expect(toDisplay('totalCritChance', 50)).toBe(50);
  });
});

describe('parseSheetInput (flat "." is thousands, percent "." is decimal)', () => {
  it('integer rows drop every separator', () => {
    expect(parseSheetInput('totalAttack', '12.345')).toBe(12345);
    expect(parseSheetInput('totalHp', '1,234,567')).toBe(1234567);
    expect(parseSheetInput('totalHp', '1 234')).toBe(1234);
    expect(parseSheetInput('totalPvpAttack', '500')).toBe(500);
  });
  it('percent rows read the separator as a decimal point', () => {
    expect(parseSheetInput('totalBlockChance', '62.2%')).toBe(62.2);
    expect(parseSheetInput('totalBlockChance', '62,2')).toBe(62.2);
    expect(parseSheetInput('totalBlockChance', '1,234.5')).toBe(1234.5);
    expect(parseSheetInput('totalBlockChance', '40')).toBe(40);
  });
  it('multiplier rows are typed as the shown percent', () => {
    expect(parseSheetInput('totalCritDamage', '250%')).toBe(2.5);
    expect(parseSheetInput('totalAttackSpeed', '187.5')).toBe(1.875);
  });
  it('rejects empty, negative, garbage and unknown keys', () => {
    expect(parseSheetInput('totalAttack', '')).toBeNull();
    expect(parseSheetInput('totalBlockChance', '-3')).toBeNull();
    expect(parseSheetInput('totalBlockChance', 'abc')).toBeNull();
    expect(parseSheetInput('totalBogus', '3')).toBeNull();
  });
});
