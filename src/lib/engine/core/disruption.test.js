import { describe, it, expect } from 'vitest';
import { disruptionEffectFor } from './disruption.js';

describe('disruptionEffectFor (stats.md §3.2)', () => {
  it('Silence by default; Necromancer Fear; Mystic Bear Stagger and Wolf Fear', () => {
    expect(disruptionEffectFor('WARRIOR')).toBe('SILENCE');
    expect(disruptionEffectFor('SENTINEL', 'BEAR')).toBe('SILENCE');
    expect(disruptionEffectFor('NECROMANCER')).toBe('FEAR');
    expect(disruptionEffectFor('MYSTIC')).toBe('SILENCE');
    expect(disruptionEffectFor('MYSTIC', 'BEAR')).toBe('STAGGER');
    expect(disruptionEffectFor('MYSTIC', 'WOLF')).toBe('FEAR');
  });
});
