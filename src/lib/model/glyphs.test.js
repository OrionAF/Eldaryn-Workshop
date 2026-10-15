import { describe, it, expect } from 'vitest';
import {
  normaliseGlyph,
  normaliseGlyphs,
  newGlyph,
  glyphTypeInfo,
  glyphTier,
  glyphRarityOptions,
  majorGlyphAllowed,
  glyphSecondaryValue,
  glyphSecondaryQuality,
  majorEffectAtRarity,
  migrateGlyphsFromV1,
  FREE_GLYPH_RARITIES,
} from './glyphs.js';
import { MAJOR_GLYPHS, MINOR_GLYPH_TYPES, majorGlyphsForClassSpec } from '../game/mountsGlyphs.js';

describe('catalogue lookups', () => {
  it('resolves minor, major and mythic types with their tier', () => {
    expect(glyphTier('g-swift')).toBe('minor');
    expect(glyphTier('sg-warborn-cd')).toBe('major');
    expect(glyphTier('g-wrath')).toBe('mythic');
    expect(glyphTier('nope')).toBeNull();
    expect(glyphTypeInfo('g-swift').rarity).toBe('Common');
    expect(glyphTypeInfo('sg-warborn-cd').rarity).toBeNull();
  });

  it('minor types fix their rarity; major and mythic choose among Common..Legendary', () => {
    expect(glyphRarityOptions('g-cataclysm')).toEqual(['Mythic']);
    expect(glyphRarityOptions('sg-warborn-cd')).toEqual(FREE_GLYPH_RARITIES);
    expect(glyphRarityOptions('g-wrath')).toEqual(FREE_GLYPH_RARITIES);
  });

  it('all 42 majors resolve and index their effect by rarity', () => {
    expect(MAJOR_GLYPHS).toHaveLength(42);
    for (const g of MAJOR_GLYPHS) expect(majorEffectAtRarity(g.id, 'Legendary')).not.toBeNull();
    expect(majorEffectAtRarity('sg-warborn-cd', 'Epic')).toEqual({ kind: 'COOLDOWN', values: { cooldownseconds: 4 } });
    expect(majorEffectAtRarity('sg-warborn-cd', 'Mythic')).toBeNull();
    expect(majorEffectAtRarity('g-swift', 'Common')).toBeNull();
  });
});

describe('class and spec filtering', () => {
  it('majorGlyphAllowed: class gate, then requiredSpec against the talent-set specs when known', () => {
    expect(majorGlyphAllowed('sg-warborn-cd', 'WARRIOR')).toBe(true);
    expect(majorGlyphAllowed('sg-warborn-cd', 'SENTINEL')).toBe(false);
    expect(majorGlyphAllowed('sg-m-runic-dmg', 'MYSTIC', [])).toBe(true);
    expect(majorGlyphAllowed('sg-m-runic-dmg', 'MYSTIC', ['MYSTIC_MAGE'])).toBe(true);
    expect(majorGlyphAllowed('sg-m-runic-dmg', 'MYSTIC', ['MYSTIC_DRUID'])).toBe(false);
    expect(majorGlyphAllowed('sg-m-runic-dmg', 'MYSTIC', ['MYSTIC_DRUID', 'MYSTIC_MAGE'])).toBe(true);
    expect(majorGlyphAllowed('g-swift', 'NECROMANCER')).toBe(true);
  });

  it('agrees with the catalogue accessor majorGlyphsForClassSpec for a single known spec', () => {
    const viaAccessor = majorGlyphsForClassSpec('MYSTIC', 'MYSTIC_DRUID').map((g) => g.id).sort();
    const viaModel = MAJOR_GLYPHS.filter((g) => majorGlyphAllowed(g.id, 'MYSTIC', ['MYSTIC_DRUID'])).map((g) => g.id).sort();
    expect(viaModel).toEqual(viaAccessor);
    expect(majorGlyphsForClassSpec('NECROMANCER', null)).toEqual([]);
  });

  it('normalise drops another class\'s majors but keeps minors and the other spec\'s majors', () => {
    const raw = {
      glyphs: [
        { id: 'a', glyphType: 'sg-warborn-cd', rarity: 'Rare' },
        { id: 'b', glyphType: 'g-swift', rarity: 'Common' },
        { id: 'c', glyphType: 'sg-m-runic-dmg', rarity: 'Rare' },
      ],
    };
    expect(normaliseGlyphs(raw, { class: 'SENTINEL', spec: null }).glyphs.map((g) => g.id)).toEqual(['b']);
    expect(normaliseGlyphs(raw, { class: 'MYSTIC', spec: 'MYSTIC_DRUID' }).glyphs.map((g) => g.id)).toEqual(['b', 'c']);
    expect(normaliseGlyphs(raw, { class: null }).glyphs).toHaveLength(3);
  });
});

describe('normalise', () => {
  it('forces minor rarity, defaults/clamps others, drops unknown types', () => {
    expect(normaliseGlyph({ glyphType: 'g-tough', rarity: 'Common' }).rarity).toBe('Rare');
    expect(normaliseGlyph({ glyphType: 'sg-warborn-cd', rarity: 'Mythic' }).rarity).toBe('Common');
    expect(normaliseGlyph({ glyphType: 'sg-warborn-cd', rarity: 'Epic' }).rarity).toBe('Epic');
    expect(normaliseGlyph({ glyphType: 'zz' })).toBeNull();
    expect(normaliseGlyph(null)).toBeNull();
  });

  it('only unsealed minors keep a secondary, validated against the pool', () => {
    const sec = { stat: 'critChance', quality: 0.15 }; // inside the Common band [0.1, 0.2]
    expect(normaliseGlyph({ glyphType: 'g-swift', secondary: sec }).secondary).toEqual(sec);
    expect(normaliseGlyph({ glyphType: 'g-swift', secondary: { stat: 'critChance', quality: 1 } }).secondary.quality).toBe(0.2);
    expect(normaliseGlyph({ glyphType: 'g-swift', secondary: { stat: 'critChance', quality: 0 } }).secondary.quality).toBe(0.1);
    expect(normaliseGlyph({ glyphType: 'g-swift', secondary: sec, sealed: true }).secondary).toBeNull();
    expect(normaliseGlyph({ glyphType: 'sg-warborn-cd', secondary: sec }).secondary).toBeNull();
    expect(normaliseGlyph({ glyphType: 'g-swift', secondary: { stat: 'bogus', quality: 1 } }).secondary).toBeNull();
    expect(normaliseGlyph({ glyphType: 'g-swift', secondary: { stat: 'critChance', quality: 7 } }).secondary.quality).toBe(0.2);
    // a Legendary-rarity minor (band [0.8, 1]) keeps its top quality
    const legendary = MINOR_GLYPH_TYPES.find((t) => t.rarity === 'Legendary');
    if (legendary) expect(normaliseGlyph({ glyphType: legendary.id, secondary: { stat: 'critChance', quality: 1 } }).secondary.quality).toBe(1);
  });

  it('is idempotent and repairs duplicate ids', () => {
    const raw = { glyphs: [{ id: 'a', glyphType: 'g-swift' }, { id: 'a', glyphType: 'g-keen', sealed: true }, { glyphType: 'g-spark' }] };
    const once = normaliseGlyphs(raw, { class: 'WARRIOR' });
    expect(new Set(once.glyphs.map((g) => g.id)).size).toBe(3);
    expect(normaliseGlyphs(once, { class: 'WARRIOR' })).toEqual(once);
  });

  it('newGlyph builds an unsealed glyph by default and refuses unknown or foreign-class types', () => {
    expect(newGlyph({ glyphType: 'g-swift' })).toMatchObject({ sealed: false, rarity: 'Common', secondary: null });
    expect(newGlyph({ glyphType: 'nope' })).toBeNull();
    expect(newGlyph({ glyphType: 'sg-warborn-cd', rarity: 'Rare' }, { class: 'SENTINEL' })).toBeNull();
  });
});

describe('secondary value (doc §9)', () => {
  it('value = min + (max-min)*quality, rounded to the stat decimals', () => {
    expect(glyphSecondaryValue({ stat: 'critChance', quality: 0 })).toBe(0.6);
    expect(glyphSecondaryValue({ stat: 'critChance', quality: 1 })).toBe(5);
    expect(glyphSecondaryValue({ stat: 'attackSpeed', quality: 0.5 })).toBe(0.12); // 0.03 + 0.17*0.5 = 0.115 -> 2dp
    expect(glyphSecondaryValue({ stat: 'bogus', quality: 1 })).toBe(0);
  });

  it('quality is the inverse, clamped', () => {
    expect(glyphSecondaryQuality('critChance', 2.8)).toBeCloseTo(0.5, 5);
    expect(glyphSecondaryQuality('critChance', 99)).toBe(1);
    expect(glyphSecondaryQuality('critChance', -3)).toBe(0);
    const q = glyphSecondaryQuality('lifesteal', 4.5);
    expect(glyphSecondaryValue({ stat: 'lifesteal', quality: q })).toBe(4.5);
  });
});

describe('v1 glyph migration', () => {
  it('maps stat keys and units, majors by name, and gives clones to shared glyphs', () => {
    const out = migrateGlyphsFromV1({
      glyphs: {
        entries: [
          { id: 'x', tier: 'minor', rarity: 'Epic', statKey: 'crit_mult', value: 20 },
          { id: 'y', tier: 'major', rarity: 'Uncommon', special: 'enduring-brand:uncommon' },
          { id: 'z', tier: 'major', rarity: 'Common', special: 'unknown-family:common' },
          { id: 'w', tier: 'minor', rarity: 'Common', statKey: 'attack', value: 50 },
          { id: 'old', tier: 'major', rarity: 'Common', special: 'ember-curse-glyph' },
        ],
      },
    });
    const byId = Object.fromEntries(out.value.glyphs.map((g) => [g.id, g]));
    expect(byId.x.glyphType).toBe(MINOR_GLYPH_TYPES.find((t) => t.rarity === 'Epic').id);
    expect(byId.x.secondary.stat).toBe('critDamage');
    expect(glyphSecondaryValue(byId.x.secondary)).toBeCloseTo(0.2, 2);
    expect(byId.y).toMatchObject({ glyphType: 'sg-sunder-decay', rarity: 'Uncommon' });
    expect(byId.z).toBeUndefined();
    expect(byId.w.secondary).toBeNull(); // flat attack has no secondary-pool entry
    expect(byId.old.glyphType).toBe('sg-ember-stacks');
    expect(out.idMap).toEqual({});
  });
});
