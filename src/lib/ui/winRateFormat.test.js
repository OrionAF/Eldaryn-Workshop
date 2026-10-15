import { describe, it, expect } from 'vitest';
import { triesPerClear } from './winRateFormat.js';

describe('triesPerClear', () => {
  it('prints one decimal below 10 tries', () => {
    expect(triesPerClear(0.7)).toBe('about 1.4 tries per clear');
    expect(triesPerClear(0.95)).toBe('about 1.1 tries per clear');
    expect(triesPerClear(0.2)).toBe('about 5.0 tries per clear');
  });
  it('prints a whole number from 10 tries up', () => {
    expect(triesPerClear(0.1)).toBe('about 10 tries per clear');
    expect(triesPerClear(0.03)).toBe('about 33 tries per clear');
  });
  it('does not print 10.0 at the boundary', () => {
    expect(triesPerClear(1 / 9.97)).toBe('about 10 tries per clear');
  });
  it('handles the ends and non-rates', () => {
    expect(triesPerClear(1)).toBe('clears every try');
    expect(triesPerClear(0)).toBe('no clears');
    expect(triesPerClear(null)).toBe('');
    expect(triesPerClear(NaN)).toBe('');
    expect(triesPerClear(1.2)).toBe('');
  });
});
