import { describe, it, expect } from 'vitest';
import { defaultDrop, normaliseDrop, migrateDropFromV1, newDrop, dropHasStats } from './drop.js';
import { normaliseCharacter, newCharacter } from './index.js';

const item = { rarity: 'ETERNAL', itemLevel: 100, quality: 50, primaryStats: { attack: 10, hp: 0 }, secondaryStats: [{ type: 'CRIT_CHANCE', value: 3 }], conduit: { type: 'FLAME', value: 20 } };

describe('model/drop', () => {
  it('defaults to no drop', () => {
    expect(defaultDrop()).toEqual({ drop: null });
    expect(normaliseDrop({}, {})).toEqual({ drop: null });
    expect(normaliseDrop({ drop: 'junk' }, {})).toEqual({ drop: null });
  });

  it('keeps a valid drop and is idempotent', () => {
    const once = normaliseDrop({ drop: { realm: 'base', slot: 'RING', item } }, { class: 'WARRIOR' });
    expect(once.drop).toMatchObject({ realm: 'base', slot: 'RING' });
    expect(once.drop.item.conduit).toEqual({ type: 'FLAME', value: 20 });
    expect(normaliseDrop(once, { class: 'WARRIOR' })).toEqual(once);
  });

  it('drops a slot the realm lacks, and allows Oblivion-only slots in the Oblivion realm', () => {
    expect(normaliseDrop({ drop: { realm: 'base', slot: 'BELT', item } }, {})).toEqual({ drop: null });
    expect(normaliseDrop({ drop: { realm: 'oblivion', slot: 'BELT', item } }, {}).drop.slot).toBe('BELT');
    expect(normaliseDrop({ drop: { realm: 'weird', slot: 'RING', item } }, {}).drop.realm).toBe('base');
  });

  it('repairs the item: class-gated secondaries, an empty item when it is missing', () => {
    const d = normaliseDrop({ drop: { realm: 'base', slot: 'HEAD', item: { ...item, secondaryStats: [{ type: 'NOT_A_STAT', value: 1 }] } } }, { class: 'WARRIOR' });
    expect(d.drop.item.secondaryStats).toEqual([]);
    expect(normaliseDrop({ drop: { realm: 'base', slot: 'HEAD' } }, {}).drop.item).toMatchObject({ primaryStats: { attack: 0, hp: 0 }, secondaryStats: [] });
  });

  it('v1 drops are not migrated', () => {
    expect(migrateDropFromV1({ drop: { slot: 'Head', piece: { attack: 5 } } })).toEqual({ value: { drop: null }, idMap: {} });
  });

  it('runs through normaliseCharacter', () => {
    const c = newCharacter('X', 'WARRIOR');
    c.drop = { realm: 'base', slot: 'WEAPON', item };
    expect(normaliseCharacter(c).drop.slot).toBe('WEAPON');
    c.drop = { realm: 'base', slot: 'NOPE', item };
    expect(normaliseCharacter(c).drop).toBeNull();
  });

  it('dropHasStats sees any stat', () => {
    expect(dropHasStats(newDrop('HEAD').item)).toBe(false);
    expect(dropHasStats(null)).toBe(false);
    expect(dropHasStats({ ...newDrop('HEAD').item, primaryStats: { attack: 0, hp: 1 } })).toBe(true);
    expect(dropHasStats({ ...newDrop('HEAD').item, secondaryStats: [{ type: 'CRIT_CHANCE', value: 1 }] })).toBe(true);
    expect(dropHasStats({ ...newDrop('HEAD').item, conduit: { type: 'DARK', value: 1 } })).toBe(true);
  });
});
