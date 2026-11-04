import { it, expect, beforeEach, vi } from 'vitest';
import { loadUi, saveUi } from './uiState.js';

const KEY = 'eldaryn_ui_v1';
beforeEach(() => localStorage.clear());

it('invalid opponent order and selectedId fall back to defaults', () => {
  localStorage.setItem(KEY, JSON.stringify({ opponents: { order: 'bogus', selectedId: 5 } }));
  expect(loadUi().opponents).toEqual({ order: 'added', selectedId: null });
});

it('a non-object opponents value is ignored', () => {
  for (const bad of ['x', 7, null, []]) {
    localStorage.setItem(KEY, JSON.stringify({ opponents: bad }));
    expect(loadUi().opponents).toEqual({ order: 'added', selectedId: null });
  }
});

it('valid opponent order and selectedId load', () => {
  localStorage.setItem(KEY, JSON.stringify({ opponents: { order: 'ready', selectedId: 'abc' } }));
  expect(loadUi().opponents).toEqual({ order: 'ready', selectedId: 'abc' });
});

it('a partial opponents patch keeps the sibling field', () => {
  saveUi({ opponents: { order: 'name' } });
  saveUi({ opponents: { selectedId: 'abc' } });
  expect(loadUi().opponents).toEqual({ order: 'name', selectedId: 'abc' });
  saveUi({ opponents: { order: 'newest' } });
  expect(loadUi().opponents).toEqual({ order: 'newest', selectedId: 'abc' });
});

it('throwing storage yields defaults and saveUi returns false', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(loadUi().opponents).toEqual({ order: 'added', selectedId: null });
  expect(saveUi({ opponents: { order: 'name' } })).toBe(false);
  get.mockRestore();
  set.mockRestore();
});
