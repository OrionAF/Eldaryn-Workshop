import { it, expect, vi } from 'vitest';
import Checkbox from './Checkbox.svelte';
import { setup, click } from './testkit.js';

it('is a real checkbox input inside a label with the box drawn aria-hidden', () => {
  const { q, done } = setup(Checkbox, { label: 'Include', checked: false });
  const input = q('input');
  expect(input.type).toBe('checkbox');
  expect(q('label').textContent.trim()).toBe('Include');
  expect(q('.box').getAttribute('aria-hidden')).toBe('true');
  done();
});

it('toggling reports the new state', () => {
  const onchange = vi.fn();
  const { q, done } = setup(Checkbox, { label: 'Include', checked: false, onchange });
  click(q('input'));
  expect(onchange).toHaveBeenCalledWith(true);
  expect(q('input').checked).toBe(true);
  done();
});

it('switch gets role=switch; plain checkbox does not', () => {
  const s = setup(Checkbox, { label: 'Reduce motion', switch: true });
  expect(s.q('input').getAttribute('role')).toBe('switch');
  expect(s.q('label').classList.contains('switch')).toBe(true);
  s.done();
  const c = setup(Checkbox, { label: 'x' });
  expect(c.q('input').getAttribute('role')).toBeNull();
  c.done();
});

it('disabled disables the input', () => {
  const { q, done } = setup(Checkbox, { label: 'x', disabled: true });
  expect(q('input').disabled).toBe(true);
  done();
});
