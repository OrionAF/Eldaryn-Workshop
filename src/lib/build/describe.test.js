import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from './fixtures.js';
import { describeBuild } from './describe.js';
import { petDisplayName } from '../game/pets.js';

const line = (lines, label) => lines.find((l) => l.label === label)?.value;

describe('describeBuild', () => {
  const c = fixtureCharacter('WARRIOR');

  it('resolves every dimension to plain text', () => {
    const lines = describeBuild(c, 'p1');
    expect(line(lines, 'Gear')).toBe('Set 1');
    expect(line(lines, 'Talents')).toMatch(/^Arms - Sharpened Blade 5\/5/);
    expect(line(lines, 'Pet')).toBe(petDisplayName('INFERNAL_DRAKE', true)); // altar tier 2: evolved name
    expect(line(lines, 'Relics')).toContain('Iron Heart');
    expect(line(lines, 'Sigils')).toContain('Berserk Stance');
    expect(line(lines, 'Ancient sigil')).toBe('Flameborn');
    expect(line(lines, 'Mount')).toBe('Night Wolf (level 3)');
    expect(line(lines, 'Major glyphs')).toContain('Warhaste Emblem (Rare)');
    expect(line(lines, 'Transcendence')).toBe('Default (77 nodes)');
    expect(lines.every((l) => typeof l.label === 'string' && typeof l.value === 'string')).toBe(true);
  });

  it('an empty preset reads None and the Oblivion realm names its set', () => {
    const lines = describeBuild(c, 'p2', { realm: 'oblivion' });
    expect(line(lines, 'Gear')).toBe('Oblivion set');
    expect(line(lines, 'Pet')).toBe('None');
    expect(line(lines, 'Mount')).toBe('None');
    expect(line(lines, 'Relics')).toBe('None');
  });

  it('accepts a preset-shaped candidate and an allocation override', () => {
    const cand = { ...c.presets[0], petId: null, talentSet: 1 };
    const lines = describeBuild(c, cand, { talentAllocation: { tank_t1_fortitude: 2 } });
    expect(line(lines, 'Pet')).toBe('None');
    expect(line(lines, 'Talents')).toBe('Protection - Fortitude 2/5');
  });

  it('keeps unknown ids readable instead of throwing', () => {
    const cand = { ...c.presets[0], relicIds: ['relic_gone'], sigilSpecies: ['GONE_SIGIL'] };
    const lines = describeBuild(c, cand);
    expect(line(lines, 'Relics')).toBe('relic_gone');
    expect(line(lines, 'Sigils')).toBe('GONE_SIGIL');
  });
});
