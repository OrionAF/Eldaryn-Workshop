import { it, expect, vi } from 'vitest';
import Select from './Select.svelte';
import { setup } from './testkit.js';

const options = [
  { value: 'a', label: 'Set A' },
  { value: 'b', label: 'Set B' },
];

it('labels the native select and lists the options', () => {
  const { q, qa, done } = setup(Select, { options, value: 'a', label: 'Talent set' });
  const select = q('select');
  expect(q('label').getAttribute('for')).toBe(select.id);
  expect(qa('option').map((o) => o.textContent)).toEqual(['Set A', 'Set B']);
  expect(select.value).toBe('a');
  done();
});

it('reports the chosen value', () => {
  const onchange = vi.fn();
  const { q, done } = setup(Select, { options, value: 'a', label: 'L', onchange });
  q('select').value = 'b';
  q('select').dispatchEvent(new Event('change', { bubbles: true }));
  expect(onchange).toHaveBeenCalledWith('b');
  done();
});

it('error state: aria-invalid, alert message linked by aria-describedby', () => {
  const { q, done } = setup(Select, { options, value: 'a', label: 'L', error: 'Pick a set' });
  const select = q('select');
  expect(select.getAttribute('aria-invalid')).toBe('true');
  expect(document.getElementById(select.getAttribute('aria-describedby')).textContent).toContain('Pick a set');
  done();
});

it('disabled disables the control; loading swaps it for a skeleton; meta is shown', () => {
  const d = setup(Select, { options, value: 'a', label: 'L', disabled: true, meta: '42 pts' });
  expect(d.q('select').disabled).toBe(true);
  expect(d.q('.meta').textContent).toBe('42 pts');
  d.done();
  const l = setup(Select, { options, value: 'a', label: 'L', loading: true });
  expect(l.q('select')).toBeNull();
  expect(l.q('[data-skeleton]')).not.toBeNull();
  l.done();
});
