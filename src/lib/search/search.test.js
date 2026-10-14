import { describe, it, expect } from 'vitest';
import {
  subsetsUpTo, combinations, subsetCount, choose, topK, byScoreDesc, screenWithGroups, createEvalCache,
  createPacer, tieredBeamSearch, resolveBudget, DEFAULT_BUDGET, dedupeEquivalent,
} from './search.js';

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

describe('selection helpers', () => {
  it('topK orders by the comparator and is stable', () => {
    const items = [{ score: 1, id: 'a' }, { score: 3, id: 'b' }, { score: 3, id: 'c' }, { score: 2, id: 'd' }];
    expect(topK(items, 3, byScoreDesc).map((x) => x.id)).toEqual(['b', 'c', 'd']);
  });

  it('byScoreDesc falls back to tie only when the scores are equal', () => {
    expect(byScoreDesc({ score: 1, tie: 9 }, { score: 2, tie: 0 })).toBeGreaterThan(0);
    expect(byScoreDesc({ score: 1, tie: 9 }, { score: 1, tie: 0 })).toBeLessThan(0);
  });

  it('of two equally good records the one closer to the start comes first', () => {
    const items = [{ score: 5, dist: 3, id: 'far' }, { score: 5, dist: 1, id: 'near' }, { score: 6, dist: 9, id: 'best' }];
    expect(topK(items, 3, byScoreDesc).map((x) => x.id)).toEqual(['best', 'near', 'far']);
  });

  it('dedupeEquivalent keeps the first of each equivalence class and every record without one', () => {
    const items = [{ e: 'a', i: 1 }, { e: 'b', i: 2 }, { e: 'a', i: 3 }, { i: 4 }, { i: 5 }];
    expect(dedupeEquivalent(items, (x) => x.e).map((x) => x.i)).toEqual([1, 2, 4, 5]);
  });

  it('screenWithGroups keeps the top and the best of every group', () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => ({ v: 100 - i, g: 'big' })),
      { v: 1, g: 'rare' }, { v: 0.5, g: 'rare' },
    ];
    const kept = screenWithGroups(items, { value: (x) => x.v, group: (x) => x.g, keep: 3, perGroup: 1 });
    expect(kept.filter((x) => x.g === 'big')).toHaveLength(3);
    expect(kept.filter((x) => x.g === 'rare').map((x) => x.v)).toEqual([1]);
    expect(screenWithGroups(items, { value: (x) => x.v, keep: 50 })).toBe(items);
  });

  it('the cache is bounded, oldest out first', () => {
    const c = createEvalCache(2);
    c.set('a', 1); c.set('b', 2); c.set('c', 3);
    expect(c.has('a')).toBe(false);
    expect([c.get('b'), c.get('c'), c.size]).toEqual([2, 3, 2]);
  });

  it('resolveBudget fills defaults and ignores junk', () => {
    expect(resolveBudget()).toEqual(DEFAULT_BUDGET);
    const b = resolveBudget({ n1: 4.9, maxMs: -1, width: 'x', bogus: 1, minGain: 0 });
    expect(b.n1).toBe(4);
    expect(b.maxMs).toBe(DEFAULT_BUDGET.maxMs);
    expect(b.width).toBe(DEFAULT_BUDGET.width);
    expect(b.minGain).toBe(0);
    expect('bogus' in b).toBe(false);
  });
});

// A toy problem: states are integer vectors, one dimension per coordinate (+1 / -1 moves), score is
// minus the distance to a target. The beam must find the target; evaluate is counted per state.
function toy({ target = [3, -2, 4], ...opts } = {}) {
  const calls = new Map();
  const dist = (s) => s.reduce((a, x, i) => a + Math.abs(x - target[i]), 0);
  const search = (extra = {}) => tieredBeamSearch({
    start: [0, 0, 0],
    dimensions: [0, 1, 2].map((i) => ({
      id: `d${i}`,
      neighbours: (s) => [1, -1].map((d) => s.map((x, j) => (j === i ? x + d : x))),
    })),
    key: (s) => s.join(','),
    screen: (s) => -dist(s),
    evaluate: async (s) => {
      calls.set(s.join(','), (calls.get(s.join(',')) ?? 0) + 1);
      return { score: -dist(s) };
    },
    maxPasses: 12,
    ...opts,
    ...extra,
  });
  return { calls, search, dist };
}

describe('tieredBeamSearch', () => {
  it('reaches the optimum and evaluates every state at most once', async () => {
    const t = toy();
    const r = await t.search();
    expect(r.records.get(r.best).state).toEqual([3, -2, 4]);
    expect(r.aborted).toBe(false);
    expect(r.truncated).toBeNull();
    expect([...t.calls.values()].every((n) => n === 1)).toBe(true);
    expect(r.evals).toBe(t.calls.size);
  });

  it('always evaluates the start state and keeps it in the records', async () => {
    const t = toy({ target: [0, 0, 0] });
    const r = await t.search();
    expect(r.best).toBe('0,0,0');
    expect(r.records.has('0,0,0')).toBe(true);
    expect(r.passes).toBe(1); // nothing improved: no second pass
  });

  it('stops at maxEvals and says so', async () => {
    const t = toy();
    const r = await t.search({ maxEvals: 5 });
    expect(r.evals).toBe(5);
    expect(r.truncated).toBe('evals');
  });

  it('stops at the deadline', async () => {
    const t = toy();
    const r = await t.search({ deadline: Date.now() - 1 });
    expect(r.evals).toBe(1); // the start state only
    expect(r.truncated).toBe('time');
  });

  it('the screen prunes big neighbour sets but screenWithGroups keeps a group the screen dislikes', async () => {
    const seen = [];
    const r = await tieredBeamSearch({
      start: 'S',
      dimensions: [{ id: 'd', neighbours: () => ['a', 'b', 'c', 'd', 'x'] }],
      key: (s) => s,
      screen: (s) => ({ a: 5, b: 4, c: 3, d: 2, x: -100, S: 0 })[s],
      group: (s) => (s === 'x' ? 'odd' : 'main'),
      evaluate: async (s) => { seen.push(s); return { score: s === 'x' ? 10 : 1 }; },
      screenKeep: 2, perGroup: 1, maxPasses: 1,
    });
    expect(seen.sort()).toEqual(['S', 'a', 'b', 'x']);
    expect(r.records.get(r.best).state).toBe('x');
    expect(r.screened).toBe(5);
  });

  it('equivalent states are not expanded twice: the beam holds one state per equivalence class', async () => {
    // States 1 and 2 are the same build in effect (same equiv); only the nearer (1) may be expanded.
    const expanded = [];
    await tieredBeamSearch({
      start: 0,
      dimensions: [{ id: 'd', neighbours: (s) => { expanded.push(s); return s === 0 ? [1, 2] : s === 1 ? [10] : s === 2 ? [20] : []; } }],
      key: String,
      evaluate: async (s) => ({ score: s === 0 ? 0 : 5, dist: s, equiv: s === 0 ? 'zero' : 'five' }),
      width: 2, maxPasses: 2, minGain: -1,
    });
    expect(expanded).toContain(1);
    expect(expanded).not.toContain(2);
  });

  it('abort (evaluate returning null) stops the search and flags it', async () => {
    let n = 0;
    const r = await tieredBeamSearch({
      start: 0,
      dimensions: [{ id: 'd', neighbours: (s) => [s + 1, s - 1] }],
      key: String,
      evaluate: async (s) => (++n > 2 ? null : { score: s }),
    });
    expect(r.aborted).toBe(true);
    expect(r.records.size).toBe(2);
  });

  it('an aborted signal is honoured through the pacer before any new evaluation', async () => {
    const ctl = new AbortController();
    const t = toy();
    const r = await t.search({
      pacer: createPacer({ signal: ctl.signal }),
      onProgress: (p) => { if (p.evals >= 3) ctl.abort(); },
    });
    expect(r.aborted).toBe(true);
    expect(r.evals).toBeLessThan(8);
  });

  it('width controls how many states expand: a narrow beam can miss what a wide one finds', async () => {
    // Score has a trap: moving to 1 looks best, but only 3 (reached via 2) reaches the big prize.
    const score = (s) => ({ 0: 0, 1: 5, 2: 1, 3: 100 })[s] ?? -1;
    const run = (width) => tieredBeamSearch({
      start: 0,
      dimensions: [{ id: 'd', neighbours: (s) => (s === 0 ? [1, 2] : s === 2 ? [3] : []) }],
      key: String, evaluate: async (s) => ({ score: score(s) }), width, maxPasses: 2, minGain: -1,
    });
    expect((await run(1)).records.has('3')).toBe(false);
    expect((await run(2)).records.has('3')).toBe(true);
  });
});
