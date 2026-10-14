import { describe, it, expect } from 'vitest';
import { applyBuffsToEntity, hasActiveBuffs, getBuffedMaxHp } from './buffs.js';
import { createMobEntity } from './entity.js';
import { ceilingFor } from './caps.js';

const base = { ...createMobEntity({ hp: 1000, attack: 1001, attackSpeed: 1 }), critChance: 20, critDamage: 2 };

describe('applyBuffsToEntity (L1085543-1085695)', () => {
  it('Attack % is multiplicative and floored: floor(1001 * 1.15) = 1151', () => {
    // 1001 * 1.15 = 1151.15
    expect(applyBuffsToEntity(base, { attackPercent: 15 }).attack).toBe(1151);
  });
  it('attackPercent 0 leaves attack unchanged', () => {
    expect(applyBuffsToEntity(base, { attackPercent: 0 }).attack).toBe(1001);
  });
  it('does not mutate the input and returns a copy', () => {
    const out = applyBuffsToEntity(base, { attackPercent: 10 });
    expect(out).not.toBe(base);
    expect(base.attack).toBe(1001);
  });
  it('additive fields add then clamp to the combat ceiling', () => {
    const out = applyBuffsToEntity(base, { critChance: 100, attackSpeed: 10, lifesteal: 200, blockChance: 100, missChance: 100, blindChance: 100, damageReduction: 100, hpRegen: 100, penetration: 100 });
    expect(out.critChance).toBe(ceilingFor('CRIT_CHANCE'));
    expect(out.attackSpeed).toBe(ceilingFor('ATTACK_SPEED'));
    expect(out.lifesteal).toBe(ceilingFor('LIFESTEAL'));
    expect(out.blockChance).toBe(ceilingFor('BLOCK_CHANCE'));
    expect(out.missChance).toBe(ceilingFor('MISS_CHANCE'));
    expect(out.blindChance).toBe(ceilingFor('BLIND_CHANCE'));
    expect(out.damageReduction).toBe(ceilingFor('DAMAGE_REDUCTION'));
    expect(out.hpRegen).toBe(ceilingFor('HP_REGEN'));
    expect(out.penetration).toBe(ceilingFor('PENETRATION'));
  });
  it('below the ceiling adds plainly: crit 20 + 15 = 35, speed 1 + 0.5 = 1.5', () => {
    const out = applyBuffsToEntity(base, { critChance: 15, attackSpeed: 0.5 });
    expect(out.critChance).toBe(35);
    expect(out.attackSpeed).toBe(1.5);
  });
  it('critDamage buff adds /100 with no ceiling; 0 or missing adds nothing', () => {
    expect(applyBuffsToEntity(base, { critDamage: 50 }).critDamage).toBe(2.5);
    expect(applyBuffsToEntity(base, { critDamage: 1000 }).critDamage).toBe(12);
    expect(applyBuffsToEntity(base, {}).critDamage).toBe(2);
  });
  it('spellResist adds with no ceiling', () => {
    const e = { ...base, spellResist: 90 };
    expect(applyBuffsToEntity(e, { spellResist: 50 }).spellResist).toBe(140);
  });
  it('an empty buff leaves the entity unchanged', () => {
    expect(applyBuffsToEntity(base, {})).toEqual(base);
  });
  it('HP and maxHp are not touched (hpPercent goes through getBuffedMaxHp)', () => {
    const out = applyBuffsToEntity(base, { hpPercent: 50 });
    expect(out.maxHp).toBe(1000);
    expect(out.hp).toBe(1000);
  });
});

describe('hasActiveBuffs (L1085696-1085766)', () => {
  it('false for empty / zero', () => {
    expect(hasActiveBuffs({})).toBe(false);
    expect(hasActiveBuffs({ attackPercent: 0, hpRegen: 0 })).toBe(false);
  });
  it('true for any single positive field, including hpPercent and spellResist', () => {
    for (const k of ['attackPercent', 'attackSpeed', 'lifesteal', 'blockChance', 'missChance', 'blindChance', 'critChance', 'critDamage', 'damageReduction', 'hpRegen', 'hpPercent', 'penetration', 'spellResist']) {
      expect(hasActiveBuffs({ [k]: 1 })).toBe(true);
    }
  });
});

describe('getBuffedMaxHp (L1085767-1085789)', () => {
  it('floor(base * (1 + pct/100)) when pct > 0', () => {
    // 1001 * 1.15 = 1151.15 -> 1151
    expect(getBuffedMaxHp(1001, 15)).toBe(1151);
  });
  it('returns base for pct <= 0', () => {
    expect(getBuffedMaxHp(1001, 0)).toBe(1001);
    expect(getBuffedMaxHp(1001, -5)).toBe(1001);
  });
});
