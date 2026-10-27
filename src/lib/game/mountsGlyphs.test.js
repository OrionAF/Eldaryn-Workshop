import { describe, it, expect } from 'vitest';
import {
  MOUNT_SPECIES, MAJOR_GLYPHS, mountBySpecies, majorGlyphsForClassSpec, majorGlyphForSigil,
} from './mountsGlyphs.js';

describe('game/mountsGlyphs catalogue', () => {
  it('13 mount species and 58 major glyphs', () => {
    expect(MOUNT_SPECIES).toHaveLength(13);
    expect(MAJOR_GLYPHS).toHaveLength(58);
    expect(mountBySpecies('NIGHT_WOLF')).toMatchObject({ rarity: 'Common', speedPct: 40 });
    expect(mountBySpecies('NOPE')).toBeNull();
  });
  it('major glyphs by class and spec', () => {
    expect(majorGlyphsForClassSpec('WARRIOR', 'WARRIOR_TANK')).toHaveLength(12);
    expect(majorGlyphsForClassSpec('SENTINEL', 'SENTINEL_DISRUPTION')).toHaveLength(13);
    expect(majorGlyphsForClassSpec('MYSTIC', 'MYSTIC_MAGE')).toHaveLength(10);
    expect(majorGlyphsForClassSpec('MYSTIC', 'MYSTIC_DRUID')).toHaveLength(7);
    expect(majorGlyphsForClassSpec('NECROMANCER', 'NECROMANCER_DEATHLORD')).toHaveLength(16);
  });
  it('a glyph maps to its sigil', () => {
    expect(majorGlyphForSigil('WARBORN_FURY')).toMatchObject({ id: 'sg-warborn-cd', playerClass: 'WARRIOR' });
    expect(majorGlyphForSigil('NOPE')).toBeNull();
  });
});
