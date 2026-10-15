import { it, expect, vi } from 'vitest';
import PickCard from './PickCard.svelte';
import { setup, click } from './testkit.js';

it('is a radio with aria-checked, name and meta', () => {
  const { q, done } = setup(PickCard, { name: 'Emberkit', meta: 'Epic · tier 3', checked: true });
  const r = q('[role=radio]');
  expect(r.getAttribute('aria-checked')).toBe('true');
  expect(q('.name').textContent).toBe('Emberkit');
  expect(q('.meta').textContent).toBe('Epic · tier 3');
  done();
});

it('click selects; unchecked reports aria-checked false', () => {
  const onselect = vi.fn();
  const { q, done } = setup(PickCard, { name: 'x', onselect });
  expect(q('[role=radio]').getAttribute('aria-checked')).toBe('false');
  click(q('[role=radio]'));
  expect(onselect).toHaveBeenCalledTimes(1);
  done();
});

it('disabled does not select', () => {
  const onselect = vi.fn();
  const { q, done } = setup(PickCard, { name: 'x', disabled: true, onselect });
  expect(q('[role=radio]').getAttribute('aria-disabled')).toBe('true');
  click(q('[role=radio]'));
  expect(onselect).not.toHaveBeenCalled();
  done();
});

it('art is decorative (empty alt)', () => {
  const { q, done } = setup(PickCard, { name: 'x', art: '/a.png' });
  expect(q('img').getAttribute('alt')).toBe('');
  done();
});
