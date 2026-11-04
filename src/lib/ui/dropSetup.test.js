import { it, expect } from 'vitest';
import { defaultDropSetup, normaliseDropSetup } from './dropSetup.js';

it('junk gives the defaults, with the effort preference', () => {
  for (const bad of [null, undefined, 5, 'x', []]) expect(normaliseDropSetup(bad)).toEqual(defaultDropSetup());
  expect(normaliseDropSetup(null, 'thorough').precision).toBe('thorough');
  expect(defaultDropSetup('nope').precision).toBe('standard');
});

it('keeps valid fields and drops invalid ones one by one', () => {
  const s = normaliseDropSetup({
    scope: 'p1', simOn: false, survivalOn: true, enemySpec: { kind: 'campaign', chapter: 2, level: 3 },
    pvpOn: true, pvpIds: ['a', 7, 'b'], precision: 'quick',
  });
  expect(s).toEqual({ scope: 'p1', simOn: false, survivalOn: true, enemySpec: { kind: 'campaign', chapter: 2, level: 3 }, pvpOn: true, pvpIds: ['a', 'b'], precision: 'quick' });
  const bad = normaliseDropSetup({ scope: 3, simOn: 'yes', survivalOn: 1, enemySpec: { kind: 'dungeon', id: 'gone', step: 1 }, pvpOn: 'x', pvpIds: 'a', precision: 'huge' }, 'quick');
  expect(bad).toEqual(defaultDropSetup('quick'));
});

it('an enemy that no longer resolves falls back to the default enemy', () => {
  expect(normaliseDropSetup({ enemySpec: { kind: 'oblivion', floor: -4 } }).enemySpec).toEqual({ kind: 'campaign', chapter: 1, level: 1 });
  expect(normaliseDropSetup({ enemySpec: { kind: 'nope' } }).enemySpec).toEqual({ kind: 'campaign', chapter: 1, level: 1 });
});
