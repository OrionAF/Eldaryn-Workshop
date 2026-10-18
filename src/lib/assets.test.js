import { describe, it, expect } from 'vitest';
import { assetUrl, mountImage, petImage, sigilImage, glyphImage } from './assets.js';
import { MOUNT_SPECIES } from './game/mountsGlyphs.js';
import { PET_SPECIES, petDisplayName } from './game/pets.js';
import { ownableSigils } from './model/sigils.js';

const GLYPH_RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

/**
 * These are coverage fences, not behaviour tests: they exist so that renaming a
 * catalogue entry (or dropping an asset) fails here instead of silently
 * rendering a broken image on a card.
 */
describe('asset coverage', () => {
  it('every mount in the catalogue has art', () => {
    const missing = MOUNT_SPECIES.filter((d) => !mountImage(d.species)).map((d) => d.species);
    expect(missing).toEqual([]);
  });

  it('every pet species (base and evolved name) has art', () => {
    const missing = PET_SPECIES.flatMap((d) => [petDisplayName(d.id, false), petDisplayName(d.id, true)]).filter((n) => !petImage(n));
    expect(missing).toEqual([]);
  });

  it('every sigil in all class catalogues has art', () => {
    const missing = [];
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      for (const def of ownableSigils(cls)) {
        if (!sigilImage(def.class, def.id)) missing.push(`${cls}/${def.id}`);
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
