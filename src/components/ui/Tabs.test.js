import { it, expect, vi } from 'vitest';
import Tabs from './Tabs.svelte';
import { setup, click, key } from './testkit.js';

const items = [
  { id: 'a', label: 'Base', count: 3 },
  { id: 'b', label: 'Oblivion', disabled: true, reason: 'Unlock Oblivion first' },
  { id: 'c', label: 'Other', sub: 'Set 1' },
];

it('is a tablist of tabs with aria-selected and a roving tabindex', () => {
  const { q, qa, done } = setup(Tabs, { items, value: 'a' });
  expect(q('[role=tablist]')).not.toBeNull();
  const tabs = qa('[role=tab]');
  expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  expect(tabs[0].getAttribute('aria-controls')).toMatch(/-panel-a$/);
  done();
});

it('click selects and reports the id', () => {
  const onchange = vi.fn();
  const { qa, done } = setup(Tabs, { items, value: 'a', onchange });
  click(qa('[role=tab]')[2]);
  expect(onchange).toHaveBeenCalledWith('c');
  expect(qa('[role=tab]')[2].getAttribute('aria-selected')).toBe('true');
  done();
});

it('arrow keys move between tabs, skipping disabled ones; Home/End jump', () => {
  const { q, qa, done } = setup(Tabs, { items, value: 'a' });
  const list = q('[role=tablist]');
  key(qa('[role=tab]')[0], 'ArrowRight');
  expect(qa('[role=tab]')[2].getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(qa('[role=tab]')[2]);
  key(qa('[role=tab]')[2], 'ArrowRight'); // wraps past the disabled tab to the first
  expect(qa('[role=tab]')[0].getAttribute('aria-selected')).toBe('true');
  key(list, 'End');
  expect(qa('[role=tab]')[2].getAttribute('aria-selected')).toBe('true');
  key(list, 'Home');
  expect(qa('[role=tab]')[0].getAttribute('aria-selected')).toBe('true');
  done();
});

it('a disabled tab cannot be selected and carries its reason', () => {
  const onchange = vi.fn();
  const { qa, done } = setup(Tabs, { items, value: 'a', onchange });
  const dis = qa('[role=tab]')[1];
  expect(dis.getAttribute('aria-disabled')).toBe('true');
  expect(dis.title).toBe('Unlock Oblivion first');
  click(dis);
  expect(onchange).not.toHaveBeenCalled();
  done();
});

it('shows the mono count and the muted sub-label', () => {
  const { q, done } = setup(Tabs, { items, value: 'a' });
  expect(q('.num').textContent).toBe('3');
  expect(q('.sub').textContent).toBe('Set 1');
  done();
});
