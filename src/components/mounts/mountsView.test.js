import { it, expect } from 'vitest';
import { secondaryText } from './mountsView.js';
import { glyphSecondaryQuality } from '../../lib/model/glyphs.js';

it('formats glyph Crit Damage consistently in socket descriptions', () => {
  expect(secondaryText({ stat: 'critDamage', quality: glyphSecondaryQuality('critDamage', 0.09) })).toBe('+9% Crit Damage');
  expect(secondaryText({ stat: 'attackSpeed', quality: glyphSecondaryQuality('attackSpeed', 0.12) })).toBe('+0.12 Attack Speed');
});
