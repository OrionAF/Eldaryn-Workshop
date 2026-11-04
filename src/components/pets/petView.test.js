import { it, expect } from 'vitest';
import { viewCores } from './petView.js';

const c = (id, rarity, baseAttack, baseHp) => ({ id, rarity, baseAttack, baseHp });
const cores = [c('a', 'Rare', 100, 500), c('b', 'Mythic', 100, 300), c('c', 'Common', 300, 100), c('d', 'Rare', 50, 900)];
const ids = (l) => l.map((x) => x.id);

it('keeps insertion order for "added" and does not mutate the input', () => {
  expect(ids(viewCores(cores, 'added', 'all', new Set()))).toEqual(['a', 'b', 'c', 'd']);
  expect(ids(cores)).toEqual(['a', 'b', 'c', 'd']);
});
it('sorts by rarity high to low, ties stay in added order', () => {
  expect(ids(viewCores(cores, 'rarity', 'all', new Set()))).toEqual(['b', 'a', 'd', 'c']);
});
it('sorts by base attack and base HP, ties stable', () => {
  expect(ids(viewCores(cores, 'attack', 'all', new Set()))).toEqual(['c', 'a', 'b', 'd']);
  expect(ids(viewCores(cores, 'hp', 'all', new Set()))).toEqual(['d', 'a', 'b', 'c']);
});
it('filters by use and combines with sort', () => {
  const used = new Set(['a', 'c']);
  expect(ids(viewCores(cores, 'added', 'used', used))).toEqual(['a', 'c']);
  expect(ids(viewCores(cores, 'rarity', 'unused', used))).toEqual(['b', 'd']);
});
it('handles empty lists and unknown modes', () => {
  expect(viewCores([], 'rarity', 'unused', new Set())).toEqual([]);
  expect(ids(viewCores(cores, 'zzz', 'zzz', new Set()))).toEqual(['a', 'b', 'c', 'd']);
});
