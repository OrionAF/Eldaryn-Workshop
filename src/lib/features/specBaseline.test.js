import { describe, it, expect } from 'vitest';
import {
  BASELINE, BASELINE_LEVELS, PROFILES, statValues, rollDrop, baselineSetup, itemScore, simulatePlayer, runBaseline,
  formatTotal, rangeText, baselineText,
} from './specBaseline.js';
import { GUIDE_SPECS } from './specGuide.js';
import { secondaryStatCount, secondaryStatCeiling, SECONDARY_STAT_POOL } from '../game/gear.js';
import { mulberry32 } from '../engine/rng.js';
import guide from '../../data/specGuide.json';
import baseline from '../../data/specBaseline.json';

describe('per-unit values', () => {
  it('reads the guide at its levels and blends linearly between them', () => {
    const at60 = statValues(guide, 'MYSTIC_MAGE', 60).damage.get('totalSpellDamage');
    const at80 = statValues(guide, 'MYSTIC_MAGE', 80).damage.get('totalSpellDamage');
    expect(statValues(guide, 'MYSTIC_MAGE', 70).damage.get('totalSpellDamage')).toBeCloseTo((at60 + at80) / 2, 9);
    expect(at60).toBeGreaterThan(0);
  });

  it('a stat with no effect for the class is worth nothing', () => {
    expect(statValues(guide, 'MYSTIC_MAGE', 100).survival.get('totalDamageReduction')).toBe(0);
  });
});

describe('drops', () => {
  it('rolls lines as the game does: the rarity\'s count, distinct stats, between min and the level ceiling', () => {
    const setup = baselineSetup(guide, 'WARRIOR_DPS', 60, 'damage');
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const it = rollDrop(rng, 'WARRIOR', 60, setup.rates, setup.pool);
      expect(it.secondaryStats).toHaveLength(secondaryStatCount(it.rarity));
      expect(new Set(it.secondaryStats.map((l) => l.type)).size).toBe(it.secondaryStats.length);
      for (const l of it.secondaryStats) {
        const def = SECONDARY_STAT_POOL.find((d) => d.type === l.type);
        expect(l.value).toBeGreaterThanOrEqual(def.minValue);
        expect(l.value).toBeLessThanOrEqual(Number(secondaryStatCeiling(def, 60).toFixed(def.decimals)));
        expect(setup.banned).not.toContain(l.type);
      }
      expect(['DIVINE', 'ETERNAL', 'OBLIVION']).not.toContain(it.rarity); // none drop at 60
    }
  });

  it('Attunement bans the stats the profile values least: survival for Damage', () => {
    const s = baselineSetup(guide, 'MYSTIC_MAGE', 80, 'damage');
    expect(s.banned).toHaveLength(BASELINE.attunementBans + 1); // Mystic's class bonus
    expect(s.banned).toContain('HEALTH_PERCENT');
    expect(baselineSetup(guide, 'MYSTIC_MAGE', 80, 'balanced').banned).not.toContain('HEALTH_PERCENT');
  });

  it('scores an item by what its stats are worth to the spec', () => {
    const s = baselineSetup(guide, 'MYSTIC_MAGE', 80, 'damage');
    const item = (type, value) => ({ primaryStats: { attack: 0, hp: 0 }, secondaryStats: [{ type, value }] });
    expect(itemScore(s, item('SPELL_DAMAGE', 10))).toBeGreaterThan(0);
    expect(itemScore(s, item('BLOCK_CHANCE', 3))).toBe(0);
  });
});

describe('players', () => {
  it('a player has every slot filled and takes an Awakening path from level 45', () => {
    const s = baselineSetup(guide, 'SENTINEL_MARKSMANSHIP', 60, 'damage');
    const p = simulatePlayer(s, mulberry32(3), 300);
    expect(p.path).toMatch(/SHADOW|RADIANT/);
    expect(p.stats.totalAttack).toBeGreaterThan(0);
    expect(simulatePlayer(baselineSetup(guide, 'SENTINEL_MARKSMANSHIP', 40, 'damage'), mulberry32(3), 300).path).toBeNull();
  });

  it('an entry is deterministic and orders Attack, Health, then the valued stats', () => {
    const a = runBaseline(guide, 'MYSTIC_MAGE', 60, 'damage', { players: 20, drops: 200 });
    const b = runBaseline(guide, 'MYSTIC_MAGE', 60, 'damage', { players: 20, drops: 200 });
    expect(a).toEqual(b);
    expect(a.rows.slice(0, 2).map((r) => r.key)).toEqual(['totalAttack', 'totalHp']);
    for (const r of a.rows) expect(r.lo).toBeLessThanOrEqual(r.hi);
    const firstUnvalued = a.rows.findIndex((r, i) => i > 1 && !r.valued);
    if (firstUnvalued > 0) expect(a.rows.slice(firstUnvalued).every((r) => !r.valued)).toBe(true);
  });
});

describe('text', () => {
  it('formats totals as the sheet does: Attack Speed as a percent, flats grouped', () => {
    expect(formatTotal('totalAttackSpeed', 1.67)).toBe('167%');
    expect(formatTotal('totalSpellDamage', 42.64)).toBe('42.6%');
    expect(formatTotal('totalAttack', 9876.4)).toBe('9,876');
    expect(formatTotal('totalAttack', 12345.6)).toBe('12.3k');
    expect(formatTotal('totalHp', 381300)).toBe('381k');
    expect(rangeText('totalAttackSpeed', { lo: 1.2, hi: 1.35 })).toBe('120-135%');
    expect(rangeText('totalAttack', { lo: 313800, hi: 381300 })).toBe('314-381k');
    expect(rangeText('totalAttack', { lo: 9000, hi: 12000 })).toBe('9,000-12k');
  });

  it('the share text has a block per level', () => {
    const entries = baseline.entries.filter((e) => e.id === 'MYSTIC_MAGE' && e.profile === 'damage');
    const text = baselineText(entries);
    expect(text).toContain('Mystic · Mage: stat baseline (Damage build)');
    expect(text).toContain('Level 40\n');
    expect(text).toMatch(/Level 60 \((Shadow|Radiant) Path, 15 points\)/);
    expect(text).toMatch(/Spell Damage: [\d.]+-[\d.]+%/);
  });
});

describe('src/data/specBaseline.json (npm run gen:spec-baseline)', () => {
  it('has every spec at every level for every profile, made with the current assumptions', () => {
    expect(baseline.levels).toEqual([...BASELINE_LEVELS]);
    expect(baseline.assumptions).toEqual({ ...BASELINE });
    for (const g of GUIDE_SPECS) {
      for (const level of BASELINE_LEVELS) {
        for (const p of PROFILES) {
          const e = baseline.entries.find((x) => x.id === g.id && x.level === level && x.profile === p.id);
          expect(e, `${g.id} L${level} ${p.id}`).toBeTruthy();
          expect(e.rows[0].key).toBe('totalAttack');
        }
      }
    }
  });
});
