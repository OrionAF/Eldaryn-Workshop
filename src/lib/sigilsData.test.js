import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  SIGILS_BY_CLASS,
  SIGIL_MAX_LEVEL,
  SIGIL_MAX_TIER,
  sigilStat,
  hasSigilCurve,
  sigilEffectValue,
  sigilMinForgeTier,
  sigilUnlockedAt,
} from './sigilsData.js';

/**
 * The scrape is the spec. These read EldarynTracker/found_sigils.csv directly
 * rather than a copied fixture so that re-scraping re-validates the formulas
 * automatically instead of silently drifting from them.
 */
const CSV = resolve(dirname(fileURLToPath(import.meta.url)), '../../EldarynTracker/found_sigils.csv');

function loadRows() {
  const text = readFileSync(CSV, 'utf8').replace(/^﻿/, '');
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map((line) => {
    // Effect text is the last column and may contain commas.
    const parts = line.split(',');
    const head = parts.slice(0, cols.length - 1);
    const row = {};
    cols.slice(0, -1).forEach((c, i) => (row[c] = head[i]));
    row['Special Effect'] = parts.slice(cols.length - 1).join(',');
    return row;
  });
}

const ROWS = loadRows();
const BY_NAME = new Map(
  Object.values(SIGILS_BY_CLASS)
    .flat()
    .map((d) => [d.name, d]),
);

describe('sigil Attack/Health curve vs the scrape', () => {
  it('reproduces every scraped Attack/Health cell except the known level-5 Health quirk', () => {
    let checked = 0;
    const mismatches = [];

    for (const row of ROWS) {
      const def = BY_NAME.get(row['Sigil Name'].trim());
      if (!def) continue; // Earthwarden/Flameborn aren't in the class catalogues.
      const attack = Number(row.Attack);
      const health = Number(row.Health);
      if (!Number.isFinite(attack) || !Number.isFinite(health)) continue; // one '?' row
      const level = Number(row.Level);
      const tier = Number(row.Tier);
      checked += 1;

      const gotAttack = sigilStat(def, 'attack', level, tier);
      const gotHealth = sigilStat(def, 'health', level, tier);
      if (gotAttack !== attack) mismatches.push({ n: def.name, level, tier, stat: 'attack', want: attack, got: gotAttack });
      if (gotHealth !== health) mismatches.push({ n: def.name, level, tier, stat: 'health', want: health, got: gotHealth });
    }

    // All 332 CSV rows less the one Iron Bastion row scraped as '?'. This
    // includes the 4 Earthwarden/Flameborn rows, which the Ancient curve
    // reproduces once their x3 ladder starts at Forge Tier 2.
    expect(checked).toBe(331);
    // Every remaining mismatch is Health at level 5, low by exactly 1.
    for (const m of mismatches) {
      expect(m.stat).toBe('health');
      expect(m.level).toBe(5);
      expect(m.got - m.want).toBe(1);
    }
    expect(mismatches).toHaveLength(14);
  });

  it('truncates rather than rounds - Wild Renewal L7/T1 is 265, not 266', () => {
    const wildRenewal = BY_NAME.get('Wild Renewal');
    expect(sigilStat(wildRenewal, 'attack', 7, 1)).toBe(265);
  });

  it('starts the Legendary/Ancient x3 ladder at Forge Tier 2', () => {
    const bulwark = BY_NAME.get('Bulwark of Thorns');
    expect(sigilMinForgeTier(bulwark)).toBe(2);
    // Forge Tier 2 is the sigil's own tier 1, so no x3 multiplier yet.
    expect(sigilStat(bulwark, 'attack', 1, 2)).toBe(27000);
    expect(sigilStat(bulwark, 'attack', 1, 3)).toBe(81000);
    // Below its minimum tier it cannot be equipped, so it contributes nothing.
    expect(sigilStat(bulwark, 'attack', 1, 1)).toBe(0);
    expect(sigilUnlockedAt(bulwark, 1)).toBe(false);
    expect(sigilUnlockedAt(bulwark, 2)).toBe(true);
  });

  it('a Common sigil is unlocked at every forge tier and scales x3 per tier', () => {
    const defense = BY_NAME.get('Defense Stance');
    expect(sigilUnlockedAt(defense, 1)).toBe(true);
    expect(sigilStat(defense, 'attack', 1, 2)).toBe(sigilStat(defense, 'attack', 1, 1) * 3);
  });

  it('level 0 means not owned and contributes nothing', () => {
    const defense = BY_NAME.get('Defense Stance');
    expect(sigilStat(defense, 'attack', 0, 1)).toBe(0);
    expect(sigilStat(defense, 'health', 0, 3)).toBe(0);
  });

  it('levels to 30, extending the same linear curve past the scrape', () => {
    expect(SIGIL_MAX_LEVEL).toBe(30);
    const defense = BY_NAME.get('Defense Stance');
    // Common attack slope 16.6, offset +9: level 30 => floor(16.6 * 39).
    expect(sigilStat(defense, 'attack', 30, 1)).toBe(Math.floor(16.6 * 39));
    // Still strictly increasing all the way up, with no plateau or wrap.
    for (let l = 2; l <= SIGIL_MAX_LEVEL; l += 1) {
      expect(sigilStat(defense, 'attack', l, 1)).toBeGreaterThan(sigilStat(defense, 'attack', l - 1, 1));
    }
  });

  it('effect magnitudes stay defined at every level up to 30', () => {
    for (const def of Object.values(SIGILS_BY_CLASS).flat()) {
      for (let l = 1; l <= SIGIL_MAX_LEVEL; l += 1) {
        for (const key of ['health_pct', 'attack_pct', 'speed', 'lifesteal', 'hp_regen', 'miss_chance', 'blind_chance', 'dmg_reduction', 'block_chance', 'regenDebuffPct']) {
          const v = sigilEffectValue(def, key, l);
          // null = not baked for this sigil; a number must never be NaN/undefined.
          if (v !== null) expect(Number.isFinite(v), `${def.id} ${key} L${l}`).toBe(true);
        }
      }
    }
  });

  it("Sanguine Rush's stepped attack speed holds its 30% past the old level cap", () => {
    const sanguine = BY_NAME.get('Sanguine Rush');
    expect(sigilEffectValue(sanguine, 'speed', 4)).toBe(20);
    expect(sigilEffectValue(sanguine, 'speed', 5)).toBe(30);
    expect(sigilEffectValue(sanguine, 'speed', 14)).toBe(30);
    expect(sigilEffectValue(sanguine, 'speed', 30)).toBe(30);
  });

  it('caps still bind at high levels rather than growing without limit', () => {
    const ironBastion = BY_NAME.get('Iron Bastion');
    expect(sigilEffectValue(ironBastion, 'health_pct', 30)).toBe(50);
    expect(sigilEffectValue(ironBastion, 'dmg_reduction', 30)).toBe(35);
  });

  it('clamps level and tier to their legal ranges', () => {
    const defense = BY_NAME.get('Defense Stance');
    expect(sigilStat(defense, 'attack', 999, 1)).toBe(sigilStat(defense, 'attack', SIGIL_MAX_LEVEL, 1));
    expect(sigilStat(defense, 'attack', 1, 99)).toBe(sigilStat(defense, 'attack', 1, SIGIL_MAX_TIER));
  });

  it('every catalogue sigil has a rarity curve', () => {
    const without = Object.values(SIGILS_BY_CLASS).flat().filter((d) => !hasSigilCurve(d));
    expect(without).toEqual([]);
  });
});

describe('sigil effect magnitudes vs the scrape', () => {
  /** The stat magnitudes in a tooltip, in declaration order, before "for Ns". */
  function magnitudes(effect) {
    const head = effect.split(/\bfor\s*\d/)[0];
    return [...head.matchAll(/(\?|\d+(?:\.\d+)?)\s*%/g)].map((m) => m[1]);
  }

  // Which statKeys the numbers in each tooltip map onto, in order.
  const ORDER = {
    'Defense Stance': ['health_pct'],
    'Berserk Stance': ['attack_pct'],
    'Wild Renewal': ['hp_regen'],
    'Mist Veil': ['miss_chance'],
    'Hawk Focus': ['speed'],
    Rejuvenation: ['hp_regen'],
    'Sanguine Rush': ['speed', 'lifesteal'],
    'Phantom Veil': ['miss_chance'],
    'Blinding Mark': ['blind_chance'],
    'Iron Bastion': ['health_pct', 'dmg_reduction', 'block_chance'],
    'Warborn Fury': ['attack_pct', 'penetration', 'dmg_reduction'],
    'Withering Touch': ['regenDebuffPct'],
  };

  it('reproduces every scraped magnitude except one OCR-mangled cell', () => {
    let checked = 0;
    const mismatches = [];

    for (const row of ROWS) {
      const name = row['Sigil Name'].trim();
      const keys = ORDER[name];
      if (!keys) continue;
      const def = BY_NAME.get(name);
      const nums = magnitudes(row['Special Effect']);
      expect(nums).toHaveLength(keys.length);

      keys.forEach((key, i) => {
        if (nums[i] === '?') return; // unscraped (Warborn Fury penetration)
        const baked = sigilEffectValue(def, key, Number(row.Level));
        if (baked === null) return; // deliberately manual
        checked += 1;
        if (baked !== Number(nums[i])) {
          mismatches.push({ name, level: Number(row.Level), key, want: Number(nums[i]), got: baked });
        }
      });
    }

    // Every baked magnitude in the scrape. Warborn Fury's penetration is
    // excluded (deliberately manual), which is the 5 known cells it has.
    expect(checked).toBe(305);
    // Sanguine Rush L10 reads "lifesteal by25%" in the source - the run-together
    // digits dropped a ".8". Every other level of that stat lands on the law.
    expect(mismatches).toEqual([
      { name: 'Sanguine Rush', level: 10, key: 'lifesteal', want: 25, got: 25.8 },
    ]);
  });

  it('magnitudes depend on level only, never on forge tier', () => {
    const ironBastion = BY_NAME.get('Iron Bastion');
    // The function takes no tier at all - this documents that as intentional.
    expect(sigilEffectValue(ironBastion, 'health_pct', 5)).toBe(39.6);
    expect(sigilEffectValue.length).toBe(3); // (def, statKey, level)
  });

  it('applies per-sigil caps, not a global one', () => {
    const ironBastion = BY_NAME.get('Iron Bastion');
    const warborn = BY_NAME.get('Warborn Fury');
    // Same stat, different ceilings.
    expect(sigilEffectValue(ironBastion, 'dmg_reduction', 13)).toBe(35);
    expect(sigilEffectValue(warborn, 'dmg_reduction', 13)).toBe(30);
    expect(sigilEffectValue(ironBastion, 'health_pct', 13)).toBe(50);
    expect(sigilEffectValue(warborn, 'attack_pct', 13)).toBe(20);
  });

  it('honours the step override where the growth law does not apply', () => {
    const sanguine = BY_NAME.get('Sanguine Rush');
    expect(sigilEffectValue(sanguine, 'speed', 4)).toBe(20);
    expect(sigilEffectValue(sanguine, 'speed', 5)).toBe(30);
  });

  it('rounds to the decimals the game displays', () => {
    // Hawk Focus shows whole percents; Defense Stance shows one decimal.
    expect(sigilEffectValue(BY_NAME.get('Hawk Focus'), 'speed', 4)).toBe(12);
    expect(sigilEffectValue(BY_NAME.get('Defense Stance'), 'health_pct', 2)).toBe(8.6);
  });

  it('returns null for stats that stay manual, and 0 at level 0', () => {
    const warborn = BY_NAME.get('Warborn Fury');
    expect(sigilEffectValue(warborn, 'penetration', 4)).toBeNull();
    expect(sigilEffectValue(BY_NAME.get('Cataclysm'), 'attack_pct', 4)).toBeNull();
    expect(sigilEffectValue(warborn, 'attack_pct', 0)).toBe(0);
  });
});
