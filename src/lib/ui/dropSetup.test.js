import { it, expect } from 'vitest';
import { defaultDropSetup, normaliseDropSetup } from './dropSetup.js';

it('junk gives the defaults, with the effort preference', () => {
  for (const bad of [null, undefined, 5, 'x', []]) expect(normaliseDropSetup(bad)).toEqual(defaultDropSetup());
  expect(normaliseDropSetup(null, 'thorough').precision).toBe('thorough');
  expect(defaultDropSetup('nope').precision).toBe('standard');
});

it('keeps scope and effort, and ignores the retired metric toggles', () => {
  const s = normaliseDropSetup({ scope: 'p1', simOn: false, survivalOn: true, pvpOn: true, precision: 'quick' });
  expect(s).toEqual({ scope: 'p1', precision: 'quick' });
  expect(normaliseDropSetup({ scope: 3, precision: 'huge' }, 'quick')).toEqual(defaultDropSetup('quick'));
});
