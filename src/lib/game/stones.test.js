import { describe, it, expect } from 'vitest';
import raw from '../../data/game/stones.json';
import {
  STONE_TYPES,
  stoneType,
  statPool,
  amplifyStep,
  AMPLIFY_TABLE,
  oblivionGrade,
  OBLIVION_GRADES,
} from './stones.js';

describe('stone types (stones.md §1)', () => {
  it('lists the six types from the JSON with their stat counts', () => {
    expect(STONE_TYPES.map((t) => t.key)).toEqual(raw.types.map((t) => t.key));
    for (const t of raw.types) expect(stoneType(t.key).statCount).toBe(t.statCount);
    expect(stoneType('nope')).toBeNull();
  });

  it('keeps the PvP secondary weights from the JSON', () => {
    expect(stoneType('pvp').secondaryPool).toEqual(raw.types.find((t) => t.key === 'pvp').secondaryPool);
  });
});

describe('stat pools (stones.md §2)', () => {
  it('filters each pool by its JSON flag', () => {
    for (const [pool, flag] of [
      ['pveAttackPool', 'inPveAttackPool'],
      ['pveDefensePool', 'inPveDefensePool'],
      ['fullPool', 'inFullPool'],
    ]) {
      expect(statPool(pool).map((s) => s.stat)).toEqual(
        raw.stats.filter((s) => s[flag]).map((s) => s.stat),
      );
    }
    expect(statPool('unknown')).toEqual([]);
  });
});

describe('amplify table (stones.md §8)', () => {
  it('returns the row for a target level', () => {
    expect(AMPLIFY_TABLE).toHaveLength(10);
    expect(amplifyStep(10)).toEqual(raw.amplifyTable.find((r) => r.targetLevel === 10));
    expect(amplifyStep(11)).toBeNull();
  });
});

describe('Oblivion grades (stones.md §7)', () => {
  it('returns each grade by level', () => {
    expect(OBLIVION_GRADES).toHaveLength(raw.oblivionGrades.length);
    for (const g of raw.oblivionGrades) expect(oblivionGrade(g.level)).toEqual(g);
    expect(oblivionGrade(99)).toBeNull();
  });
});
