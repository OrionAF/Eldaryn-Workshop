import { describe, it, expect } from 'vitest';
import { EngineInputError, assertFiniteEntity, assertPositive } from './validate.js';

const caught = (fn) => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return null;
};

describe('validate', () => {
  it('passes finite numbers', () => {
    expect(() => assertFiniteEntity('player', { a: 0, b: -1, c: 1e15 }, ['a', 'b', 'c'])).not.toThrow();
    expect(() => assertPositive('player', { a: 1 }, ['a'])).not.toThrow();
  });

  it('names the entity and the key of the first bad value', () => {
    for (const v of [undefined, null, NaN, Infinity, '5']) {
      const e = caught(() => assertFiniteEntity('mob 2', { hp: 10, attack: v }, ['hp', 'attack']));
      expect(e).toBeInstanceOf(EngineInputError);
      expect(e).toMatchObject({ name: 'EngineInputError', kind: 'mob 2', key: 'attack' });
      expect(e.message).toContain('mob 2.attack');
    }
  });

  it('a missing object is an error', () => {
    expect(caught(() => assertFiniteEntity('player', null, ['hp']))).toMatchObject({ name: 'EngineInputError', kind: 'player' });
  });

  it('assertPositive rejects 0 and negatives', () => {
    expect(caught(() => assertPositive('player', { maxHp: 0 }, ['maxHp']))).toMatchObject({ key: 'maxHp', value: 0 });
    expect(caught(() => assertPositive('player', { maxHp: -3 }, ['maxHp']))).toMatchObject({ key: 'maxHp', value: -3 });
  });
});
