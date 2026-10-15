import { it, expect, vi } from 'vitest';
import Stepper from './Stepper.svelte';
import { setup, click, key } from './testkit.js';

it('is a labelled group with a number input and labelled +/- buttons', () => {
  const { q, qa, done } = setup(Stepper, { value: 5, min: 0, max: 10, label: 'Item level' });
  expect(q('[role=group]').getAttribute('aria-label')).toBe('Item level');
  expect(q('input[type=number]').value).toBe('5');
  expect(qa('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Decrease Item level', 'Increase Item level']);
  done();
});

it('the buttons step by one', () => {
  const onchange = vi.fn();
  const { qa, done } = setup(Stepper, { value: 5, min: 0, max: 10, label: 'L', onchange });
  click(qa('button')[1]);
  expect(onchange).toHaveBeenLastCalledWith(6);
  click(qa('button')[0]);
  expect(onchange).toHaveBeenLastCalledWith(5);
  done();
});

it('arrows step, Shift+arrow steps x10, Home/End jump to the limits', () => {
  const onchange = vi.fn();
  const { q, done } = setup(Stepper, { value: 20, min: 0, max: 100, label: 'L', onchange });
  const input = q('input');
  key(input, 'ArrowUp');
  expect(onchange).toHaveBeenLastCalledWith(21);
  key(input, 'ArrowUp', { shiftKey: true });
  expect(onchange).toHaveBeenLastCalledWith(31);
  key(input, 'ArrowDown', { shiftKey: true });
  expect(onchange).toHaveBeenLastCalledWith(21);
  key(input, 'End');
  expect(onchange).toHaveBeenLastCalledWith(100);
  key(input, 'Home');
  expect(onchange).toHaveBeenLastCalledWith(0);
  done();
});

it('at the limits the button is aria-disabled and does nothing; values clamp', () => {
  const onchange = vi.fn();
  const { q, qa, done } = setup(Stepper, { value: 10, min: 0, max: 10, label: 'L', onchange });
  expect(qa('button')[1].getAttribute('aria-disabled')).toBe('true');
  click(qa('button')[1]);
  expect(onchange).not.toHaveBeenCalled();
  key(q('input'), 'ArrowUp', { shiftKey: true });
  expect(onchange).not.toHaveBeenCalled();
  key(q('input'), 'ArrowDown', { shiftKey: true });
  expect(onchange).toHaveBeenLastCalledWith(0);
  done();
});
