import { describe, it, expect } from 'vitest';
import { holm, bonferroni } from './multiplicity.js';

describe('multiplicity', () => {
  it('Holm adjusts 11 equal p-values to 11 p', () => {
    const r = holm(Array(11).fill(0.004));
    r.adjusted.forEach((p) => expect(p).toBeCloseTo(0.044, 12));
    expect(r.reject.every(Boolean)).toBe(true);
    expect(holm(Array(11).fill(0.0046)).reject.some(Boolean)).toBe(false);
  });
  it('Holm step-down is monotone and keeps input order', () => {
    const r = holm([0.01, 0.04, 0.03, 0.005]);
    expect(r.adjusted.map((p) => +p.toFixed(6))).toEqual([0.03, 0.06, 0.06, 0.02]);
    expect(r.reject).toEqual([true, false, false, true]);
    expect(r.alphaEach).toEqual([0.05 / 3, 0.05, 0.05 / 2, 0.05 / 4]);
  });
  it('Bonferroni', () => {
    const r = bonferroni([0.01, 0.02, 0.5]);
    expect(r.adjusted).toEqual([0.03, 0.06, 1]);
    expect(r.reject).toEqual([true, false, false]);
    expect(r.alphaEach).toBeCloseTo(0.05 / 3, 12);
  });
});
