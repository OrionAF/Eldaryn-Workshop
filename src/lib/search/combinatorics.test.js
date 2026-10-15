import { describe, it, expect } from 'vitest';
import { subsetsUpTo, combinations, subsetCount, choose } from './combinatorics.js';

describe('combinatorics (salvaged from the legacy optimizer)', () => {
  it('subsetsUpTo lists every subset of size <= cap, empty included', () => {
    expect(subsetsUpTo(['a', 'b', 'c'], 2).map((s) => s.join('')).sort()).toEqual(['', 'a', 'ab', 'ac', 'b', 'bc', 'c']);
    expect(subsetsUpTo(['a'], 0)).toEqual([[]]);
  });

  it('subsetCount and choose match the enumeration', () => {
    for (const [n, k] of [[5, 2], [6, 3], [4, 4], [3, 5]]) {
      expect(subsetCount(n, k)).toBe(subsetsUpTo([...Array(n).keys()], k).length);
    }
    expect(choose(5, 2)).toBe(10);
    expect(choose(20, 4)).toBe(4845);
    expect(choose(3, 5)).toBe(0);
  });

  it('combinations returns exactly-k subsets, or the whole pool when it is smaller', () => {
    expect(combinations([1, 2, 3, 4], 2)).toHaveLength(6);
    expect(combinations([1, 2], 4)).toEqual([[1, 2]]);
    expect(combinations(Array.from({ length: 20 }, (_, i) => i), 4)).toHaveLength(4845);
  });
});
