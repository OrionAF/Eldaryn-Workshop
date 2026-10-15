// U10: win-rate verdict, seat pooling and the fighters-as-simulated columns (features/duel.js).
import { describe, it, expect } from 'vitest';
import { newOpponent } from '../model/opponents.js';
import { opponentFighter, winRateVerdict, combineSeats, requiredStatsText, simulatedColumns, defaultedLabels } from './duel.js';

const sum = (k, n) => ({ p: k / n, lo: Math.max(0, k / n - 0.1), hi: Math.min(1, k / n + 0.1), n });

describe('winRateVerdict', () => {
  it('is favoured / unfavoured when the interval clears even, else carries nNeeded for the edge', () => {
    expect(winRateVerdict({ p: 0.6, lo: 0.55, hi: 0.65, n: 1600 }).verdict).toBe('better');
    expect(winRateVerdict({ p: 0.4, lo: 0.35, hi: 0.45, n: 1600 }).verdict).toBe('worse');
    const v = winRateVerdict({ p: 0.53, lo: 0.49, hi: 0.57, n: 800 });
    expect(v.verdict).toBe('unresolved');
    expect(v.nNeeded).toBeGreaterThan(800);
    expect(v.edgePts).toBeCloseTo(3, 5);
    expect(winRateVerdict({ p: 0.5, lo: 0.4, hi: 0.6, n: 0 })).toBeNull();
  });

  it('never promises fewer fights than already run', () => {
    expect(winRateVerdict({ p: 1, lo: 0.44, hi: 1, n: 3 }).nNeeded).toBeGreaterThan(3);
  });
});

describe('combineSeats', () => {
  it('pools both seats from my side with one Wilson interval over the total N', () => {
    const c = combineSeats(sum(70, 100), sum(50, 100));
    expect(c.n).toBe(200);
    expect(c.p).toBeCloseTo(0.6, 10);
    expect(c.lo).toBeLessThan(0.6);
    expect(c.hi).toBeGreaterThan(0.6);
    expect(c.hi - c.lo).toBeLessThan(0.2);
    expect(combineSeats(sum(70, 100), null)).toMatchObject({ n: 100 });
  });
});

describe('opponent text and columns', () => {
  it('requiredStatsText reads REQUIRED_STATS', () => {
    expect(requiredStatsText()).toBe('Needs: HP, Attack, Attack Speed');
  });

  it('simulatedColumns lists what the engine reads: x8 HP, defaulted keys marked, labels not keys', () => {
    const o = newOpponent('WARRIOR_DPS', 'Blank');
    o.sheet.values = { totalHp: 1000, totalAttack: 50, totalAttackSpeed: 1 };
    const theirs = opponentFighter(o);
    const mine = opponentFighter({ ...o, sheet: { values: { totalHp: 2000, totalAttack: 80, totalAttackSpeed: 1, totalCritChance: 0.25 } } });
    const rows = simulatedColumns(mine, theirs);
    const hp = rows.find((r) => r.key === 'totalHp');
    expect(hp.mine).toBe(16000);
    expect(hp.theirs).toBe(8000);
    expect(hp.label).toMatch(/Health/);
    expect(rows.find((r) => r.key === 'totalCritChance')).toMatchObject({ mineDefaulted: false, theirsDefaulted: true });
    expect(rows.find((r) => r.key === 'totalAttack')).toMatchObject({ mineDefaulted: false, theirsDefaulted: false });
    expect(defaultedLabels(['totalCritChance', 'totalBlockChance'])).toEqual(['Crit Chance', 'Block Chance']);
  });
});
