import { describe, it, expect } from 'vitest';
import { scripted } from '../rng.js';
import {
  applyDamageReduction, rollAttackDamage, rollPenetrationCritMult, rollDisruption,
  DISRUPTION_SILENCE_MS, STAGGER_STACKS_TO_STUN, STAGGER_STUN_MS, FEAR_DURATION_MS, PARALYZE_DURATION_MS,
} from './rolls.js';

describe('status constants (L1089570-1089584)', () => {
  it('match combat-pve.md §8.1', () => {
    expect([DISRUPTION_SILENCE_MS, STAGGER_STACKS_TO_STUN, STAGGER_STUN_MS, FEAR_DURATION_MS, PARALYZE_DURATION_MS])
      .toEqual([3000, 3, 2000, 1000, 1000]);
  });
});

describe('applyDamageReduction (L1085970-1085997)', () => {
  it('round(damage * (1 - dr/100)), min 1', () => {
    expect(applyDamageReduction(1000, 25)).toBe(750);
    expect(applyDamageReduction(101, 50)).toBe(51); // 50.5 rounds up
    expect(applyDamageReduction(1, 75)).toBe(1); // 0.25 -> 0 -> clamped to 1
  });
  it('dr <= 0 or damage <= 0 passes damage through unchanged', () => {
    expect(applyDamageReduction(500, 0)).toBe(500);
    expect(applyDamageReduction(500, -10)).toBe(500);
    expect(applyDamageReduction(0, 50)).toBe(0);
  });
});

describe('rollAttackDamage (L1085998-1086047)', () => {
  const e = { attack: 100, critChance: 30, critDamage: 2.5, doubleHit: 20 };
  // draws are rng()*100 compared with the chance: 0.29 -> 29 < 30 crit; 0.19 -> 19 < 20 double
  it('crit + double hit: 2 draws, damage = round(100 * 2.5) = 250, doubleHitDamage = attack', () => {
    const rng = scripted([0.29, 0.19]);
    expect(rollAttackDamage(e, rng)).toEqual({ damage: 250, isCrit: true, isDoubleHit: true, doubleHitDamage: 100 });
    expect(rng.draws).toBe(2);
  });
  it('no crit, no double hit: 0.30 -> 30 < 30 is false; 0.20 -> 20 < 20 false', () => {
    const rng = scripted([0.3, 0.2]);
    expect(rollAttackDamage(e, rng)).toEqual({ damage: 100, isCrit: false, isDoubleHit: false, doubleHitDamage: 0 });
    expect(rng.draws).toBe(2);
  });
  it('crit but no double hit', () => {
    const r = rollAttackDamage(e, scripted([0, 0.99]));
    expect(r).toEqual({ damage: 250, isCrit: true, isDoubleHit: false, doubleHitDamage: 0 });
  });
  it('doubleHit 0 consumes only 1 draw', () => {
    const rng = scripted([0.5]);
    expect(rollAttackDamage({ ...e, doubleHit: 0 }, rng).isDoubleHit).toBe(false);
    expect(rng.draws).toBe(1);
  });
  it('critChance 0 still consumes the crit draw', () => {
    const rng = scripted([0]);
    const r = rollAttackDamage({ attack: 10, critChance: 0, critDamage: 3, doubleHit: 0 }, rng);
    expect(r.isCrit).toBe(false);
    expect(rng.draws).toBe(1);
  });
  it('crit damage rounds: round(33 * 1.5) = 50 (49.5 up)', () => {
    expect(rollAttackDamage({ attack: 33, critChance: 100, critDamage: 1.5, doubleHit: 0 }, scripted([0])).damage).toBe(50);
  });
  it('draw order is crit first, double hit second', () => {
    // crit roll 0.99 misses, double-hit roll 0.0 hits: if the order were swapped this would differ
    const r = rollAttackDamage({ attack: 10, critChance: 5, critDamage: 2, doubleHit: 50 }, scripted([0.99, 0]));
    expect(r.isCrit).toBe(false);
    expect(r.isDoubleHit).toBe(true);
  });
});

describe('rollPenetrationCritMult (L1086048-1086072)', () => {
  it('critChance 0: no draw, mult 1', () => {
    const rng = scripted([]);
    expect(rollPenetrationCritMult({ critChance: 0, critDamage: 3 }, rng)).toBe(1);
    expect(rng.draws).toBe(0);
  });
  it('crit: one draw, returns critDamage', () => {
    const rng = scripted([0.1]);
    expect(rollPenetrationCritMult({ critChance: 20, critDamage: 2.4 }, rng)).toBe(2.4);
    expect(rng.draws).toBe(1);
  });
  it('no crit: one draw, returns 1 (0.2 -> 20 < 20 false)', () => {
    const rng = scripted([0.2]);
    expect(rollPenetrationCritMult({ critChance: 20, critDamage: 2.4 }, rng)).toBe(1);
    expect(rng.draws).toBe(1);
  });
});

describe('rollDisruption (L1086073-1086166)', () => {
  const mk = (effect, chance = 40) => ({ disruptionChance: chance, disruptionEffect: effect });
  const none = (s, st, f) => ({ procced: null, silencedMs: s, staggerStacks: st, fearedMs: f, staggerStunned: false });

  it('chance <= 0: no draw, state echoed', () => {
    const rng = scripted([]);
    expect(rollDisruption(mk('SILENCE', 0), 0, 1, 0, rng)).toEqual(none(0, 1, 0));
    expect(rng.draws).toBe(0);
  });
  it('SILENCE already active: no draw', () => {
    const rng = scripted([]);
    expect(rollDisruption(mk('SILENCE'), 500, 0, 0, rng)).toEqual(none(500, 0, 0));
    expect(rng.draws).toBe(0);
  });
  it('FEAR already active: no draw', () => {
    const rng = scripted([]);
    expect(rollDisruption(mk('FEAR'), 0, 0, 300, rng)).toEqual(none(0, 0, 300));
    expect(rng.draws).toBe(0);
  });
  it('SILENCE is not blocked by an active fear (and vice versa); STAGGER ignores both', () => {
    expect(rollDisruption(mk('SILENCE'), 0, 0, 800, scripted([0])).procced).toBe('SILENCE');
    expect(rollDisruption(mk('FEAR'), 800, 0, 0, scripted([0])).procced).toBe('FEAR');
    expect(rollDisruption(mk('STAGGER'), 800, 0, 800, scripted([0])).procced).toBe('STAGGER');
  });
  it('miss: one draw at or above the chance (0.4 -> 40 >= 40)', () => {
    const rng = scripted([0.4]);
    expect(rollDisruption(mk('SILENCE'), 0, 2, 0, rng)).toEqual(none(0, 2, 0));
    expect(rng.draws).toBe(1);
  });
  it('SILENCE proc sets silencedMs 3000', () => {
    const rng = scripted([0.39]);
    expect(rollDisruption(mk('SILENCE'), 0, 1, 0, rng)).toEqual({ procced: 'SILENCE', silencedMs: 3000, staggerStacks: 1, fearedMs: 0, staggerStunned: false });
    expect(rng.draws).toBe(1);
  });
  it('FEAR proc sets fearedMs 1000', () => {
    expect(rollDisruption(mk('FEAR'), 0, 0, 0, scripted([0]))).toEqual({ procced: 'FEAR', silencedMs: 0, staggerStacks: 0, fearedMs: 1000, staggerStunned: false });
  });
  it('STAGGER: stacks 0 -> 1 -> 2, then the third proc stuns and resets to 0', () => {
    let r = rollDisruption(mk('STAGGER'), 0, 0, 0, scripted([0]));
    expect(r).toEqual({ procced: 'STAGGER', silencedMs: 0, staggerStacks: 1, fearedMs: 0, staggerStunned: false });
    r = rollDisruption(mk('STAGGER'), 0, r.staggerStacks, 0, scripted([0]));
    expect(r.staggerStacks).toBe(2);
    expect(r.staggerStunned).toBe(false);
    r = rollDisruption(mk('STAGGER'), 0, r.staggerStacks, 0, scripted([0]));
    expect(r).toEqual({ procced: 'STAGGER', silencedMs: 0, staggerStacks: 0, fearedMs: 0, staggerStunned: true });
  });
  it('unknown effect: draws, passes the roll, returns undefined', () => {
    const rng = scripted([0]);
    expect(rollDisruption(mk('BOGUS'), 0, 0, 0, rng)).toBeUndefined();
    expect(rng.draws).toBe(1);
  });
});
