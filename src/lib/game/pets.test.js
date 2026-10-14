import { describe, it, expect } from 'vitest';
import {
  PET_SPECIES, PET_RARITY_WEIGHTS, PET_ALTAR_XP_NEEDED_BY_TIER, petSpeciesById, petDisplayName,
} from './pets.js';

describe('game/pets catalogue', () => {
  it('18 species and 21 rarity weight rows', () => {
    expect(PET_SPECIES).toHaveLength(18);
    expect(PET_RARITY_WEIGHTS).toHaveLength(21);
    expect(PET_RARITY_WEIGHTS[0].common).toBe(100);
  });
  it('spot values and evolved names', () => {
    expect(petSpeciesById('FLAME_TOAD')).toMatchObject({ baseAttack: 120, baseHp: 700, secondaryStatCount: 1 });
    expect(petDisplayName('FLAME_TOAD')).toBe('Flame Toad');
    expect(petDisplayName('FLAME_TOAD', true)).toBe('Pyre Toad');
    expect(petDisplayName('NOPE')).toBeNull();
  });
  it('altar XP table covers tiers 1-8', () => {
    expect(Object.keys(PET_ALTAR_XP_NEEDED_BY_TIER)).toHaveLength(8);
    expect(PET_ALTAR_XP_NEEDED_BY_TIER['1'][0]).toBe(175);
  });
});
