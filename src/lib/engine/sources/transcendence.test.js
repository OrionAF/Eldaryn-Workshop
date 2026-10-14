import { describe, it, expect } from 'vitest';
import { calculateTranscendenceBonuses } from './transcendence.js';
import { transcendenceBoardForSpec, TRANSCENDENCE_BOARDS } from '../../game/transcendence.js';
import { ZERO_BONUS_KEYS } from './talents.js';

const nz = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0));

describe('calculateTranscendenceBonuses', () => {
  it('null board or no ids gives the 26-key zero bundle', () => {
    expect(Object.keys(calculateTranscendenceBonuses(['n_0,-1'], null))).toHaveLength(26);
    expect(nz(calculateTranscendenceBonuses([], transcendenceBoardForSpec('WARRIOR_DPS')))).toEqual({});
  });
  it('Warrior board: sums nodes, skips core and unknown ids', () => {
    const b = transcendenceBoardForSpec('WARRIOR_TANK');
    expect(nz(calculateTranscendenceBonuses(['core', 'n_0,-1', 'n_-1,-2', 'n_0,-2', 'nope'], b))).toEqual({
      hpPercent: 1, damageReductionFlat: 0.4, attackPercent: 0.8,
    });
  });
  it('Sentinel board', () => {
    expect(nz(calculateTranscendenceBonuses(['n_-1,-2', 'n_0,-2'], transcendenceBoardForSpec('SENTINEL_DISRUPTION')))).toEqual({
      missChanceFlat: 0.8, attackPercent: 0.8,
    });
  });
  it('Deathlord board carries minion stats and dominion', () => {
    const b = transcendenceBoardForSpec('NECROMANCER_DEATHLORD');
    expect(nz(calculateTranscendenceBonuses(['n_0,-1', 'n_-1,-2', 'n_0,-2'], b))).toEqual({
      minionHealthPercent: 1.5, hpPercent: 1, dominionFlat: 1,
    });
  });
  it('Mage vs Doomweaver vs Druid boards differ', () => {
    const ids = ['n_-1,-2'];
    expect(nz(calculateTranscendenceBonuses(ids, transcendenceBoardForSpec('MYSTIC_MAGE')))).toEqual({ hpRegenFlat: 0.6 });
    expect(nz(calculateTranscendenceBonuses(ids, transcendenceBoardForSpec('NECROMANCER_DOOMWEAVER')))).toEqual({ hpRegenFlat: 0.6 });
    expect(nz(calculateTranscendenceBonuses(ids, transcendenceBoardForSpec('MYSTIC_DRUID')))).toEqual({ damageReductionFlat: 0.4 });
  });
  it('allocating a whole board only touches known keys', () => {
    for (const b of Object.values(TRANSCENDENCE_BOARDS)) {
      const r = calculateTranscendenceBonuses(b.nodes.map((n) => n.id), b);
      expect(Object.keys(r).sort()).toEqual([...ZERO_BONUS_KEYS].sort());
      expect(Object.values(r).every(Number.isFinite)).toBe(true);
    }
  });
});
