import { describe, it, expect } from 'vitest';
import { workersFor, CPU_PROFILES, DEFAULT_CPU_PROFILE } from './cpuProfile.js';

describe('workersFor', () => {
  it.each([
    // cores, eco, balanced, max
    [1, 1, 1, 1],
    [2, 1, 1, 1],
    [4, 1, 2, 3],
    [6, 1, 3, 5],
    [8, 2, 4, 7],
    [12, 2, 6, 11],
    [16, 2, 6, 15],
    [32, 2, 6, 31],
  ])('%i cores: eco %i, balanced %i, max %i', (cores, eco, balanced, max) => {
    expect(workersFor('eco', cores)).toBe(eco);
    expect(workersFor('balanced', cores)).toBe(balanced);
    expect(workersFor('max', cores)).toBe(max);
  });

  it('a missing core count counts as 4; an unknown profile as balanced', () => {
    expect(workersFor('max', undefined)).toBe(3);
    expect(workersFor('balanced', 0)).toBe(2);
    expect(workersFor('turbo', 8)).toBe(4);
  });

  it('profiles and default', () => {
    expect(CPU_PROFILES).toEqual(['eco', 'balanced', 'max']);
    expect(DEFAULT_CPU_PROFILE).toBe('balanced');
  });
});
