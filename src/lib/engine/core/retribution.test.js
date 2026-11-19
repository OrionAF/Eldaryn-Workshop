import { describe, it, expect } from 'vitest';
import {
  RETRIBUTION_KIND, retributionStepPercent, retributionStacks, retributionBonusPercent, retributionMultiplier,
  applyRetribution, retributionFullBlockReflect, resolveRetributionKind, createRetributionState,
} from './retribution.js';

const { JUGGERNAUT, DRUID } = RETRIBUTION_KIND;

describe('Retribution ramp (combat-pve.md §23)', () => {
  it('stacks: 0 before 10 s, 1 at 10 s, +1 every 5 s, no cap', () => {
    expect(retributionStacks(0)).toBe(0);
    expect(retributionStacks(9999)).toBe(0);
    expect(retributionStacks(10000)).toBe(1);
    expect(retributionStacks(14999)).toBe(1);
    expect(retributionStacks(15000)).toBe(2);
    expect(retributionStacks(130000)).toBe(25);
    expect(retributionStacks(1_000_000)).toBe(199);
    expect(retributionStacks(NaN)).toBe(0);
  });
  it('step percent: Juggernaut 50 (also the default), Druid 40', () => {
    expect(retributionStepPercent()).toBe(50);
    expect(retributionStepPercent(JUGGERNAUT)).toBe(50);
    expect(retributionStepPercent(DRUID)).toBe(40);
    expect(retributionBonusPercent(3, DRUID)).toBe(120);
    expect(retributionBonusPercent(-2)).toBe(0);
    expect(retributionMultiplier(15000, JUGGERNAUT)).toBe(2);
  });
  it('applyRetribution rounds thorns * (100 + bonus) / 100, and leaves 0 stacks or 0 thorns alone', () => {
    expect(applyRetribution(33, 1, JUGGERNAUT)).toBe(50); // 49.5 -> 50
    expect(applyRetribution(33, 1, DRUID)).toBe(46); // 46.2
    expect(applyRetribution(33, 0, JUGGERNAUT)).toBe(33);
    expect(applyRetribution(0, 5, JUGGERNAUT)).toBe(0);
  });
  it('full-block reflect from 25 stacks', () => {
    expect(retributionFullBlockReflect(24)).toBe(false);
    expect(retributionFullBlockReflect(25)).toBe(true);
  });
  it('createRetributionState starts the clock at 0', () => {
    expect(createRetributionState(DRUID)).toEqual({ kind: DRUID, elapsedMs: 0, reportedStacks: 0 });
  });
});

describe('resolveRetributionKind', () => {
  const owned = (species) => [{ species, level: 1 }];
  it('Warrior with Juggernaut Stance in the utility slot', () => {
    const state = { ownedSigils: owned('JUGGERNAUT_STANCE'), utilitySlotSpecies: 'JUGGERNAUT_STANCE' };
    expect(resolveRetributionKind(state, 'WARRIOR', 'WARRIOR_TANK')).toBe(JUGGERNAUT);
    expect(resolveRetributionKind(state, 'SENTINEL', null)).toBe(null);
  });
  it('Mystic Druid in Dire Ursine (bear) form; other forms and specs get none', () => {
    const state = { ownedSigils: owned('DIRE_URSINE'), druidUtilitySlotSpecies: 'DIRE_URSINE' };
    expect(resolveRetributionKind(state, 'MYSTIC', 'MYSTIC_DRUID')).toBe(DRUID);
    expect(resolveRetributionKind(state, 'MYSTIC', 'MYSTIC_MAGE')).toBe(null);
    expect(resolveRetributionKind({ ownedSigils: [], druidUtilitySlotSpecies: 'DIRE_URSINE' }, 'MYSTIC', 'MYSTIC_DRUID')).toBe(null);
    expect(resolveRetributionKind(null, 'MYSTIC', 'MYSTIC_DRUID')).toBe(null);
  });
});
