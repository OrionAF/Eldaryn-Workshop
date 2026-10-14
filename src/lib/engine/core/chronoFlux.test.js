import { describe, it, expect } from 'vitest';
import {
  CHRONO_FLUX, CHRONO_FLUX_RECHARGE_FACTOR, chronoFluxGainDivisor, clampChronoFlux, chronoFluxFromEvents,
} from './chronoFlux.js';

const ev = (...types) => types.map((type) => ({ type }));

describe('constants (L1094180-1094183)', () => {
  it('bar max 7000, weights 1 / 0.7 / 0.7 / 1, recharge factor 3 (not 50)', () => {
    expect(CHRONO_FLUX).toEqual({ MAX: 7000, FLAME_HIT: 1, FLAME_BLOCKED: 0.7, EARTHEN_HIT: 0.7, EARTHEN_BLOCKED: 1 });
    expect(CHRONO_FLUX_RECHARGE_FACTOR).toBe(3);
  });
});

describe('chronoFluxGainDivisor (L1094006-1094020)', () => {
  it('3 ^ max(0, fireCount)', () => {
    expect([0, 1, 3].map(chronoFluxGainDivisor)).toEqual([1, 3, 27]);
    expect(chronoFluxGainDivisor(-2)).toBe(1);
  });
});

describe('clampChronoFlux (L1094039-1094065)', () => {
  it('clamps to 0..7000', () => {
    expect([clampChronoFlux(-5), clampChronoFlux(3500), clampChronoFlux(9000)]).toEqual([0, 3500, 7000]);
  });
});

describe('chronoFluxFromEvents (L1094066-1094178)', () => {
  const events = ev('attacker_hit', 'attacker_crit', 'defender_block', 'defender_hit', 'attacker_block', 'spell_cast');
  // flame 10, earthen 20:
  //   attacker_hit 10*1 + attacker_crit 10*1 + defender_block 10*0.7 = 27
  //   defender_hit 20*0.7 + attacker_block 20*1 = 34          -> 61
  it('per-event weights, one term per event type', () => {
    expect(chronoFluxFromEvents(events, 10, 20)).toBeCloseTo(61, 10);
  });
  // dark 5 raises both: flame 15, earthen 25
  //   15 + 15 + 10.5 = 40.5 ; 17.5 + 25 = 42.5                -> 83
  it('the Dark conduit adds to both flame and earthen', () => {
    expect(chronoFluxFromEvents(events, 10, 20, 5)).toBeCloseTo(83, 10);
  });
  it('divides by 3^fireCount', () => {
    expect(chronoFluxFromEvents(events, 10, 20, 0, 2)).toBeCloseTo(61 / 9, 10);
  });
  it('flame and earthen both <= 0 gives 0 (even with events)', () => {
    expect(chronoFluxFromEvents(events, 0, 0)).toBe(0);
    expect(chronoFluxFromEvents(events, -5, 0)).toBe(0);
  });
  it('a flame-only conduit counts earthen events at 0', () => {
    expect(chronoFluxFromEvents(ev('defender_hit', 'attacker_block'), 10, 0)).toBe(0);
    expect(chronoFluxFromEvents(ev('attacker_hit', 'defender_hit'), 10, 0)).toBe(10);
  });
  it('no events, or only unrelated ones, give 0', () => {
    expect(chronoFluxFromEvents([], 10, 10)).toBe(0);
    expect(chronoFluxFromEvents(ev('attacker_miss', 'defender_blind'), 10, 10)).toBe(0);
  });
});
