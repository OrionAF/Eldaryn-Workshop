import { it, expect } from 'vitest';
import { RUN_PHASES, PUSH_RUN_PHASES, phasesFor, phaseHint } from './runPhases.js';
import { PUSH_PHASES } from '../search/push.js';

it('runPhases: five phases in run order, each a short sentence', () => {
  expect(RUN_PHASES.map((p) => p.id)).toEqual(['screen', 'search', 'minimise', 'confirm', 'attribute']);
  for (const p of [...RUN_PHASES, ...PUSH_RUN_PHASES]) {
    expect(p.text.split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(p.text).not.toContain('—');
    expect(phaseHint(p.id, RUN_PHASES.includes(p) ? [] : ['climb'])).toBe(p.text);
  }
});

it('runPhases: unknown ids have no hint', () => {
  expect(phaseHint('push')).toBe('');
  expect(phaseHint(undefined)).toBe('');
});

it('runPhases: a Push run explains its own steps, in its order', () => {
  const push = PUSH_PHASES.map((p) => p.id);
  expect(PUSH_RUN_PHASES.map((p) => p.id)).toEqual(push);
  expect(phasesFor(push).map((p) => p.label)).toEqual(['Climb', 'Screen', 'Optimise', 'Confirm']);
  expect(phaseHint('screen', push)).not.toBe(phaseHint('screen'));
  expect(phasesFor(['climb'])).toEqual(PUSH_RUN_PHASES);
  expect(phasesFor(['search'])).toEqual(RUN_PHASES);
  expect(phasesFor()).toEqual(RUN_PHASES);
});
