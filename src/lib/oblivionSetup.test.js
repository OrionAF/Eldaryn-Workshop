import { it, expect, beforeEach } from 'vitest';
import { getOblivionSetup, setOblivionSetup, resetOblivionSetup } from './oblivionSetup.svelte.js';

beforeEach(resetOblivionSetup);

it('returns null until a setup is kept', () => {
  expect(getOblivionSetup('a')).toBeNull();
});

it('keeps a copy per character', () => {
  const s = { from: 5, to: 20, threshold: 90, effort: 'thorough', applyOutputCut: true };
  setOblivionSetup('a', s);
  s.from = 99;
  expect(getOblivionSetup('a')).toEqual({ from: 5, to: 20, threshold: 90, effort: 'thorough', applyOutputCut: true });
  expect(getOblivionSetup('b')).toBeNull();
});

it('reset forgets everything', () => {
  setOblivionSetup('a', { from: 1, to: 2 });
  resetOblivionSetup();
  expect(getOblivionSetup('a')).toBeNull();
});
