import { describe, it, expect } from 'vitest';
import { calculateAwakeningBonuses, awakeningBonusPerLevel } from './awakening.js';

const nz = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== 0));

describe('calculateAwakeningBonuses', () => {
  it('returns the 19-key zero bundle with no path or level <= 0', () => {
    const z = calculateAwakeningBonuses({ path: null, level: 10 });
    expect(Object.keys(z)).toHaveLength(19);
    expect(nz(z)).toEqual({});
    expect(nz(calculateAwakeningBonuses({ path: 'SHADOW', level: 0 }))).toEqual({});
  });
  it('Shadow default path (Warrior) at level 7', () => {
    expect(nz(calculateAwakeningBonuses({ path: 'SHADOW', level: 7 }))).toEqual({
      attackPercent: 14, critChanceFlat: 3.5, critDamageFlat: 14, penetrationFlat: 4.2,
    });
  });
  it('Shadow Mystic Mage: spec override replaces the whole bundle', () => {
    const r = calculateAwakeningBonuses({ path: 'SHADOW', level: 15 }, 'MYSTIC', 'MYSTIC_MAGE');
    expect(nz(r)).toEqual({ critDamageFlat: 30, spellDamageFlat: 30, spellCritChanceFlat: 7.5, spellVampFlat: 6 });
    expect(r.attackPercent).toBe(0);
  });
  it('Shadow Necromancer: class override, spec without override falls through to it', () => {
    const r = calculateAwakeningBonuses({ path: 'SHADOW', level: 15 }, 'NECROMANCER', 'NECROMANCER_DEATHLORD');
    expect(nz(r)).toEqual({ attackPercent: 30, critDamageFlat: 30, spellCritChanceFlat: 7.5, spellVampFlat: 6 });
  });
  it('Shadow Sentinel uses the path default (no class override)', () => {
    expect(awakeningBonusPerLevel('SHADOW', 'SENTINEL', 'SENTINEL_MARKSMANSHIP').penetrationFlat).toBe(0.6);
  });
  it('Radiant Warrior default, Sentinel, Mystic, Necromancer overrides', () => {
    expect(nz(calculateAwakeningBonuses({ path: 'RADIANT', level: 4 }, 'WARRIOR'))).toEqual({
      hpPercent: 10, hpRegenFlat: 2, damageReductionFlat: 2, blockChanceFlat: 2,
    });
    expect(nz(calculateAwakeningBonuses({ path: 'RADIANT', level: 10 }, 'SENTINEL'))).toEqual({
      hpPercent: 25, missChanceFlat: 10, blindChanceFlat: 5, paralyzeChanceFlat: 2,
    });
    expect(nz(calculateAwakeningBonuses({ path: 'RADIANT', level: 10 }, 'MYSTIC', 'MYSTIC_MAGE'))).toEqual({
      hpPercent: 25, hpRegenFlat: 7, spellResistFlat: 5,
    });
    // 2.7.4+: Minion Health / Soul Link (was HP / Regen / Spell Resist in 2.7.0)
    expect(nz(calculateAwakeningBonuses({ path: 'RADIANT', level: 3 }, 'NECROMANCER', 'NECROMANCER_DEATHLORD'))).toEqual({
      minionHealthPercent: 13.5, soulLinkFlat: 1.8,
    });
  });
  it('Radiant Necromancer reaches the totals as minion health and soul link', async () => {
    const { calculateTotalStats } = await import('../pipeline/totals.js');
    const awk = calculateAwakeningBonuses({ path: 'RADIANT', level: 15 }, 'NECROMANCER', 'NECROMANCER_DEATHLORD');
    const base = { attack: 100, hp: 1000 };
    const without = calculateTotalStats(base, undefined, undefined, undefined, undefined, undefined, undefined);
    const withAwk = calculateTotalStats(base, undefined, undefined, undefined, undefined, undefined, awk);
    expect(+(withAwk.totalMinionHealth - without.totalMinionHealth).toFixed(1)).toBe(67.5);
    expect(+(withAwk.totalSoulLink - without.totalSoulLink).toFixed(1)).toBe(9);
    expect(withAwk.totalHealthPercent).toBe(without.totalHealthPercent);
  });
  it('base bundles have no spell keys, which read as 0', () => {
    const r = calculateAwakeningBonuses({ path: 'RADIANT', level: 15 });
    expect(r.spellDamageFlat).toBe(0);
    expect(r.spellVampFlat).toBe(0);
  });
});
