import { describe, it, expect } from 'vitest';
import { searchCutoffMs, priorReserve, SEARCH_SHARE, RESERVE_SAFETY, PRIOR, effortScale } from './costModel.js';

describe('searchCutoffMs (simulation.md §Time budget)', () => {
  const budgetMs = 300_000;
  const at = (o) => searchCutoffMs({ budgetMs, elapsedMs: 60_000, fights: 600_000, searchFights: 500_000, reserve: { fixed: 0, ratio: 0 }, ...o });

  it('before any fight is measured, the search gets the least share', () => {
    expect(at({ fights: 0 })).toBe(budgetMs * SEARCH_SHARE.min);
    expect(at({ elapsedMs: 0 })).toBe(budgetMs * SEARCH_SHARE.min);
  });

  it('keeps back the predicted later time at the measured speed, padded', () => {
    // 10 fights/ms; later = 200 000 + 0.1 x 500 000 = 250 000 fights = 25 000 ms, x safety
    const r = at({ reserve: { fixed: 200_000, ratio: 0.1 } });
    expect(r).toBeCloseTo(budgetMs - 25_000 * RESERVE_SAFETY, 6);
  });

  it('stays inside the share bounds', () => {
    expect(at({ reserve: { fixed: 0, ratio: 0 } })).toBe(budgetMs * SEARCH_SHARE.max);
    expect(at({ reserve: { fixed: 1e12, ratio: 0 } })).toBe(budgetMs * SEARCH_SHARE.min);
  });

  it('a longer search keeps back more (later grows with the search)', () => {
    const r = { fixed: 0, ratio: 0.3 };
    expect(at({ searchFights: 2_000_000, reserve: r })).toBeLessThan(at({ searchFights: 200_000, reserve: r }));
  });
});

describe('priorReserve', () => {
  it('scales the fixed part by Effort, lanes and choice blocks; the ratio is the prior share', () => {
    const r = priorReserve('winrate', 'standard', 2, 3);
    expect(r.fixed).toBeCloseTo(PRIOR.winrate.later[1] * effortScale('quick', 'standard')[1] * 2 * 3, 6);
    expect(r.ratio).toBe(PRIOR.winrate.share[1]);
    expect(priorReserve('unknown', 'quick', 1, 1)).toEqual(priorReserve('winrate', 'quick', 1, 1));
  });
});
