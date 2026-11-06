import { describe, it, expect } from 'vitest';
import { gearScore } from './gearScore.js';

const item = (secondaryStats, extra = {}) => ({ rarity: 'DIVINE', itemLevel: 100, primaryStats: { attack: 1, hp: 1 }, secondaryStats, conduit: null, ...extra });
// CRIT_CHANCE ceiling at L100 is the pool max, so a high value pins the roll at 1
const weights = new Map([
  ['CRIT_CHANCE', 1],
  ['ATTACK_PERCENT', 1],
  ['CRIT_DAMAGE', 1],
  ['HP_REGEN', 0],
]);

describe('gearScore', () => {
  it('is null without an item level or secondaries', () => {
    expect(gearScore(item([], {}), weights)).toBeNull();
    expect(gearScore(item([{ type: 'CRIT_CHANCE', value: 3 }], { itemLevel: null }), weights)).toBeNull();
    expect(gearScore(null, weights)).toBeNull();
  });

  it('rolls only, with no weights', () => {
    const s = gearScore(item([{ type: 'CRIT_CHANCE', value: 99 }]), null);
    expect(s).toMatchObject({ roll: 1, fit: null, score: null, grade: null });
  });

  it('three top-priority stats at their ceiling score 1 (S)', () => {
    const s = gearScore(item([{ type: 'CRIT_CHANCE', value: 99 }, { type: 'ATTACK_PERCENT', value: 99 }, { type: 'CRIT_DAMAGE', value: 9 }]), weights);
    expect(s.fit).toBe(1);
    expect(s.score).toBeCloseTo(1);
    expect(s.grade).toBe('S');
  });

  it('a stat the spec does not want earns nothing, and a low roll earns half', () => {
    const s = gearScore(item([{ type: 'HP_REGEN', value: 99 }, { type: 'CRIT_CHANCE', value: 0 }]), weights);
    expect(s.fit).toBeCloseTo(1 / 3);
    expect(s.score).toBeCloseTo(0.5 / 3);
    expect(s.secondaries.map((x) => x.weight)).toEqual([0, 1]);
  });

  it('rolls against the Oblivion item stat level (half the item level)', () => {
    const base = gearScore(item([{ type: 'CRIT_CHANCE', value: 4 }], { itemLevel: 200 }), null, 'base');
    const obl = gearScore(item([{ type: 'CRIT_CHANCE', value: 4 }], { itemLevel: 200 }), null, 'oblivion');
    expect(obl.roll).toBeGreaterThan(base.roll);
  });
});
