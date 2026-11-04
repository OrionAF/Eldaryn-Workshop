import { describe, it, expect } from 'vitest';
import data from '../../data/statPriority.json';
import { BASE_SHARE, coreScore, coreScoreBasis, statWeights } from './coreScore.js';
import { coreBaseBand } from '../game/petCores.js';
import { coreSecondaryRangePoints } from '../model/pets.js';

const band = coreBaseBand('LEGENDARY'); // 3 secondary slots
const top = (t) => coreSecondaryRangePoints(t).max;
const bottom = (t) => coreSecondaryRangePoints(t).min;
const core = (secondaries, base = 'max') => ({
  rarity: 'Legendary',
  baseAttack: band.attack[base],
  baseHp: band.hp[base],
  secondaries,
});
// A > B > C > D by weight
const weights = new Map([['ATTACK_PERCENT', 1], ['CRIT_CHANCE', 0.8], ['CRIT_DAMAGE', 0.6], ['HP_REGEN', 0]]);

describe('statWeights', () => {
  it('maps keep rates onto a fixed log scale: 2x is 1, drop odds 0.5, half 0, clamped beyond', () => {
    const w = statWeights({ stats: [{ type: 'A', keepRate: 4 }, { type: 'B', keepRate: 2 }, { type: 'C', keepRate: 1 }, { type: 'D', keepRate: Math.SQRT2 }, { type: 'E', keepRate: 0.5 }, { type: 'F', keepRate: 0.2 }] });
    expect(w.get('A')).toBe(1);
    expect(w.get('B')).toBeCloseTo(1);
    expect(w.get('C')).toBeCloseTo(0.5);
    expect(w.get('D')).toBeCloseTo(0.75);
    expect(w.get('E')).toBeCloseTo(0);
    expect(w.get('F')).toBe(0);
  });
  it('keeps a weak signal mild', () => {
    const w = statWeights({ stats: [{ type: 'A', keepRate: 1.1 }, { type: 'B', keepRate: 0.9 }] });
    expect(w.get('A') - w.get('B')).toBeLessThan(0.2);
  });
  it('is null without stats', () => {
    expect(statWeights(null)).toBeNull();
    expect(statWeights({ players: 0 })).toBeNull();
  });
});

describe('coreScore', () => {
  it('scores a core with the top stats at their ceilings and a max base as 1, grade S', () => {
    const s = coreScore(core([{ type: 'ATTACK_PERCENT', value: top('ATTACK_PERCENT') }, { type: 'CRIT_CHANCE', value: top('CRIT_CHANCE') }, { type: 'CRIT_DAMAGE', value: top('CRIT_DAMAGE') }]), weights);
    expect(s.roll).toBe(1);
    expect(s.fit).toBe(1);
    expect(s.score).toBe(1);
    expect(s.grade).toBe('S');
  });

  it('separates the picks from the dice: perfect rolls on a dead stat still lose fit', () => {
    const good = coreScore(core([{ type: 'ATTACK_PERCENT', value: bottom('ATTACK_PERCENT') }, { type: 'CRIT_CHANCE', value: bottom('CRIT_CHANCE') }, { type: 'CRIT_DAMAGE', value: bottom('CRIT_DAMAGE') }], 'min'), weights);
    const junk = coreScore(core([{ type: 'HP_REGEN', value: top('HP_REGEN') }]), weights);
    expect(good.roll).toBe(0);
    expect(good.fit).toBe(1);
    expect(good.score).toBeCloseTo((1 - BASE_SHARE) * 0.5);
    expect(junk.roll).toBe(1);
    expect(junk.fit).toBe(0);
    expect(junk.score).toBeCloseTo(BASE_SHARE);
    expect(good.score).toBeGreaterThan(junk.score);
  });

  it('counts an empty slot as nothing', () => {
    const full = coreScore(core([{ type: 'ATTACK_PERCENT', value: top('ATTACK_PERCENT') }, { type: 'CRIT_CHANCE', value: top('CRIT_CHANCE') }]), weights);
    expect(full.fit).toBeCloseTo(1.8 / 2.4);
  });

  it('rates the roll only without weights', () => {
    const s = coreScore(core([{ type: 'ATTACK_PERCENT', value: top('ATTACK_PERCENT') }], 'min'), null);
    expect(s.roll).toBeCloseTo(1 / 3);
    expect(s.fit).toBeNull();
    expect(s.grade).toBeNull();
    expect(s.secondaries[0].weight).toBeNull();
  });

  it('gives a stat outside the weights 0 and clamps an out-of-range roll', () => {
    const s = coreScore(core([{ type: 'MINION_ATTACK', value: 999 }]), weights);
    expect(s.secondaries[0]).toEqual({ type: 'MINION_ATTACK', roll: 1, weight: 0 });
  });
});

describe('coreScoreBasis', () => {
  it("picks the class's first spec and the bracket holding the level", () => {
    const b = coreScoreBasis(data, 'WARRIOR', 95);
    expect(b.specs.map((s) => s.spec)).toEqual(['WARRIOR_DPS', 'WARRIOR_TANK']);
    expect(b.spec.spec).toBe('WARRIOR_DPS');
    expect(b.bracket.key).toBe('90-100');
    expect(Math.max(...b.weights.values())).toBeGreaterThan(0.5);
  });
  it('honours a chosen spec of the class and ignores one of another class', () => {
    expect(coreScoreBasis(data, 'WARRIOR', 95, 'WARRIOR_TANK').spec.spec).toBe('WARRIOR_TANK');
    expect(coreScoreBasis(data, 'WARRIOR', 95, 'MYSTIC_MAGE').spec.spec).toBe('WARRIOR_DPS');
  });
  it('is null for an unknown class', () => {
    expect(coreScoreBasis(data, 'BARD', 50)).toBeNull();
  });
});
