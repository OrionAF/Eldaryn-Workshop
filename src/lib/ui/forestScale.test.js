import { it, expect } from 'vitest';
import { forestDomain, forestPos, forestTicks } from './forestScale.js';

it('domain covers zero and every interval, on round ticks', () => {
  const d = forestDomain([{ est: 6.8, lo: 5.9, hi: 7.7 }, { est: -1, lo: -3, hi: 1 }, null]);
  expect(d.min).toBeLessThanOrEqual(-3);
  expect(d.max).toBeGreaterThanOrEqual(7.7);
  expect(forestTicks(d)).toContain(0);
});

it('rows share one scale: same value, same position', () => {
  const d = forestDomain([{ est: 4, lo: 2, hi: 6 }, { est: -2, lo: -4, hi: 0 }]);
  expect(forestPos(2, d)).toBe(forestPos(2, d));
  expect(forestPos(d.min, d)).toBe(0);
  expect(forestPos(d.max, d)).toBe(100);
  expect(forestPos(0, d)).toBeGreaterThan(0);
  expect(forestPos(1e9, d)).toBe(100);
});

it('an all-zero or empty table still has a usable domain', () => {
  expect(forestDomain([])).toEqual({ min: -1, max: 1, step: 1 });
  expect(forestDomain([{ est: 0, lo: null, hi: null }])).toEqual({ min: -1, max: 1, step: 1 });
});
