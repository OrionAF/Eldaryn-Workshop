import { it, expect } from 'vitest';
import { NAV_ITEM_COUNT, isLocked, navGroups, needsClass } from './navVisibility.js';

it('lists 19 pages in three groups, with Oblivion always present', () => {
  const groups = navGroups({});
  expect(groups.map((g) => g.area.label)).toEqual(['Character', 'Builds', 'Tools']);
  expect(groups.map((g) => g.items.length)).toEqual([10, 3, 6]);
  expect(NAV_ITEM_COUNT).toBe(19);
  expect(groups[2].items.map((i) => i.page.id)).toContain('tools/oblivion');
});

it('locks Oblivion Floors unless character.oblivion.unlocked is exactly true', () => {
  expect(isLocked('tools/oblivion', undefined)).toBe(true);
  expect(isLocked('tools/oblivion', {})).toBe(true);
  expect(isLocked('tools/oblivion', { oblivion: {} })).toBe(true);
  expect(isLocked('tools/oblivion', { oblivion: { unlocked: 'yes' } })).toBe(true);
  expect(isLocked('tools/oblivion', { oblivion: { unlocked: true } })).toBe(false);
  expect(isLocked('tools/duel', {})).toBe(false);
});

it('marks every page except Overview and Spec Guide as needing a class when the character has none', () => {
  const flagged = navGroups({ class: null }).flatMap((g) => g.items).filter((i) => i.needsClass);
  expect(flagged).toHaveLength(17);
  expect(flagged.some((i) => i.page.id === 'character/overview' || i.page.id === 'tools/spec-guide')).toBe(false);
  expect(navGroups({ class: 'WARRIOR' }).flatMap((g) => g.items).some((i) => i.needsClass)).toBe(false);
  expect(needsClass({ needsClass: false }, { class: null })).toBe(false);
});
