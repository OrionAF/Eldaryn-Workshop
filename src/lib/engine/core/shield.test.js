import { describe, it, expect } from 'vitest';
import {
  absorbWithShield, shieldRefillAmount, regenShieldRefillAmount,
  createHealBudget, refillHealBudget, spendHealBudget,
} from './shield.js';

describe('absorbWithShield (L1085790-1085856)', () => {
  it('no absorb when shield <= 0 or damage <= 0', () => {
    expect(absorbWithShield(0, 50, 0.5)).toEqual({ shieldHp: 0, hpDamage: 50, effectiveDamage: 50 });
    expect(absorbWithShield(-5, 50)).toEqual({ shieldHp: -5, hpDamage: 50, effectiveDamage: 50 });
    expect(absorbWithShield(100, 0, 0.5)).toEqual({ shieldHp: 100, hpDamage: 0, effectiveDamage: 0 });
  });
  it('m=0.5, fully absorbed: cost = 100 * 0.5 = 50, shield 80 -> 30', () => {
    expect(absorbWithShield(80, 100, 0.5)).toEqual({ shieldHp: 30, hpDamage: 0, effectiveDamage: 50 });
  });
  it('m=0.5, exact: shield 50 vs 100 damage -> shield 0, no hp damage', () => {
    expect(absorbWithShield(50, 100, 0.5)).toEqual({ shieldHp: 0, hpDamage: 0, effectiveDamage: 50 });
  });
  it('m=0.5, broken: shield 30 absorbs 60, hpDamage 100 - 60 = 40, effective 30 + 40 = 70', () => {
    expect(absorbWithShield(30, 100, 0.5)).toEqual({ shieldHp: 0, hpDamage: 40, effectiveDamage: 70 });
  });
  it('m=0 (default): 1:1 absorb. shield 30 vs 100 -> hp 70; shield 150 vs 100 -> shield 50', () => {
    expect(absorbWithShield(30, 100)).toEqual({ shieldHp: 0, hpDamage: 70, effectiveDamage: 100 });
    expect(absorbWithShield(150, 100, 0)).toEqual({ shieldHp: 50, hpDamage: 0, effectiveDamage: 100 });
  });
  it('undefined mitigation behaves as 0', () => {
    expect(absorbWithShield(30, 100, undefined)).toEqual(absorbWithShield(30, 100, 0));
  });
});

describe('shield refill amounts (L1085857-1085899)', () => {
  it('shieldRefillAmount: overflow only (no vamp flag)', () => {
    // heal 100, only 60 applied -> overflow 40
    expect(shieldRefillAmount({ ownerHpDelta: 100, ownerVampHeal: 30 }, 60, false)).toBe(40);
  });
  it('shieldRefillAmount: vampAlwaysRefills takes max(vamp heal, overflow)', () => {
    expect(shieldRefillAmount({ ownerHpDelta: 100, ownerVampHeal: 30 }, 60, true)).toBe(40);
    expect(shieldRefillAmount({ ownerHpDelta: 100, ownerVampHeal: 70 }, 60, true)).toBe(70);
  });
  it('shieldRefillAmount adds ownerShieldRefill (null = 0)', () => {
    expect(shieldRefillAmount({ ownerHpDelta: 100, ownerVampHeal: 0, ownerShieldRefill: 25 }, 100, false)).toBe(25);
    expect(shieldRefillAmount({ ownerHpDelta: 100, ownerVampHeal: 0, ownerShieldRefill: null }, 100, false)).toBe(0);
  });
  it('regenShieldRefillAmount: whole regen when always, else overflow', () => {
    expect(regenShieldRefillAmount(50, 20, true)).toBe(50);
    expect(regenShieldRefillAmount(50, 20, false)).toBe(30);
  });
});

describe('heal budget (L1085900-1085969)', () => {
  it('createHealBudget: max(0, maxHp * pct / 100), perMs = remaining / 1000', () => {
    expect(createHealBudget(2000, 50)).toEqual({ remaining: 1000, perMs: 1, max: 1000 });
    expect(createHealBudget(2000, -10)).toEqual({ remaining: 0, perMs: 0, max: 0 });
  });
  it('refillHealBudget: adds perMs * dt, capped at max, mutates in place', () => {
    const b = { remaining: 100, perMs: 2, max: 1000 };
    expect(refillHealBudget(b, 100)).toBeUndefined();
    expect(b.remaining).toBe(300);
    refillHealBudget(b, 1e6);
    expect(b.remaining).toBe(1000);
  });
  it('spendHealBudget: grants min(want, floor(remaining)) and deducts', () => {
    const b = { remaining: 10.7, perMs: 0, max: 20 };
    expect(spendHealBudget(b, 4)).toBe(4);
    expect(b.remaining).toBeCloseTo(6.7, 10);
    expect(spendHealBudget(b, 50)).toBe(6); // floor(6.7)
    expect(b.remaining).toBeCloseTo(0.7, 10);
    expect(spendHealBudget(b, 5)).toBe(0); // floor(0.7) = 0, nothing deducted
    expect(b.remaining).toBeCloseTo(0.7, 10);
  });
  it('spendHealBudget: want <= 0 grants 0; a missing budget grants everything wanted', () => {
    expect(spendHealBudget({ remaining: 99, perMs: 0, max: 99 }, 0)).toBe(0);
    expect(spendHealBudget({ remaining: 99, perMs: 0, max: 99 }, -3)).toBe(0);
    expect(spendHealBudget(undefined, 42)).toBe(42);
    expect(spendHealBudget(null, 0)).toBe(0);
  });
});
