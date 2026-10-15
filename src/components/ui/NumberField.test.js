import { it, expect, vi } from 'vitest';
import NumberField from './NumberField.svelte';
import { flushSync } from 'svelte';
import { setup, type, key } from './testkit.js';

function blur(el) {
  el.dispatchEvent(new FocusEvent('blur'));
  flushSync();
}

it('flat stats read "." as thousands and show the formatted value on blur', () => {
  const onchange = vi.fn();
  const { q, done } = setup(NumberField, { value: 0, statKey: 'totalAttack', label: 'Attack', onchange });
  const input = q('input');
  type(input, '48.124');
  blur(input);
  expect(onchange).toHaveBeenCalledWith(48124);
  expect(input.value).toBe('48.124');
  done();
});

it('percentage stats read "." as a decimal point', () => {
  const onchange = vi.fn();
  const { q, done } = setup(NumberField, { value: 0, statKey: 'totalCritChance', label: 'Crit', unit: '%', onchange });
  type(q('input'), '6.2');
  blur(q('input'));
  expect(onchange).toHaveBeenCalledWith(6.2);
  done();
});

it('shows a live "Read as" echo while typing, linked by aria-describedby', () => {
  const { q, done } = setup(NumberField, { value: 0, statKey: 'totalAttack', label: 'Attack' });
  const input = q('input');
  type(input, '2.664');
  const echo = document.getElementById(input.getAttribute('aria-describedby'));
  expect(echo.textContent).toContain('Read as');
  expect(echo.textContent).toContain('2.664');
  done();
});

it('Enter commits', () => {
  const onchange = vi.fn();
  const { q, done } = setup(NumberField, { value: 1, label: 'Level', onchange });
  type(q('input'), '7');
  key(q('input'), 'Enter');
  expect(onchange).toHaveBeenCalledWith(7);
  done();
});

it('an out-of-range value is not committed and shows an aria-invalid error', () => {
  const onchange = vi.fn();
  const { q, done } = setup(NumberField, { value: 10, label: 'Level', max: 100, onchange });
  const input = q('input');
  type(input, '250');
  blur(input);
  expect(onchange).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(q('[role=alert]').textContent).toContain('Above the maximum');
  done();
});

it('an external error is shown and disabled disables the input', () => {
  const { q, done } = setup(NumberField, { value: 1, label: 'Level', error: 'Above this slot\'s cap', disabled: true });
  expect(q('[role=alert]').textContent).toContain('cap');
  expect(q('input').disabled).toBe(true);
  done();
});

it('empty text commits null only when nullable', () => {
  const a = vi.fn();
  const n = setup(NumberField, { value: 5, label: 'X', nullable: true, onchange: a });
  type(n.q('input'), '');
  blur(n.q('input'));
  expect(a).toHaveBeenCalledWith(null);
  n.done();
  const b = vi.fn();
  const r = setup(NumberField, { value: 5, label: 'X', onchange: b });
  type(r.q('input'), '');
  blur(r.q('input'));
  expect(b).not.toHaveBeenCalled();
  r.done();
});
