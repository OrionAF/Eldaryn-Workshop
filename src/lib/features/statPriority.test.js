import { describe, it, expect } from 'vitest';
import { priorityTiers, tierLine, specPriority, priorityText, TIE_RATIO, KEEP_COUNT } from './statPriority.js';
import { GUIDE_SPECS } from './specGuide.js';
import guide from '../../data/specGuide.json';
import baseline from '../../data/specBaseline.json';

const row = (key, score, o = {}) => ({ key, label: key.toUpperCase(), score, ...o });

describe('tiers', () => {
  it('ranks by mean score and groups near-ties', () => {
    const entries = [
      { level: 40, damage: [row('a', 100), row('b', 90), row('c', 50), row('d', null)] },
      { level: 60, damage: [row('a', 100), row('b', 80), row('c', 40), row('d', null)] },
    ];
    const { tiers } = priorityTiers(entries, 'damage');
    expect(tiers.map((t) => t.map((s) => s.key))).toEqual([['a', 'b'], ['c']]);
    expect(tierLine(tiers)).toBe('A ≈ B > C');
    expect(85 / 100).toBeGreaterThanOrEqual(TIE_RATIO);
  });

  it('a stat inert at every level is left out; one that moves two places at a level is noted', () => {
    const entries = [
      { level: 40, damage: [row('a', 100), row('b', 50), row('c', 30), row('x', null, { inert: true })] },
      { level: 60, damage: [row('c', 100), row('a', 90), row('b', 40), row('x', null, { inert: true })] },
      { level: 80, damage: [row('a', 100), row('b', 50), row('c', 30), row('x', null, { inert: true })] },
    ];
    const { tiers, shifts } = priorityTiers(entries, 'damage');
    expect(tiers.flat().map((s) => s.key)).toEqual(['a', 'c', 'b']);
    expect(shifts).toEqual([]);
    const moved = priorityTiers([
      { level: 40, damage: [row('a', 100), row('b', 60), row('c', 40), row('d', 20)] },
      { level: 60, damage: [row('a', 100), row('b', 60), row('c', 40), row('d', 20)] },
      { level: 80, damage: [row('d', 100), row('a', 90), row('b', 50), row('c', 30)] },
    ], 'damage');
    expect(moved.tiers.flat().map((s) => s.key)).toEqual(['a', 'b', 'd', 'c']);
    expect(moved.shifts.map((s) => [s.key, s.level, s.rank, s.overall])).toEqual([['d', 80, 1, 3]]);
  });
});

describe('cards', () => {
  it('every spec has a card: a main list, gear to look for, an Awakening path', () => {
    for (const g of GUIDE_SPECS) {
      const c = specPriority(guide, baseline, g.id);
      expect(c.main.tiers.length, g.id).toBeGreaterThan(1);
      expect(c.keep).toHaveLength(KEEP_COUNT);
      expect(c.path).toMatch(/SHADOW|RADIANT/);
    }
  });

  it('a Mage leads with damage, keeps Spell Damage and ignores what a Mystic cannot use', () => {
    const c = specPriority(guide, baseline, 'MYSTIC_MAGE');
    expect(c.main.kind).toBe('damage');
    expect(c.keep).toContain('Spell Damage');
    expect(c.ignore.map((r) => r.label)).toEqual(expect.arrayContaining(['Dmg Reduction', 'Block Chance']));
    expect(c.ignore.every((r) => r.reason === 'no effect for Mystic')).toBe(true);
    expect(c.caps.find((x) => x.label === 'Attack Speed').text).toBe('200% (hard 400%)');
  });

  it('a tank leads with survival and takes the Radiant path', () => {
    const c = specPriority(guide, baseline, 'WARRIOR_TANK');
    expect(c.main.kind).toBe('survival');
    expect(c.path).toBe('RADIANT');
  });

  it('the text is the card, line by line', () => {
    const text = priorityText(specPriority(guide, baseline, 'MYSTIC_MAGE'));
    const lines = text.split('\n');
    expect(lines[0]).toBe('Mystic · Mage: stat priority');
    expect(lines[1]).toMatch(/^Damage: Attack Speed > /);
    expect(lines[2]).toMatch(/^Survival: /);
    expect(text).toContain('Look for on gear: ');
    expect(text).toContain('Awakening: Shadow Path');
    expect(text).toMatch(/Soft caps: Attack Speed 200% \(hard 400%\)/);
  });
});
