import { describe, it, expect } from 'vitest';
import statsData from '../../data/game/stats.json';
import classesData from '../../data/game/classes.json';
import {
  STATS, statByKey, statByEnum, softCap, hardCap, combatCeiling, roundDigits, displayMult, classesAvailable,
} from './stats.js';
import {
  CLASSES, SPECS, specsForClass, available, attunementBonus, sigilUnlockLevel, XP_TABLE,
  CLASS_UNIQUE_SECONDARY_STATS,
} from './classes.js';

describe('game/stats', () => {
  it('exposes every row of stats.json', () => {
    expect(STATS.length).toBe(statsData.stats.length);
    expect(STATS.length).toBe(29);
  });
  it('looks up by computedKey and enum', () => {
    expect(statByKey('totalAttackSpeed').enumName).toBe('ATTACK_SPEED');
    expect(statByEnum('LIFESTEAL').computedKey).toBe('totalLifesteal');
    expect(statByKey('nope')).toBeNull();
  });
  it('caps, ceilings, rounding', () => {
    expect(softCap('totalAttackSpeed')).toBe(2);
    expect(hardCap('totalAttackSpeed')).toBe(4);
    expect(combatCeiling('ATTACK_SPEED')).toBe(4.5);
    expect(softCap('totalLifesteal')).toBe(40);
    expect(roundDigits('totalAttackSpeed')).toBe(2);
    expect(displayMult('totalAttackSpeed')).toBe(100);
    expect(classesAvailable('totalLifesteal')).not.toContain('NECROMANCER');
  });
});

describe('game/classes', () => {
  it('4 classes, 8 specs, two per class', () => {
    expect(CLASSES).toHaveLength(4);
    expect(SPECS).toHaveLength(8);
    for (const c of CLASSES) expect(specsForClass(c)).toHaveLength(2);
    expect(specsForClass('MYSTIC').map((s) => s.name)).toEqual(['Mage', 'Druid']);
  });
  it('available() gating', () => {
    expect(available('DOUBLE_HIT', 'WARRIOR')).toBe(true);
    expect(available('DOUBLE_HIT', 'MYSTIC')).toBe(false);
    expect(available('DAMAGE_REDUCTION', 'MYSTIC')).toBe(true);
    expect(available('DAMAGE_REDUCTION', 'SENTINEL')).toBe(false);
    expect(available('CRIT_CHANCE', 'NECROMANCER')).toBe(false);
    expect(available('CRIT_CHANCE', 'WARRIOR')).toBe(true);
    expect(available('SPELL_VAMP')).toBe(false); // default WARRIOR
    expect(available('ATTACK_PERCENT', 'NECROMANCER')).toBe(true);
  });
  it('available() agrees with stats.json classesAvailable', () => {
    for (const s of statsData.stats) {
      for (const c of CLASSES) {
        expect(available(s.enumName, c), `${s.enumName}/${c}`).toBe(s.classesAvailable.includes(c));
      }
    }
  });
  it('attunement and sigil unlocks', () => {
    expect([attunementBonus('WARRIOR'), attunementBonus('MYSTIC'), attunementBonus('NECROMANCER'), attunementBonus()]).toEqual([0, 1, 1, 0]);
    expect(sigilUnlockLevel('WARRIOR')).toBe(25);
    expect(sigilUnlockLevel('NECROMANCER')).toBe(17);
    expect(sigilUnlockLevel('X')).toBe(25);
  });
  it('xp table and unique lists come from the JSON', () => {
    expect(XP_TABLE).toBe(classesData.xpTable);
    expect(XP_TABLE).toHaveLength(99);
    expect(CLASS_UNIQUE_SECONDARY_STATS.NECROMANCER).toHaveLength(9);
  });
});
