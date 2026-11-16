import { describe, it, expect } from 'vitest';
import {
  FORTRESSES, FORTRESS_BUFFS, fortressById, fortressGroupOnDayIndex, remapFortressStat, CLAN_RANKS, clanCapForServer,
} from './fortress.js';

describe('clanCapForServer', () => {
  it('every server caps clans at 18', () => {
    for (const s of [1, 5, 6, 7, 9, 12, 99, null, undefined]) expect(clanCapForServer(s)).toBe(18);
  });
});

describe('game/fortress catalogue', () => {
  it('5 fortresses and the anchor-based schedule', () => {
    expect(FORTRESSES).toHaveLength(5);
    expect(fortressById('CORE')).toMatchObject({ name: 'Abyssal Core', group: 'CORE' });
    expect(fortressById('NOPE')).toBeNull();
    expect(fortressGroupOnDayIndex(0)).toBe('TOP');
    expect(fortressGroupOnDayIndex(1)).toBeNull();
    expect(fortressGroupOnDayIndex(6)).toBe('CORE');
    expect(fortressGroupOnDayIndex(7)).toBe('TOP');
    expect(fortressGroupOnDayIndex(-1)).toBe('CORE');
  });
  it('class remap substitutes stats per class', () => {
    expect(remapFortressStat('SENTINEL', 'damageReduction')).toBe('missChance');
    expect(remapFortressStat('NECROMANCER', 'damageReduction')).toBe('healthPercent');
    expect(remapFortressStat('WARRIOR', 'damageReduction')).toBe('damageReduction');
  });
  it('buffs and clan ranks', () => {
    expect(FORTRESS_BUFFS.TOP.combat.attackPercent).toBe(5);
    expect(CLAN_RANKS).toHaveLength(5);
    expect(CLAN_RANKS[1]).toMatchObject({ rank: 'LEGION', requiredWarPower: 4500 });
  });
});
