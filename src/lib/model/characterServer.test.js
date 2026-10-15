import { describe, it, expect } from 'vitest';
import { newCharacter, normaliseCharacter } from './index.js';

describe('character server', () => {
  it('defaults to null and keeps a whole number', () => {
    expect(newCharacter('A').server).toBeNull();
    expect(normaliseCharacter({ name: 'A', server: 5 }).server).toBe(5);
  });
  it('drops anything that is not a whole number', () => {
    for (const bad of ['5', -1, 2.5, NaN, {}, undefined]) expect(normaliseCharacter({ name: 'A', server: bad }).server).toBeNull();
  });
  it('is idempotent', () => {
    const c = normaliseCharacter({ name: 'A', server: 9 });
    expect(normaliseCharacter(c).server).toBe(9);
  });
});
