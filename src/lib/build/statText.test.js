import { describe, it, expect } from 'vitest';
import { statLabel, statValueText, statParts, statLine, glyphStatLine, petText, mountText, glyphText } from './statText.js';
import { fixtureCharacter } from './fixtures.js';
import { glyphSecondaryQuality } from '../model/glyphs.js';

describe('stat lines (backlog §6: labels, never raw keys)', () => {
  it('labels a secondary type as the gear screens do', () => {
    expect(statLabel('CRIT_CHANCE')).toBe('Crit Chance');
    expect(statLabel('MINION_ATTACK_SPEED')).toMatch(/^Minion/);
    expect(statLabel('HEALTH_PERCENT')).not.toMatch(/_/);
  });
  it('multiplier stats are deltas (x100) unless the source stores percent points', () => {
    expect(statValueText('CRIT_DAMAGE', 0.09)).toBe('+9%');
    expect(statValueText('ATTACK_SPEED', 0.05)).toBe('+5%');
    expect(statValueText('CRIT_DAMAGE', 9, { points: true })).toBe('+9%');
    expect(statValueText('HEALTH_PERCENT', 4.5)).toBe('+4.5%');
    expect(statValueText('PVP_ATTACK', 120)).toBe('+120');
  });
  it('drops the label\'s own "%" when the value carries one', () => {
    expect(statLine('HEALTH_PERCENT', 4.5)).toBe('Health +4.5%');
    expect(statLine('CRIT_DAMAGE', 0.09)).toBe('Crit Damage +9%');
    expect(statParts('ATTACK_PERCENT', 3.2)).toEqual({ label: 'Attack', text: '+3.2%' });
  });
  it('a glyph secondary reads in its pool unit: healthPercent 4.5 and critDamage 0.09', () => {
    expect(glyphStatLine({ stat: 'healthPercent', quality: glyphSecondaryQuality('healthPercent', 4.5) })).toBe('Health +4.5%');
    expect(glyphStatLine({ stat: 'critDamage', quality: glyphSecondaryQuality('critDamage', 0.09) })).toBe('Crit Damage +9%');
  });
});

describe('owned items, named so copies are told apart', () => {
  const c = fixtureCharacter('WARRIOR');
  const pet = c.pets.owned[0];

  it('a pet: name, rarity and every secondary in percent points', () => {
    const text = petText(c, pet);
    expect(text).toContain('Legendary');
    for (const s of pet.secondaries) expect(text).toContain(statLine(s.type, s.value, { points: true }));
    expect(text).not.toMatch(/[A-Z]{2,}_|identical/);
  });
  it('two identical pets: "either of your 2 identical copies"', () => {
    const twin = { ...c, pets: { ...c.pets, owned: [pet, { ...pet, id: 'pet-b' }] } };
    expect(petText(twin, pet)).toContain('either of your 2 identical copies');
    const other = { ...c, pets: { ...c.pets, owned: [pet, { ...pet, id: 'pet-b', secondaries: [] }] } };
    expect(petText(other, pet)).not.toContain('identical');
  });
  it('a mount: level and its base rolls', () => {
    const m = c.mounts[0];
    expect(mountText(c, m)).toMatch(/level 3/);
    expect(mountText(c, m)).toContain('HP 7');
    expect(mountText(c, m)).toContain('Attack 7');
  });
  it('a glyph: rarity and stat; identical copies said once', () => {
    const g = c.glyphs[0];
    expect(glyphText(c, g)).toMatch(/\(Common · Crit Chance \+[\d.]+%\)/);
    const twin = { ...c, glyphs: [...c.glyphs, { ...g, id: 'gl-x' }] };
    expect(glyphText(twin, g)).toContain('either of your 2 identical copies');
  });
});
