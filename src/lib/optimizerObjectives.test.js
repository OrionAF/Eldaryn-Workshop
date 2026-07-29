/**
 * Tests optimizerObjectives.js - the serializable spec -> objective builder
 * shared by the Web Worker and the inline fallback.
 */
import { it, expect } from 'vitest';
import { objectivesFromSpec } from './optimizerObjectives.js';
import { sigilAwareDpsObjective } from './optimizer.js';

it('pve-fast: single-stage closed-form objective', () => {
  const { objective, screenObjective } = objectivesFromSpec({ kind: 'pve-fast' });
  expect(objective).toBe(sigilAwareDpsObjective);
  expect(screenObjective).toBeNull();
});

it('pve-accurate: closed-form screen + Monte Carlo confirm', () => {
  const { objective, screenObjective } = objectivesFromSpec({ kind: 'pve-accurate', iterations: 50 });
  expect(screenObjective).toBe(sigilAwareDpsObjective);
  expect(typeof objective).toBe('function');
  expect(objective).not.toBe(sigilAwareDpsObjective);
});

it('pvp: two distinct duel objectives (different seeds/iterations)', () => {
  const opponent = { name: 'Rival', class: 'Warrior', stats: { attack: 100, health: 1000 }, sigilIds: [], sigilValues: {} };
  const { objective, screenObjective } = objectivesFromSpec({ kind: 'pvp', opponent });
  expect(typeof objective).toBe('function');
  expect(typeof screenObjective).toBe('function');
  expect(objective).not.toBe(screenObjective);
});

it('tank: single-stage closed-form tank objective', () => {
  const { objective, screenObjective } = objectivesFromSpec({ kind: 'tank', ehpWeight: 0.75 });
  expect(typeof objective).toBe('function');
  expect(objective).not.toBe(sigilAwareDpsObjective);
  expect(screenObjective).toBeNull();
});

it('pvp-goal: single-stage closed-form three-factor objective', () => {
  const { objective, screenObjective } = objectivesFromSpec({
    kind: 'pvp-goal',
    weights: { damage: 50, mitigation: 25, survivability: 25 },
  });
  expect(typeof objective).toBe('function');
  expect(objective).not.toBe(sigilAwareDpsObjective);
  expect(screenObjective).toBeNull();
});

it('defaults to pve-fast and rejects unknown kinds', () => {
  expect(objectivesFromSpec().objective).toBe(sigilAwareDpsObjective);
  expect(() => objectivesFromSpec({ kind: 'nope' })).toThrow(/unknown objective spec/i);
});
