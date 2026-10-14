import { it, expect } from 'vitest';
import { fortressStatLabel, fortressStatValue } from './fortressView.js';
import { FORTRESS_BUFFS } from '../../lib/game/fortress.js';

it('labels every fortress combat stat with a proper name, never the raw key', () => {
  expect(fortressStatLabel('attackPercent')).toBe('Attack %');
  expect(fortressStatLabel('healthPercent')).toBe('Health %');
  expect(fortressStatLabel('pvpAttack')).toBe('PVP Attack');
  expect(fortressStatLabel('lifesteal')).toBe('Lifesteal');
  for (const group of Object.values(FORTRESS_BUFFS)) {
    for (const key of Object.keys(group.combat)) expect(fortressStatLabel(key)).not.toBe(key);
  }
});

it('formats values by unit: percent points, the Attack Speed multiplier, PvP ratings', () => {
  expect(fortressStatValue('attackPercent', 5)).toBe('+5%');
  expect(fortressStatValue('attackSpeed', 0.03)).toBe('+3%');
  expect(fortressStatValue('pvpAttack', 15)).toBe('+15');
  expect(fortressStatValue('pvpDefense', 25)).toBe('+25');
});
