import { it, expect, vi } from 'vitest';
import Menu from './Menu.svelte';
import { setup, click, key } from './testkit.js';

const items = [
  { id: 'new', label: 'New character' },
  { id: 'sep', separator: true },
  { id: 'farm', label: 'Farm build', checked: true, meta: 'Set 1' },
  { id: 'boss', label: 'Boss build', checked: false },
  { id: 'off', label: 'Disabled one', disabled: true },
];

it('is a menu of menuitems; checked entries are menuitemcheckbox with aria-checked', () => {
  const { q, qa, done } = setup(Menu, { items, label: 'Presets' });
  expect(q('[role=menu]').getAttribute('aria-label')).toBe('Presets');
  expect(qa('[role=menuitem]').length).toBe(2);
  expect(qa('[role=menuitemcheckbox]').map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false']);
  expect(q('[role=separator]')).not.toBeNull();
  done();
});

it('moves focus to the checked item on open', () => {
  const { qa, done } = setup(Menu, { items });
  expect(document.activeElement).toBe(qa('[role=menuitemcheckbox]')[0]);
  done();
});

it('arrows rove (wrapping, skipping disabled), Home/End jump', () => {
  const { q, qa, done } = setup(Menu, { items });
  const menu = q('[role=menu]');
  const live = [...qa('[role^=menuitem]')].filter((b) => b.getAttribute('aria-disabled') !== 'true');
  key(menu, 'Home');
  expect(document.activeElement).toBe(live[0]);
  key(menu, 'ArrowDown');
  expect(document.activeElement).toBe(live[1]);
  key(menu, 'End');
  expect(document.activeElement).toBe(live[live.length - 1]);
  key(menu, 'ArrowDown');
  expect(document.activeElement).toBe(live[0]);
  key(menu, 'ArrowUp');
  expect(document.activeElement).toBe(live[live.length - 1]);
  done();
});

it('typeahead jumps to the next item starting with the typed letter', () => {
  const { q, qa, done } = setup(Menu, { items });
  key(q('[role=menu]'), 'b');
  expect(document.activeElement).toBe(qa('[role=menuitemcheckbox]')[1]);
  done();
});

it('Escape calls onclose; click selects an enabled item only', () => {
  const onclose = vi.fn();
  const onselect = vi.fn();
  const { q, qa, done } = setup(Menu, { items, onclose, onselect });
  key(q('[role=menu]'), 'Escape');
  expect(onclose).toHaveBeenCalledTimes(1);
  click(qa('[role^=menuitem]')[0]);
  expect(onselect).toHaveBeenCalledWith(items[0]);
  const disabled = qa('[aria-disabled=true]')[0];
  click(disabled);
  expect(onselect).toHaveBeenCalledTimes(1);
  done();
});
