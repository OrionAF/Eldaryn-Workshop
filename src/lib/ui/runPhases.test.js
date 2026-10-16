import { it, expect } from 'vitest';
import { RUN_PHASES, phaseHint } from './runPhases.js';

it('runPhases: five phases in run order, each a short sentence', () => {
  expect(RUN_PHASES.map((p) => p.id)).toEqual(['screen', 'search', 'minimise', 'confirm', 'attribute']);
  for (const p of RUN_PHASES) {
    expect(p.text.split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(p.text).not.toContain('—');
    expect(phaseHint(p.id)).toBe(p.text);
  }
});

it('runPhases: unknown ids have no hint', () => {
  expect(phaseHint('push')).toBe('');
  expect(phaseHint(undefined)).toBe('');
});
