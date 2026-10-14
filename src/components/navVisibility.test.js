import { it, expect } from 'vitest';
import { NAV_ITEMS, isNavVisible, visibleNav } from './navVisibility.js';

it('hides Oblivion unless character.oblivion.unlocked is exactly true', () => {
  expect(isNavVisible('oblivion', undefined)).toBe(false);
  expect(isNavVisible('oblivion', {})).toBe(false);
  expect(isNavVisible('oblivion', { oblivion: {} })).toBe(false);
  expect(isNavVisible('oblivion', { oblivion: { unlocked: 'yes' } })).toBe(false);
  expect(isNavVisible('oblivion', { oblivion: { unlocked: true } })).toBe(true);
});

it('shows every other item regardless of character', () => {
  expect(visibleNav({}).map((i) => i.id)).toEqual(NAV_ITEMS.filter((i) => i.id !== 'oblivion').map((i) => i.id));
  expect(visibleNav({ oblivion: { unlocked: true } })).toHaveLength(14);
});

it('has the four mobile main slots in order', () => {
  expect(NAV_ITEMS.filter((i) => i.mobileMain).map((i) => i.id)).toEqual(['presets', 'drop', 'optimiser', 'duel']);
});
