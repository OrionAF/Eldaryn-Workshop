import { describe, it, expect } from 'vitest';
import {
  aggregate, blockText, parseLevelRange, playersIn, presetBrackets, priorityTies, rangeKey, scoreRange, scoreSpecRange,
} from './statPriority.js';

// Two-level toy spec: pool A, B, C, D; A kept far above odds, D far below.
const level = (n, obs, exp, tot, awk = {}) => ({ n, items: n * 9, obs, exp, awk, tot });
const DATA = {
  method: { STRONG_MIN: 1.15, AVOID_MAX: 0.75, NEAR_TIE: 1.1, SHRINK: 4, MIN_PLAYERS: 20, ATTUNEMENT_LEVEL: 19, BAN_SLOTS: { WARRIOR: 1 } },
  labels: { A: 'Attack %', B: 'Crit Chance', C: 'Block', D: 'Spell Resist' },
  softCaps: { A: null, B: 50, C: 40, D: 25 },
  pools: { WARRIOR: ['A', 'B', 'C', 'D'] },
  brackets: [[60, 69], [70, 79]],
  specs: [{ class: 'WARRIOR', className: 'Warrior', spec: 'WARRIOR_DPS', specName: 'Arms' }],
  levels: {
    WARRIOR_DPS: {
      64: level(10, [40, 20, 10, 2], [20, 20, 10, 10], [[30, 40], [10], [], []], { SHADOW: 3 }),
      74: level(15, [60, 30, 15, 1], [30, 30, 15, 15], [[50, 60, 70], [20, 22], [], []], { SHADOW: 2, LIGHT: 4 }),
    },
  },
};

describe('aggregate', () => {
  it('sums counts, expectations, totals and Awakening over the range only', () => {
    const agg = aggregate(DATA.levels.WARRIOR_DPS, 60, 69, 4);
    expect(agg.players).toBe(10);
    expect(agg.obs).toEqual([40, 20, 10, 2]);
    const both = aggregate(DATA.levels.WARRIOR_DPS, 60, 79, 4);
    expect(both.players).toBe(25);
    expect(both.obs[0]).toBe(100);
    expect(both.tot[0]).toEqual([30, 40, 50, 60, 70]);
    expect(both.awk).toEqual({ SHADOW: 5, LIGHT: 4 });
  });
});

describe('scoreRange', () => {
  const ctx = { labels: DATA.labels, softCaps: DATA.softCaps, shrink: 4, nearTie: 1.1, banSlots: 1 };
  const agg = aggregate(DATA.levels.WARRIOR_DPS, 60, 79, 4);
  const b = scoreRange(agg, DATA.pools.WARRIOR, ctx);

  it('puts every stat in exactly one list, split at ×1', () => {
    expect(b.priority).toEqual(['A']);
    expect(b.ban).toEqual(['D']);
    expect([...b.priority, ...b.ban, ...b.belowOdds].sort()).toEqual(['A', 'B', 'C', 'D']);
    for (const t of b.belowOdds) expect(b.stats.find((s) => s.type === t).keepRate).toBeLessThanOrEqual(1);
  });

  it('shrinks keep rates toward ×1 and reads the median sheet total', () => {
    const a = b.stats.find((s) => s.type === 'A');
    expect(a.keepRate).toBeCloseTo((100 + 4) / (50 + 4), 3);
    expect(a.median).toBe(50);
    expect(b.awakening).toEqual({ path: 'Shadow', count: 5, of: 9 });
  });
});

describe('priorityTies', () => {
  it('ties against the first stat of the group, so ties cannot chain past 10%', () => {
    const kr = [2, 1.9, 1.85, 1.75].map((keepRate) => ({ keepRate }));
    // 1.75 is within 10% of its neighbour 1.85 but not of 2, the group's first: a new group
    expect(priorityTies(kr, 1.1)).toEqual([false, true, true, false]);
  });
});

describe('level ranges', () => {
  it('parses one level or a range and orders and clamps it', () => {
    expect(parseLevelRange('74')).toEqual([74, 74]);
    expect(parseLevelRange(' 64 - 60 ')).toEqual([60, 64]);
    expect(parseLevelRange('60 to 140')).toEqual([60, 100]);
    expect(parseLevelRange('sixty')).toBeNull();
    expect(rangeKey([74, 74])).toBe('74');
    expect(rangeKey([60, 64])).toBe('60-64');
  });

  it('scores any range the way the presets are scored', () => {
    const presets = presetBrackets(DATA, 'WARRIOR_DPS');
    expect(presets.map((p) => p.key)).toEqual([]); // both brackets are under MIN_PLAYERS
    const custom = scoreSpecRange(DATA, 'WARRIOR_DPS', 60, 79);
    expect(custom.players).toBe(25);
    expect(scoreSpecRange(DATA, 'WARRIOR_DPS', 1, 10).players).toBe(0);
    expect(playersIn(DATA, 'WARRIOR_DPS', 70, 79)).toBe(15);
  });
});

describe('blockText', () => {
  it('writes the card in the shared text format', () => {
    const b = scoreSpecRange(DATA, 'WARRIOR_DPS', 60, 79);
    const text = blockText(DATA.labels, b).split('\n');
    expect(text[0]).toBe('Attack %');
    expect(text[1]).toBe('Avoid (block list): Spell Resist');
    expect(text).toContain('Awakening: Shadow (5 of 9)');
    expect(text.at(-1)).toBe('Typical: Attack 50%');
  });
});
