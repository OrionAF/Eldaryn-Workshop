import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  MAJOR_GLYPHS,
  MAJOR_GLYPH_FAMILIES,
  majorGlyphById,
  majorGlyphVariants,
  glyphTickDamageMult,
  resolveGlyphId,
  glyphRarityRank,
  GLYPH_TICK_BASE_PCT,
} from './glyphsData.js';
import { GLYPH_RARITIES } from './constants.js';
import { SIGILS_BY_CLASS } from './sigilsData.js';

const CSV = resolve(dirname(fileURLToPath(import.meta.url)), '../../EldarynTracker/found_glyphs.csv');

/** Parsed found_glyphs.csv: { glyph, rarity, sigil, effect }. */
function loadRows() {
  const text = readFileSync(CSV, 'utf8').replace(/^﻿/, '');
  const [, ...lines] = text.trim().split(/\r?\n/);
  return lines.map((line) => {
    const parts = line.split(',');
    return {
      glyph: parts[0].trim(),
      rarity: parts[1].trim(),
      sigil: parts[2].trim(),
      effect: parts.slice(3).join(',').trim(),
    };
  });
}

const ROWS = loadRows();

describe('major glyph catalogue vs the scrape', () => {
  it('covers every scraped glyph family', () => {
    const scraped = new Set(ROWS.map((r) => r.glyph));
    const known = new Set(MAJOR_GLYPH_FAMILIES.map((f) => f.name));
    expect([...scraped].filter((n) => !known.has(n))).toEqual([]);
    expect(scraped.size).toBe(17);
    expect(MAJOR_GLYPH_FAMILIES).toHaveLength(17);
  });

  it('points every family at a sigil that actually exists', () => {
    const sigilIds = new Set(Object.values(SIGILS_BY_CLASS).flat().map((d) => d.id));
    const dangling = MAJOR_GLYPH_FAMILIES.filter((f) => !sigilIds.has(f.sigilId)).map((f) => f.key);
    expect(dangling).toEqual([]);
  });

  it('reproduces every observed numeric value exactly', () => {
    // The numbers in each tooltip, in the order the effect kinds are declared.
    const NUMBERS = {
      'Warhaste Emblem': ['cooldownSec'],
      'Cataclysmic Cadence': ['cooldownSec'],
      'Ironclad Tempo': ['cooldownSec'],
      'Umbral Cadence': ['cooldownSec'],
      'Venomous Alacrity': ['cooldownSec'],
      'Withering Alacrity': ['cooldownSec'],
      'Voltaic Tempo': ['cooldownSec'],
      'Cinderquick Cadence': ['cooldownSec'],
      'Bramblethorn Crest': ['thornsPerStackPct'],
      'Enduring Brand': ['stackDecaySec'],
      'Relentless Brand': ['stackDecaySec'],
      'Emberhoard Sigil': ['maxStacks', 'tickDamagePct'],
      'Hemorrhagic Excess': ['maxStacks', 'tickDamagePct'],
      'Thunderclasp Binding': ['paralyzeSec'],
      'Duskrunner Haste': ['attackSpeedWhileActivePct'],
      // "O.4s" / "O.6s" in the source - a letter O standing in for zero.
      'Numbing Sear': ['paralyzeOnHitSec'],
      'Thornmail Aegis': ['reflectWhileActivePct'],
    };

    let checked = 0;
    for (const row of ROWS) {
      const kinds = NUMBERS[row.glyph];
      const variant = MAJOR_GLYPHS.find((g) => g.name === row.glyph && g.rarity === row.rarity);
      expect(variant, `${row.glyph} ${row.rarity}`).toBeTruthy();

      // Numbing Sear's rows read "O.4s"/"O.6s" - a capital O standing in for
      // the leading zero. Restore it before reading the numbers out.
      const effect = row.effect.replace(/\bO\.(\d)/g, '0.$1');
      const nums = [...effect.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
      kinds.forEach((kind, i) => {
        checked += 1;
        expect(variant.effects[kind], `${row.glyph} ${row.rarity} ${kind}`).toBe(nums[i]);
      });
    }
    // 32 CSV rows; the two Max-Stacks glyphs carry a second number each.
    expect(checked).toBe(35);
  });

  it('marks every scraped rarity as observed, and the rest as extrapolated', () => {
    for (const row of ROWS) {
      const variant = MAJOR_GLYPHS.find((g) => g.name === row.glyph && g.rarity === row.rarity);
      expect(variant.observed, `${row.glyph} ${row.rarity}`).toBe(true);
    }
    // Coverage really is sparse - most families were only seen at 1-3 rarities.
    const observed = MAJOR_GLYPHS.filter((g) => g.observed).length;
    expect(observed).toBe(32);
    expect(MAJOR_GLYPHS).toHaveLength(17 * GLYPH_RARITIES.length);
  });
});

describe('rarity extrapolation', () => {
  it('improves monotonically with rarity for every family', () => {
    for (const family of MAJOR_GLYPH_FAMILIES) {
      const variants = majorGlyphVariants(family.key);
      for (const kind of Object.keys(family.effects)) {
        if (family.effects[kind].flat != null) continue;
        const values = variants.map((v) => v.effects[kind]);
        const improving = family.effects[kind].step > 0;
        for (let i = 1; i < values.length; i += 1) {
          if (improving) expect(values[i]).toBeGreaterThan(values[i - 1]);
          else expect(values[i]).toBeLessThan(values[i - 1]);
        }
      }
    }
  });

  it('never drives a cooldown to zero or below at Legendary', () => {
    for (const g of MAJOR_GLYPHS) {
      if (g.effects.cooldownSec != null) expect(g.effects.cooldownSec).toBeGreaterThan(0);
    }
  });

  it('keeps every glyphed cooldown below its sigil\'s un-glyphed one', () => {
    const byId = new Map(Object.values(SIGILS_BY_CLASS).flat().map((d) => [d.id, d]));
    for (const g of MAJOR_GLYPHS) {
      if (g.effects.cooldownSec == null) continue;
      const base = byId.get(g.sigilId)?.active?.cooldownSec;
      expect(g.effects.cooldownSec, `${g.id}`).toBeLessThan(base);
    }
  });

  it('has no float noise in the published values', () => {
    for (const g of MAJOR_GLYPHS) {
      for (const v of Object.values(g.effects)) {
        expect(String(v).replace('-', '').split('.')[1]?.length ?? 0).toBeLessThanOrEqual(3);
      }
    }
  });

  it('ranks rarities from 1', () => {
    expect(glyphRarityRank('Common')).toBe(1);
    expect(glyphRarityRank('Legendary')).toBe(5);
    expect(glyphRarityRank('nonsense')).toBe(0);
  });
});

describe('lookup helpers', () => {
  it('addresses a variant by its <key>:<rarity> id', () => {
    const g = majorGlyphById('warhaste-emblem:rare');
    expect(g.name).toBe('Warhaste Emblem');
    expect(g.rarity).toBe('Rare');
    expect(g.effects.cooldownSec).toBe(12);
    expect(majorGlyphById('nope')).toBeNull();
  });

  it('derives the tick multiplier against the un-glyphed baseline', () => {
    // Common Emberhoard: 44% per tick vs a 40% base = x1.1.
    expect(glyphTickDamageMult(majorGlyphById('emberhoard-sigil:common'))).toBeCloseTo(1.1, 10);
    expect(glyphTickDamageMult(majorGlyphById('hemorrhagic-excess:uncommon'))).toBeCloseTo(48 / GLYPH_TICK_BASE_PCT, 10);
    // A glyph with no tick effect leaves the damage alone.
    expect(glyphTickDamageMult(majorGlyphById('warhaste-emblem:common'))).toBe(1);
    expect(glyphTickDamageMult(null)).toBe(1);
  });

  it('remaps the pre-catalogue glyph id onto its real variant', () => {
    // The old hand-modelled entry was +1 stack / x1.1 tick on Ember Curse.
    const mapped = resolveGlyphId('ember-curse-glyph');
    expect(mapped).toBe('emberhoard-sigil:common');
    const glyph = majorGlyphById(mapped);
    expect(glyph.sigilId).toBe('ember-curse');
    expect(glyph.effects.maxStacks).toBe(9);
    expect(glyphTickDamageMult(glyph)).toBeCloseTo(1.1, 10);
  });

  it('drops ids that resolve to nothing', () => {
    expect(resolveGlyphId('made-up:common')).toBeNull();
    expect(resolveGlyphId(null)).toBeNull();
  });
});
