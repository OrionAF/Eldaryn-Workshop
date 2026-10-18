import { describe, it, expect } from 'vitest';
import { spellRows, sigilSpellBlocks, statName, conditionLabel } from './sigilView.js';

describe('sigilView', () => {
  it('shows scaled numbers from sigilScale: Blade of Judgment 80% grows 8% per level, capped at 120', () => {
    // L5: scale 1 + 4*0.08 = 1.32; 80 * 1.32 = 105.6. L20: 80 * 2.52 = 201.6 -> cap 120.
    expect(sigilSpellBlocks('BLADE_OF_JUDGMENT', 5)[0].rows).toEqual([
      { label: 'Damage', value: '105.6% of Attack' },
      { label: 'Cooldown', value: '8s' },
    ]);
    expect(sigilSpellBlocks('BLADE_OF_JUDGMENT', 20)[0].rows[0].value).toBe('120% of Attack');
  });

  it('auras: percent stats use 1 decimal, Attack Speed 2 decimals and no percent sign', () => {
    // Berserk Aura L10: 4 * 1.72 = 6.88 -> 6.9. Hawk Focus L5: 0.1 * 1.32 = 0.132 -> 0.13.
    expect(sigilSpellBlocks('BERSERK_STANCE', 10)[0].rows).toEqual([{ label: 'Attack', value: '+6.9%' }]);
    expect(sigilSpellBlocks('HAWK_FOCUS', 5)[0].rows).toEqual([{ label: 'Attack Speed', value: '+0.13' }]);
  });

  it('buffs list each effect then duration and cooldown', () => {
    const rows = sigilSpellBlocks('SANGUINE_RUSH', 5)[0].rows;
    // Attack Speed 0.2 * 1.32 = 0.264 -> 0.3 (one decimal, doc §5); Lifesteal 15 * 1.32 = 19.8
    expect(rows).toEqual([
      { label: 'Attack Speed', value: '+0.3' },
      { label: 'Lifesteal', value: '+19.8%' },
      { label: 'Duration', value: '6s' },
      { label: 'Cooldown', value: '14s' },
    ]);
  });

  it('STACK sigils have no scaled rows', () => {
    expect(sigilSpellBlocks('BULWARK_OF_THORNS', 9)[0].rows).toEqual([]);
  });

  it('a Druid sees the variant, one block per form; a Mage sees the base spell', () => {
    const druid = sigilSpellBlocks('ARCANE_SURGE', 1, 'MYSTIC_DRUID');
    expect(druid.map((b) => b.form)).toEqual(['BEAR', 'WOLF']);
    expect(druid[0].title).toBe('Feral Empowerment');
    expect(druid[0].rows[0]).toEqual({ label: 'Damage Reduction', value: '+10%' });
    const mage = sigilSpellBlocks('ARCANE_SURGE', 1, 'MYSTIC_MAGE');
    expect(mage).toHaveLength(1);
    expect(mage[0].form).toBeNull();
  });

  it('spellRows tolerates empty input; labels are readable', () => {
    expect(spellRows(null, 'AURA')).toEqual([]);
    expect(statName('BLOCK_CHANCE')).toBe('Block');
    expect(statName('SOME_NEW_STAT')).toBe('Some New Stat');
    expect(conditionLabel('ON_COOLDOWN')).toBe('On cooldown');
    expect(conditionLabel('ENEMY_HP_BELOW_40')).toBe('Enemy HP at or below 40%');
    expect(conditionLabel('MY_HP_BELOW_80')).toBe('My HP at or below 80%');
  });
});
