import { it, expect } from 'vitest';
import { isAdjacent, canUnlock, reachableFrom, costForCount, costForSigil, totalIchorSpent } from './transcendence.js';

const TREE = {
  startPosition: '2:2',
  nodes: [
    { position: '2:2', type: 'common', category: 'offense', stats: [{ statKey: 'attack_pct', value: 0.8 }] },
    { position: '2:1', type: 'common', category: 'offense', stats: [{ statKey: 'attack_pct', value: 0.8 }] },
    { position: '2:3', type: 'uncommon', category: 'offense', stats: [{ statKey: 'attack_pct', value: 1.6 }, { statKey: 'lifesteal', value: 1 }] },
    { position: '1:2', type: 'glyph', category: 'glyph', stats: [] },
    { position: '3:2', type: 'sigil', category: 'sigil', stats: [] },
    { position: '3:3', type: 'common', category: 'defense', stats: [{ statKey: 'health_pct', value: 1 }] },
    { position: '2:4', type: 'common', category: 'defense', stats: [{ statKey: 'health_pct', value: 1 }] },
  ],
};

it('isAdjacent accepts only orthogonal, distance-1 neighbors', () => {
  expect(isAdjacent('2:2', '2:1')).toBe(true);
  expect(isAdjacent('2:2', '3:2')).toBe(true);
  expect(isAdjacent('2:2', '3:3')).toBe(false); // diagonal
  expect(isAdjacent('2:2', '2:4')).toBe(false); // distance 2, skips 2:3
});

it('canUnlock allows the start position with nothing unlocked yet - it has no adjacency prerequisite', () => {
  expect(canUnlock('2:2', [], TREE)).toBe(true); // it's the start - the one node with no prerequisite
  expect(canUnlock('2:2', ['2:2'], TREE)).toBe(false); // already unlocked, no longer a valid target
});

it('canUnlock rejects every other position until the start is actually unlocked', () => {
  expect(canUnlock('2:1', [], TREE)).toBe(false); // adjacent to the start, but the start isn't unlocked yet
  expect(canUnlock('2:1', ['2:2'], TREE)).toBe(true); // now that the start is explicitly unlocked, its neighbor is too
  expect(canUnlock('3:3', ['2:2'], TREE)).toBe(false); // diagonal to the start, never adjacent
});

it('canUnlock rejects glyph sockets even when adjacent to an unlocked node', () => {
  expect(canUnlock('1:2', ['2:2'], TREE)).toBe(false);
});

it('canUnlock rejects already-unlocked positions and unknown positions', () => {
  expect(canUnlock('2:1', ['2:2', '2:1'], TREE)).toBe(false);
  expect(canUnlock('99:99', [], TREE)).toBe(false);
});

it('canUnlock treats Ancient Sigils as real, adjacency-gated nodes (not exempt like the start)', () => {
  expect(canUnlock('3:2', [], TREE)).toBe(false); // not the start, nothing unlocked yet
  expect(canUnlock('3:2', ['2:2'], TREE)).toBe(true); // adjacent to the now-unlocked start
});

it('reachableFrom BFS respects a walkable set and stops at its boundary', () => {
  const walkable = new Set(['2:2', '2:1', '2:3', '3:3']);
  const reached = reachableFrom('2:2', walkable, TREE);
  expect(reached.has('2:1')).toBe(true);
  expect(reached.has('2:3')).toBe(true);
  expect(reached.has('3:3')).toBe(true); // adjacent to 2:3, which is reachable from 2:2
  expect(reached.has('2:4')).toBe(false); // not in the walkable set at all
});

it('reachableFrom treats glyph sockets as impassable even if included in the walkable set', () => {
  // 2:4 is only reachable via 2:3 -> ... there's no direct link to 1:2 (glyph) in this fixture,
  // so instead verify glyphs never appear in walkableNeighbors by unlocking through one directly.
  const walkable = new Set(['2:2', '1:2']); // 1:2 is a glyph
  const reached = reachableFrom('2:2', walkable, TREE);
  expect(reached.has('1:2')).toBe(false); // glyph never counted as a walkable neighbor to traverse
});

it('costForCount follows the tiered table and applies the uncommon x3 multiplier', () => {
  expect(costForCount(1, false)).toBe(1);
  expect(costForCount(4, false)).toBe(1);
  expect(costForCount(5, false)).toBe(2);
  expect(costForCount(9, false)).toBe(2);
  expect(costForCount(10, false)).toBe(3);
  expect(costForCount(207, false)).toBe(80);
  expect(costForCount(5, true)).toBe(6); // uncommon at position 5 (tier cost 2) -> x3
});

it('costForSigil is the flat 30 Ichor cost', () => {
  expect(costForSigil()).toBe(30);
});

it('totalIchorSpent matches the in-game "5 nodes, 8 Ichor spent" example', () => {
  // 3 commons + 1 uncommon, all within the 1-4 tier, then a 5th common landing in the 5-9 tier:
  // 1 + 1 + 1 + (1*3) + 2 = 8
  const tree = {
    startPosition: '0:0',
    nodes: [
      { position: '0:0', type: 'common', stats: [] },
      { position: '0:1', type: 'common', stats: [] },
      { position: '0:2', type: 'common', stats: [] },
      { position: '0:3', type: 'uncommon', stats: [] },
      { position: '0:4', type: 'common', stats: [] },
    ],
  };
  const unlockOrder = ['0:0', '0:1', '0:2', '0:3', '0:4'];
  expect(totalIchorSpent(unlockOrder, tree)).toBe(8);
});

it('totalIchorSpent adds the flat sigil cost without advancing the tiered common/uncommon count', () => {
  const tree = {
    startPosition: '0:0',
    nodes: [
      { position: '0:0', type: 'common', stats: [] },
      { position: '0:1', type: 'sigil', stats: [] },
      { position: '0:2', type: 'common', stats: [] },
    ],
  };
  // common(1) + sigil(30, flat) + common(2nd tiered slot, still cost 1) = 1 + 30 + 1 = 32
  expect(totalIchorSpent(['0:0', '0:1', '0:2'], tree)).toBe(32);
});
