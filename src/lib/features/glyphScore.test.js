import { describe, it, expect } from 'vitest';
import { glyphScore } from './glyphScore.js';
import { MAJOR_GLYPHS } from '../game/mountsGlyphs.js';

const glyph = (rarity, stat, quality, extra = {}) => ({ id: 'g', glyphType: 'g-swift', rarity, sealed: false, secondary: { stat, quality }, ...extra });
const weights = new Map([
  ['CRIT_CHANCE', 1],
  ['ATTACK_PERCENT', 0.5],
  ['HP_REGEN', 0],
]);

describe('glyphScore', () => {
  it('rolls on the position inside the rarity band (Game/mounts-glyphs.md §9)', () => {
    expect(glyphScore(glyph('Common', 'critChance', 0.1), null).roll).toBeCloseTo(0);
    expect(glyphScore(glyph('Common', 'critChance', 0.15), null).roll).toBeCloseTo(0.5);
    expect(glyphScore(glyph('Legendary', 'critChance', 1), null).roll).toBeCloseTo(1);
    expect(glyphScore(glyph('Mythic', 'critChance', 1.2), null)).toMatchObject({ roll: 1, grade: null });
  });

  it("scores the stat against the spec's best stat, half for the pick and half for the roll", () => {
    expect(glyphScore(glyph('Epic', 'critChance', 0.8), weights)).toMatchObject({ fit: 1, score: 1, grade: 'S' });
    const half = glyphScore(glyph('Epic', 'attackPercent', 0.6), weights);
    expect(half.fit).toBeCloseTo(0.5);
    expect(half.score).toBeCloseTo(0.25);
    expect(glyphScore(glyph('Epic', 'hpRegen', 0.8), weights)).toMatchObject({ score: 0, grade: 'D' });
  });

  it('skips sealed, non-minor and unentered glyphs', () => {
    expect(glyphScore(glyph('Epic', 'critChance', 0.7, { sealed: true }), weights)).toBeNull();
    expect(glyphScore(glyph('Epic', 'critChance', 0.7, { secondary: null }), weights)).toBeNull();
    expect(glyphScore({ ...glyph('Epic', 'critChance', 0.7), glyphType: MAJOR_GLYPHS[0].id }, weights)).toBeNull();
  });
});
