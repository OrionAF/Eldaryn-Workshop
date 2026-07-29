import { describe, it, expect } from 'vitest';
import { assetUrl, mountImage, petImage, sigilImage, glyphImage } from './assets.js';
import { MOUNT_DEFS } from './mountsData.js';
import { COMPANION_DEFS } from './petsData.js';
import { SIGILS_BY_CLASS } from './sigilsData.js';
import { GLYPH_RARITIES } from './constants.js';

/**
 * These are coverage fences, not behaviour tests: they exist so that renaming a
 * catalogue entry (or dropping an asset) fails here instead of silently
 * rendering a broken image on a card.
 */
describe('asset coverage', () => {
  it('every mount in the catalogue has art', () => {
    const missing = MOUNT_DEFS.filter((d) => !mountImage(d.id)).map((d) => d.id);
    expect(missing).toEqual([]);
  });

  it('every companion in the catalogue has art', () => {
    const missing = COMPANION_DEFS.filter((d) => !petImage(d.name)).map((d) => d.name);
    expect(missing).toEqual([]);
  });

  it('every sigil in both class catalogues has art', () => {
    const missing = [];
    for (const [cls, defs] of Object.entries(SIGILS_BY_CLASS)) {
      for (const def of defs) {
        if (!sigilImage(cls, def.id)) missing.push(`${cls}/${def.id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('every minor/major glyph tier-rarity pair resolves, falling back where art is absent', () => {
    const missing = [];
    for (const tier of ['minor', 'major']) {
      for (const rarity of GLYPH_RARITIES) {
        if (!glyphImage(tier, rarity)) missing.push(`${tier}/${rarity}`);
      }
    }
    expect(missing).toEqual([]);
    expect(glyphImage('mythic')).toBeTruthy();
  });
});

describe('assetUrl', () => {
  it('returns null for unknown or empty keys instead of throwing', () => {
    expect(assetUrl('not_a_real_asset')).toBeNull();
    expect(assetUrl('')).toBeNull();
    expect(assetUrl(null)).toBeNull();
    expect(assetUrl(undefined)).toBeNull();
  });

  it('resolves the documented aliases to real files', () => {
    // Misspelled file on disk (pet_ryme_wyrm.png) vs the correct pet name.
    expect(petImage('Rime Wyrm')).toBe(assetUrl('pet_ryme_wyrm'));
    // Typo'd sigil id kept for persistence; art is under the correct spelling.
    expect(sigilImage('Warrior', 'berserkt-stance')).toBe(assetUrl('sigils_warrior_berserk_stance'));
    // No Epic/Legendary major art yet - borrows the (unused) mythic icon.
    expect(glyphImage('major', 'Epic')).toBe(assetUrl('glyph_mythic'));
    expect(glyphImage('major', 'Legendary')).toBe(assetUrl('glyph_mythic'));
    expect(glyphImage('minor', 'Legendary')).toBe(assetUrl('glyph_mythic'));
  });

  it('Moss Beetle and Moss Warden share the same artwork', () => {
    // Two files, byte-identical by design (BigReworkV1 §Pets) - so both must
    // resolve, but they are distinct URLs.
    expect(petImage('Moss Beetle')).toBeTruthy();
    expect(petImage('Moss Warden')).toBeTruthy();
  });

  it('is case- and punctuation-insensitive on display names', () => {
    expect(petImage('dust mite')).toBe(petImage('Dust Mite'));
    expect(sigilImage('warrior', 'blade-of-judgment')).toBe(sigilImage('Warrior', 'blade-of-judgment'));
  });
});
