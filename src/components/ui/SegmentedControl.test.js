import { it, expect, vi } from 'vitest';
import SegmentedControl from './SegmentedControl.svelte';
import { setup, click, key } from './testkit.js';

const options = [
  { value: 'quick', label: 'Quick', sub: '256' },
  { value: 'standard', label: 'Standard', sub: '1,024' },
  { value: 'deep', label: 'Thorough', disabled: true },
];

it('stack lays the options out vertically and never wraps', () => {
  const { q, done } = setup(SegmentedControl, { options, value: 'quick', stack: true });
  expect(q('.seg').classList.contains('stack')).toBe(true);
  done();
});

it('is a labelled group of aria-pressed buttons', () => {
  const { q, qa, done } = setup(SegmentedControl, { options, value: 'standard', label: 'Effort' });
  expect(q('[role=group]').getAttribute('aria-label')).toBe('Effort');
  expect(qa('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  done();
});

it('click selects, fires onchange, and shows the mono sub-label', () => {
  const onchange = vi.fn();
  const { qa, done } = setup(SegmentedControl, { options, value: 'standard', onchange });
  click(qa('button')[0]);
  expect(onchange).toHaveBeenCalledWith('quick');
  expect(qa('button')[0].getAttribute('aria-pressed')).toBe('true');
  expect(qa('button')[0].querySelector('.num').textContent).toBe('256');
  done();
});

it('a disabled segment cannot be chosen', () => {
  const onchange = vi.fn();
  const { qa, done } = setup(SegmentedControl, { options, value: 'quick', onchange });
  expect(qa('button')[2].disabled).toBe(true);
  done();
});

it('Left/Right arrows move the selection, stopping at the ends and skipping disabled', () => {
  const { qa, done } = setup(SegmentedControl, { options, value: 'quick' });
  key(qa('button')[0], 'ArrowRight');
  expect(qa('button')[1].getAttribute('aria-pressed')).toBe('true');
  key(qa('button')[1], 'ArrowRight'); // next is disabled: stays
  expect(qa('button')[1].getAttribute('aria-pressed')).toBe('true');
  key(qa('button')[1], 'ArrowLeft');
  expect(qa('button')[0].getAttribute('aria-pressed')).toBe('true');
  done();
});
