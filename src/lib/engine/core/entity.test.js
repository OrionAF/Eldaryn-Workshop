import { describe, it, expect } from 'vitest';
import { createPlayerEntity, createMobEntity } from './entity.js';

const sheet = {
  totalHp: 5000, totalAttack: 900, totalAttackSpeed: 1.5, totalDoubleHit: 10, totalCritChance: 30,
  totalCritDamage: 2.2, totalLifesteal: 4, totalHpRegen: 5, totalDamageReduction: 12,
  totalBlockChance: 8, totalMissChance: 3, totalBlindChance: 2, totalParalyzeChance: 1,
  totalPenetration: 20, totalPvpAttack: 7, totalPvpDefense: 9,
};

describe('createPlayerEntity (L1087500-1087588)', () => {
  it('copies every total* key and zeroes shield', () => {
    const e = createPlayerEntity(sheet);
    expect(e).toMatchObject({
      maxHp: 5000, rawMaxHp: 5000, hp: 5000, attack: 900, attackSpeed: 1.5, doubleHit: 10,
      critChance: 30, critDamage: 2.2, lifesteal: 4, hpRegen: 5, damageReduction: 12,
      blockChance: 8, missChance: 3, blindChance: 2, paralyzeChance: 1, penetration: 20,
      pvpAttack: 7, pvpDefense: 9, shieldHp: 0, shieldMax: 0,
    });
  });
  it('defaults: spell fields and disruptionChance 0, disruptionEffect SILENCE', () => {
    const e = createPlayerEntity(sheet);
    expect(e.disruptionChance).toBe(0);
    expect(e.disruptionEffect).toBe('SILENCE');
    expect([e.spellDamage, e.spellResist, e.spellCritChance, e.spellVamp]).toEqual([0, 0, 0, 0]);
  });
  it('passes through disruption and spell values', () => {
    const e = createPlayerEntity({
      ...sheet, totalDisruptionChance: 15, disruptionEffect: 'FEAR', totalSpellDamage: 11,
      totalSpellResist: 12, totalSpellCritChance: 13, totalSpellVamp: 14,
    });
    expect(e).toMatchObject({
      disruptionChance: 15, disruptionEffect: 'FEAR', spellDamage: 11, spellResist: 12,
      spellCritChance: 13, spellVamp: 14,
    });
  });
  it('rawMaxHp comes from pvpBaseHp when given (maxHp stays totalHp)', () => {
    const e = createPlayerEntity({ ...sheet, totalHp: 40000, pvpBaseHp: 5000 });
    expect(e.maxHp).toBe(40000);
    expect(e.hp).toBe(40000);
    expect(e.rawMaxHp).toBe(5000);
  });
});

describe('createMobEntity (L1087589-1087646)', () => {
  it('fixed zeros, critDamage 1, SILENCE', () => {
    const e = createMobEntity({ hp: 300, attack: 20, attackSpeed: 1.1 });
    expect(e).toMatchObject({
      maxHp: 300, rawMaxHp: 300, hp: 300, attack: 20, attackSpeed: 1.1, doubleHit: 0,
      critChance: 0, critDamage: 1, lifesteal: 0, hpRegen: 0, damageReduction: 0, blockChance: 0,
      missChance: 0, blindChance: 0, paralyzeChance: 0, penetration: 0, disruptionChance: 0,
      disruptionEffect: 'SILENCE', pvpAttack: 0, pvpDefense: 0, spellDamage: 0, spellResist: 0,
      spellCritChance: 0, spellVamp: 0, shieldHp: 0, shieldMax: 0,
    });
  });
  it('copies damageReduction, blockChance, penetration when present', () => {
    const e = createMobEntity({ hp: 1, attack: 1, attackSpeed: 1, damageReduction: 25, blockChance: 10, penetration: 40 });
    expect([e.damageReduction, e.blockChance, e.penetration]).toEqual([25, 10, 40]);
  });
  it('player and mob entities have the same key set', () => {
    expect(Object.keys(createMobEntity({ hp: 1, attack: 1, attackSpeed: 1 })).sort())
      .toEqual(Object.keys(createPlayerEntity(sheet)).sort());
  });
});
