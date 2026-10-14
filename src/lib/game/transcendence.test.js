import { describe, it, expect } from 'vitest';
import {
  TRANSCENDENCE_BOARD_KEYS, TRANSCENDENCE_TIERS, transcendenceBoard, transcendenceBoardKeyForSpec,
  transcendenceBoardForSpec,
} from './transcendence.js';

describe('game/transcendence catalogue', () => {
  it('six boards keyed by class (and flavor for Mystic and Necromancer)', () => {
    expect(TRANSCENDENCE_BOARD_KEYS).toEqual([
      'WARRIOR', 'SENTINEL', 'MYSTIC/MAGE', 'MYSTIC/DRUID', 'NECROMANCER/DOOMWEAVER', 'NECROMANCER/DEATHLORD',
    ]);
  });
  it('board node counts match nodeCount', () => {
    for (const key of TRANSCENDENCE_BOARD_KEYS) {
      const b = transcendenceBoard(key);
      expect(b.nodes.length, key).toBe(b.nodeCount);
    }
    expect(transcendenceBoard('MYSTIC/MAGE').nodeCount).toBe(279);
    expect(transcendenceBoard('NOPE')).toBeNull();
  });
  it('spec keys resolve to boards', () => {
    expect(transcendenceBoardKeyForSpec('WARRIOR_TANK')).toBe('WARRIOR');
    expect(transcendenceBoardKeyForSpec('WARRIOR_DPS')).toBe('WARRIOR');
    expect(transcendenceBoardKeyForSpec('MYSTIC_DRUID')).toBe('MYSTIC/DRUID');
    expect(transcendenceBoardKeyForSpec('NOPE')).toBeNull();
    expect(transcendenceBoardForSpec('NECROMANCER_DEATHLORD').flavor).toBe('DEATHLORD');
  });
  it('tiers', () => {
    expect(TRANSCENDENCE_TIERS).toHaveLength(5);
    expect(TRANSCENDENCE_TIERS[4]).toMatchObject({ name: 'TRANSCENDENT', rowFrom: -23, rowTo: -25 });
  });
});
