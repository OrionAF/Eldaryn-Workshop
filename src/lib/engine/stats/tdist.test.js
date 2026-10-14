import { describe, it, expect } from 'vitest';
import { tQuantile, tCrit, tCdf, zQuantile, zCrit, normCdf, incBeta, binomCdf, gammaQ } from './tdist.js';

describe('tdist', () => {
  it('t quantiles match published tables to 6 digits', () => {
    expect(tQuantile(0.975, 10)).toBeCloseTo(2.228139, 6);
    expect(tQuantile(0.995, 5)).toBeCloseTo(4.032143, 6);
    expect(tCrit(31)).toBeCloseTo(2.039513, 6);
    expect(tCrit(63)).toBeCloseTo(1.998341, 6);
    expect(tCrit(2)).toBeCloseTo(4.302653, 6);
    expect(tCrit(1, 0.01)).toBeCloseTo(63.656741, 4);
    expect(tQuantile(0.025, 10)).toBeCloseTo(-2.228139, 6);
    expect(tCrit(0)).toBe(Infinity);
  });
  it('t CDF inverts the quantile and tends to the normal', () => {
    for (const df of [1, 3, 31, 63, 500]) expect(tCdf(tQuantile(0.9, df), df)).toBeCloseTo(0.9, 10);
    expect(tCdf(2, 3)).toBeCloseTo(0.930337, 6);
    expect(tCrit(1e7)).toBeCloseTo(zCrit(), 5);
  });
  it('normal quantile and CDF', () => {
    expect(zQuantile(0.975)).toBeCloseTo(1.959964, 6);
    expect(zQuantile(0.999)).toBeCloseTo(3.090232, 6);
    expect(zQuantile(0.8)).toBeCloseTo(0.841621, 6);
    expect(normCdf(1.96)).toBeCloseTo(0.9750021, 7);
    expect(normCdf(-1.96)).toBeCloseTo(0.0249979, 7);
    expect(gammaQ(1, 2)).toBeCloseTo(Math.exp(-2), 12);
  });
  it('incomplete beta and binomial CDF agree with exact sums', () => {
    expect(incBeta(0.5, 2, 3)).toBeCloseTo(11 / 16, 12);
    expect(binomCdf(3, 10, 0.5)).toBeCloseTo(176 / 1024, 12);
    expect(binomCdf(-1, 10, 0.5)).toBe(0);
    expect(binomCdf(10, 10, 0.5)).toBe(1);
  });
});
