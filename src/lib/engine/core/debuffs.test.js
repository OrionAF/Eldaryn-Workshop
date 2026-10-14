import { describe, it, expect } from 'vitest';
import { scripted } from '../rng.js';
import {
  DEBUFF_TYPES, initDebuffState, applyDebuff, processDebuffsTick, computeDebuffModifiers,
  critDownChance, slowedAttackSpeed, hasActiveDebuffs, getBleedStacks, hasWoundDebuff,
  snapshotAtInstanceCadence,
} from './debuffs.js';

const bleed = ({ config, ...over } = {}) => ({
  type: 'BLEED',
  config: { durationMs: 8000, maxStacks: 3, tickIntervalMs: 2000, ...config },
  damagePerTickFlat: 100,
  critChance: 0,
  source: 'hemorrhage',
  ...over,
});

describe('applyDebuff: new debuff (L1093377-1093652)', () => {
  it('starts at 1 stack with a timer, one stackDamage, default crit mult 1.5', () => {
    const s = initDebuffState();
    const e = applyDebuff(s, bleed(), 1000);
    expect(e).toEqual({
      timestamp: 1000, type: 'debuff_applied', value: 0, stacks: 1, maxStacks: 3,
      damagePerTick: 100, permanent: false, source: 'hemorrhage',
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({
      type: 'BLEED', stacks: 1, maxStacks: 3, remainingMs: 8000, isPermanent: false,
      regenReductionPercent: 0, damagePerTickFlat: 100, stackDamages: [100],
      tickIntervalMs: 2000, nextTickIn: 2000, critChance: 0, critMult: 1.5,
    });
    expect(s[0].partyFeeders).toBeUndefined();
  });
  it('durationMs 0 is permanent: Infinity timer', () => {
    const s = initDebuffState();
    const e = applyDebuff(s, bleed({ config: { durationMs: 0, maxStacks: 8 } }), 0);
    expect(e.permanent).toBe(true);
    expect(s[0].remainingMs).toBe(Infinity);
    expect(s[0].isPermanent).toBe(true);
  });
  it('non-DoT debuffs: WOUND keeps the regen cut, SLOW / CRIT_DOWN keep their fields only when set', () => {
    const s = initDebuffState();
    applyDebuff(s, { type: 'WOUND', config: { durationMs: 8000, maxStacks: 1, regenReductionPercent: 60 } }, 0);
    applyDebuff(s, { type: 'SLOW', config: { durationMs: 5000, maxStacks: 1, attackSpeedReductionPercent: 20 } }, 0);
    expect(s[0]).toMatchObject({ regenReductionPercent: 60, stackDamages: [], tickIntervalMs: 0 });
    expect('attackSpeedReductionPercent' in s[0]).toBe(false);
    expect(s[1].attackSpeedReductionPercent).toBe(20);
    expect(s[1].regenReductionPercent).toBe(0);
  });
});

describe('applyDebuff: repeat application (L1093377-1093652)', () => {
  it('adds stacks to maxStacks, pushing each stackDamage; the event reports the summed damage', () => {
    const s = initDebuffState();
    applyDebuff(s, bleed({ damagePerTickFlat: 100 }), 0);
    const e2 = applyDebuff(s, bleed({ damagePerTickFlat: 150 }), 10);
    expect(e2).toMatchObject({ type: 'debuff_stack_added', stacks: 2, maxStacks: 3, damagePerTick: 250 });
    const e3 = applyDebuff(s, bleed({ damagePerTickFlat: 200 }), 20);
    expect(e3).toMatchObject({ stacks: 3, damagePerTick: 450 });
    expect(s[0].stackDamages).toEqual([100, 150, 200]);
    expect(s[0].damagePerTickFlat).toBe(200);
  });
  it('at the cap the oldest stackDamage is replaced and stacks stay', () => {
    const s = initDebuffState();
    for (const d of [100, 150, 200]) applyDebuff(s, bleed({ damagePerTickFlat: d }), 0);
    const e = applyDebuff(s, bleed({ damagePerTickFlat: 300 }), 0);
    expect(s[0].stackDamages).toEqual([150, 200, 300]);
    expect(e).toMatchObject({ stacks: 3, damagePerTick: 650 });
  });
  it('refreshes the timer unless permanent', () => {
    const s = initDebuffState();
    applyDebuff(s, bleed(), 0);
    s[0].remainingMs = 1000;
    applyDebuff(s, bleed(), 0);
    expect(s[0].remainingMs).toBe(8000);
    const p = initDebuffState();
    applyDebuff(p, bleed({ config: { durationMs: 0, maxStacks: 8 } }), 0);
    applyDebuff(p, bleed({ config: { durationMs: 0, maxStacks: 8 } }), 0);
    expect(p[0].remainingMs).toBe(Infinity);
  });
  it('a debuff with no damagePerTick (WOUND) just adds a stack and leaves the tick fields alone', () => {
    const s = initDebuffState();
    const w = { type: 'WOUND', config: { durationMs: 8000, maxStacks: 2, regenReductionPercent: 60 } };
    applyDebuff(s, w, 0);
    const e = applyDebuff(s, w, 0);
    expect(e.stacks).toBe(2);
    expect(e.damagePerTick).toBeNaN(); // undefined damagePerTickFlat * stacks, as the client computes it
    expect(s[0].stackDamages).toEqual([]);
    expect(s[0].critMult).toBe(1.5);
  });
});

describe('applyDebuff: crusade party feeders (L1093035-1093239)', () => {
  const a = { type: 'BLEED', config: { durationMs: 8000, maxStacks: 3, tickIntervalMs: 2000 }, damagePerTickFlat: 100, source: 'a' };
  const b = { type: 'BLEED', config: { durationMs: 4000, maxStacks: 5, tickIntervalMs: 1000 }, damagePerTickFlat: 50, source: 'b' };
  it('a new debuff from a party slot starts a one-feeder list', () => {
    const s = initDebuffState();
    applyDebuff(s, a, 0, { partySlot: 1 });
    expect(s[0].partyFeeders).toEqual([{
      slot: 1, maxStacks: 3, isPermanent: false, remainingMs: 8000,
      regenReductionPercent: 0, attackSpeedReductionPercent: 0, critChanceReduction: 0,
    }]);
  });
  // slot 2 joins: instance maxStacks max(3,5)=5; remaining = longest live feeder = 8000 (not refreshed to 4000);
  // dpt rescaled to the instance cadence: round(50 * 2000 / 1000) = 100; stacks 2, stackDamages [100,100].
  it('a second feeder merges: max stacks, longest timer, damage rescaled to the instance cadence', () => {
    const s = initDebuffState();
    applyDebuff(s, a, 0, { partySlot: 1 });
    const e = applyDebuff(s, b, 0, { partySlot: 2 });
    expect(s[0].maxStacks).toBe(5);
    expect(s[0].remainingMs).toBe(8000);
    expect(s[0].partyFeeders).toHaveLength(2);
    expect(s[0].stackDamages).toEqual([100, 100]);
    expect(e).toMatchObject({ stacks: 2, maxStacks: 5, damagePerTick: 200 });
    expect(s[0].tickIntervalMs).toBe(2000);
  });
  it('the same slot re-applying refreshes only its own feeder and takes the damage unscaled', () => {
    const s = initDebuffState();
    applyDebuff(s, a, 0, { partySlot: 1 });
    s[0].partyFeeders[0].remainingMs = 500;
    s[0].remainingMs = 500;
    applyDebuff(s, a, 0, { partySlot: 1 });
    expect(s[0].partyFeeders[0].remainingMs).toBe(8000);
    expect(s[0].remainingMs).toBe(8000);
    expect(s[0].stackDamages).toEqual([100, 100]);
  });
  it('an instance that never ticked adopts the joining feeder cadence', () => {
    const s = initDebuffState();
    const noTick = { ...a, config: { durationMs: 8000, maxStacks: 3 } };
    applyDebuff(s, noTick, 0, { partySlot: 1 });
    applyDebuff(s, { ...b, config: { durationMs: 8000, maxStacks: 3, tickIntervalMs: 1500 } }, 0, { partySlot: 2 });
    expect(s[0].tickIntervalMs).toBe(1500);
    expect(s[0].nextTickIn).toBe(1500);
  });
  it('a permanent feeder makes the whole instance permanent', () => {
    const s = initDebuffState();
    applyDebuff(s, a, 0, { partySlot: 1 });
    applyDebuff(s, { ...b, config: { durationMs: 0, maxStacks: 3, tickIntervalMs: 2000 } }, 0, { partySlot: 2 });
    expect(s[0].isPermanent).toBe(true);
    expect(s[0].remainingMs).toBe(Infinity);
  });
  it('snapshotAtInstanceCadence: equal cadences or non-positive inputs pass dpt through; min 1', () => {
    const inst = { tickIntervalMs: 2000 };
    expect(snapshotAtInstanceCadence(inst, { damagePerTickFlat: 50, config: { tickIntervalMs: 2000 } })).toBe(50);
    expect(snapshotAtInstanceCadence(inst, { damagePerTickFlat: 0, config: { tickIntervalMs: 1000 } })).toBe(0);
    expect(snapshotAtInstanceCadence(inst, { damagePerTickFlat: 1, config: { tickIntervalMs: 8000 } })).toBe(1); // round(0.25)=0 -> 1
  });
});

describe('processDebuffsTick (L1093653-1093868)', () => {
  const twoStacks = () => {
    const s = initDebuffState();
    applyDebuff(s, bleed({ damagePerTickFlat: 100 }), 0);
    applyDebuff(s, bleed({ damagePerTickFlat: 150 }), 0);
    return s;
  };
  it('counts nextTickIn down; due at 0; deals sum(stackDamages); no rng draw without critChance', () => {
    const s = twoStacks();
    const rng = scripted([]);
    let r = processDebuffsTick(s, 1000, 1000, rng);
    expect(r.targetHpDelta).toBe(0);
    expect(r.events).toEqual([]);
    expect(s[0].nextTickIn).toBe(1000);
    r = processDebuffsTick(s, 1000, 2000, rng);
    expect(r.targetHpDelta).toBe(-250);
    expect(r.events).toEqual([{
      timestamp: 2000, type: 'debuff_tick', value: 250, stacks: 2, maxStacks: 3,
      damagePerTick: 250, permanent: false, source: 'hemorrhage',
    }]);
    expect(s[0].nextTickIn).toBe(2000); // 0 + 2000
    expect(s[0].remainingMs).toBe(6000);
    expect(rng.draws).toBe(0);
  });
  it('a long dt ticks once only (no catch-up): nextTickIn 2000 - 5000 + 2000 = -1000', () => {
    const s = twoStacks();
    const r = processDebuffsTick(s, 5000, 0, scripted([]));
    expect(r.events).toHaveLength(1);
    expect(s[0].nextTickIn).toBe(-1000);
  });
  it('tick crit: one draw, rng*100 < critChance -> floor(sum * critMult)', () => {
    const s = twoStacks();
    s[0].critChance = 30;
    s[0].nextTickIn = 0;
    const rng = scripted([0.29]); // 29 < 30
    const r = processDebuffsTick(s, 1, 0, rng);
    expect(r.targetHpDelta).toBe(-375); // floor(250 * 1.5)
    expect(r.events[0]).toMatchObject({ value: 375, isCrit: true });
    expect(rng.draws).toBe(1);
  });
  it('no crit when the draw is not below critChance', () => {
    const s = twoStacks();
    s[0].critChance = 30;
    s[0].nextTickIn = 0;
    const rng = scripted([0.3]); // 30 < 30 is false
    const r = processDebuffsTick(s, 1, 0, rng);
    expect(r.events[0].value).toBe(250);
    expect('isCrit' in r.events[0]).toBe(false);
    expect(rng.draws).toBe(1);
  });
  it('uses damagePerTickFlat * stacks when there are no stackDamages', () => {
    const s = twoStacks();
    s[0].stackDamages = [];
    s[0].nextTickIn = 0;
    expect(processDebuffsTick(s, 1, 0, scripted([])).targetHpDelta).toBe(-300); // 150 * 2
  });
  it('expiry removes by swapping with the last entry (iteration runs last to first)', () => {
    const s = initDebuffState();
    applyDebuff(s, { type: 'WOUND', config: { durationMs: 8000, maxStacks: 1 } }, 0);
    applyDebuff(s, { type: 'SLOW', config: { durationMs: 500, maxStacks: 1, attackSpeedReductionPercent: 10 } }, 0);
    applyDebuff(s, { type: 'CRIT_DOWN', config: { durationMs: 8000, maxStacks: 1, critChanceReduction: 5 } }, 0);
    const r = processDebuffsTick(s, 1000, 7, scripted([]));
    expect(s.map((d) => d.type)).toEqual(['WOUND', 'CRIT_DOWN']);
    expect(r.events).toEqual([expect.objectContaining({ type: 'debuff_expired', timestamp: 7 })]);
    expect(r.debuffModifiers).toEqual({ regenReductionPercent: 0, critChanceReduction: 5 });
  });
  it('permanent debuffs never expire; non-DoT types never tick', () => {
    const s = initDebuffState();
    applyDebuff(s, bleed({ config: { durationMs: 0, maxStacks: 8 } }), 0);
    applyDebuff(s, { type: 'WOUND', config: { durationMs: 8000, maxStacks: 1, tickIntervalMs: 1000 }, damagePerTickFlat: 50 }, 0);
    const r = processDebuffsTick(s, 100000, 0, scripted([]));
    expect(s.map((d) => d.type)).toEqual(['BLEED']);
    expect(r.events.map((e) => e.type).sort()).toEqual(['debuff_expired', 'debuff_tick']);
  });
  it('party feeder timers run with the tick, permanent feeders do not', () => {
    const s = initDebuffState();
    const spec = { type: 'BLEED', config: { durationMs: 8000, maxStacks: 3, tickIntervalMs: 2000 }, damagePerTickFlat: 10 };
    applyDebuff(s, spec, 0, { partySlot: 1 });
    processDebuffsTick(s, 3000, 0, scripted([]));
    expect(s[0].partyFeeders[0].remainingMs).toBe(5000);
  });
});

describe('computeDebuffModifiers (L1093240-1093371)', () => {
  it('WOUND sums to a cap of 100; SLOW to a cap of 50; CRIT_DOWN sums uncapped', () => {
    const state = [
      { type: DEBUFF_TYPES.WOUND, regenReductionPercent: 60 },
      { type: DEBUFF_TYPES.WOUND, regenReductionPercent: 70 },
      { type: DEBUFF_TYPES.SLOW, attackSpeedReductionPercent: 30 },
      { type: DEBUFF_TYPES.SLOW, attackSpeedReductionPercent: 30 },
      { type: DEBUFF_TYPES.CRIT_DOWN, critChanceReduction: 10 },
      { type: DEBUFF_TYPES.CRIT_DOWN, critChanceReduction: 15 },
    ];
    expect(computeDebuffModifiers(state)).toEqual({
      regenReductionPercent: 100, attackSpeedReductionPercent: 50, critChanceReduction: 25,
    });
  });
  it('regenReductionPercent is always present; the other two only when > 0', () => {
    expect(computeDebuffModifiers([])).toEqual({ regenReductionPercent: 0 });
    expect(computeDebuffModifiers([{ type: 'SLOW' }, { type: 'CRIT_DOWN' }])).toEqual({ regenReductionPercent: 0 });
  });
  it('is not scaled by stacks (a 3-stack WOUND still cuts 60)', () => {
    expect(computeDebuffModifiers([{ type: 'WOUND', regenReductionPercent: 60, stacks: 3 }]).regenReductionPercent).toBe(60);
  });
});

describe('critDownChance / slowedAttackSpeed / helpers (L1093869-1093990)', () => {
  const state = [
    { type: 'SLOW', attackSpeedReductionPercent: 25 },
    { type: 'CRIT_DOWN', critChanceReduction: 15 },
    { type: 'BLEED', stacks: 4 },
  ];
  it('slowedAttackSpeed = as * (1 - reduction/100)', () => {
    expect(slowedAttackSpeed(2, state)).toBe(1.5);
    expect(slowedAttackSpeed(2, [])).toBe(2);
    expect(slowedAttackSpeed(2, null)).toBe(2);
    expect(slowedAttackSpeed(2, [{ type: 'WOUND', regenReductionPercent: 50 }])).toBe(2);
  });
  it('critDownChance = max(0, chance - reduction)', () => {
    expect(critDownChance(40, state)).toBe(25);
    expect(critDownChance(10, state)).toBe(0);
    expect(critDownChance(40, [])).toBe(40);
  });
  it('hasActiveDebuffs, getBleedStacks, hasWoundDebuff', () => {
    expect(hasActiveDebuffs([])).toBe(false);
    expect(hasActiveDebuffs(state)).toBe(true);
    expect(getBleedStacks(state)).toBe(4);
    expect(getBleedStacks([])).toBe(0);
    expect(hasWoundDebuff(state)).toBe(false);
    expect(hasWoundDebuff([{ type: 'WOUND' }])).toBe(true);
  });
});
