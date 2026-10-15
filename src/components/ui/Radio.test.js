import { it, expect, vi } from 'vitest';
import Radio from './Radio.svelte';
import { setup, click } from './testkit.js';

it('is a real radio input inside a label, with a themed ring instead of the browser circle', () => {
  const { q, done } = setup(Radio, { name: 'wall', value: 'TOP', label: 'TOP', checked: true, ariaLabel: 'Fortress TOP' });
  const input = q('input[type=radio]');
  expect(input.name).toBe('wall');
  expect(input.checked).toBe(true);
  expect(input.getAttribute('aria-label')).toBe('Fortress TOP');
  expect(q('label.radio .ring')).not.toBeNull();
  expect(q('.text').textContent).toBe('TOP');
  done();
});

it('reports its value when picked', () => {
  const onchange = vi.fn();
  const { q, done } = setup(Radio, { name: 'wall', value: 'BOTTOM', label: 'BOTTOM', onchange });
  click(q('input'));
  expect(onchange).toHaveBeenCalledWith('BOTTOM');
  done();
});
