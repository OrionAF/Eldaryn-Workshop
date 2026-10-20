import { describe, expect, it } from 'vitest';
import { assetUrl } from './base.js';
import { transcendenceImage } from './transcendence.js';

const node = (stats, kind = 'minor') => ({ kind, stats: stats.map((stat) => ({ stat, value: 1 })) });

describe('Transcendence emblem selection', () => {
  it('resolves both rarities of each stat family to distinct real artwork', () => {
    for (const [stat, category] of Object.entries({ attackPercent: 'attack', hpPercent: 'defense',
      fearChanceFlat: 'control', spellDamageFlat: 'spell', soulLinkFlat: 'minion', dominionFlat: 'dominion' })) {
      const common = transcendenceImage(node([stat]));
      const uncommon = transcendenceImage(node([stat], 'notable'));
      expect(common).toBeTruthy();
      expect(uncommon).toBeTruthy();
      expect(common).toBe(assetUrl(`transcendence_${category}_common`));
      expect(uncommon).toBe(assetUrl(`transcendence_${category}_uncommon`));
      expect(common).not.toBe(uncommon);
    }
  });

  it('prioritises distinctive stat families on mixed nodes independently of stat order', () => {
    for (const stats of [['hpPercent', 'spellDamageFlat'], ['spellDamageFlat', 'hpPercent']]) {
      expect(transcendenceImage(node(stats, 'notable'))).toBe(assetUrl('transcendence_spell_uncommon'));
    }
    expect(transcendenceImage(node(['spellDamageFlat', 'soulLinkFlat']))).toBe(assetUrl('transcendence_minion_common'));
    expect(transcendenceImage(node(['hpPercent', 'blindChanceFlat']))).toBe(assetUrl('transcendence_control_common'));
    expect(transcendenceImage({ ...node([]), special: 'DOMINION' })).toBe(assetUrl('transcendence_dominion_common'));
  });

  it('leaves special node symbols and unknown inputs to the existing fallback', () => {
    for (const kind of ['start', 'sigil', 'socket']) expect(transcendenceImage(node(['attackPercent'], kind))).toBeNull();
    expect(transcendenceImage(node(['futureStat']))).toBeNull();
    expect(transcendenceImage(null)).toBeNull();
  });
});
