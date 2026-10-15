import { it, expect } from 'vitest';
import Skeleton from './Skeleton.svelte';
import { setup } from './testkit.js';

it('renders the requested number of bars, hidden from assistive tech', () => {
  const { q, qa, done } = setup(Skeleton, { lines: 3 });
  expect(qa('.skeleton').length).toBe(3);
  expect(q('[data-skeleton]').getAttribute('aria-hidden')).toBe('true');
  done();
});

it('the last of several lines is shorter', () => {
  const { qa, done } = setup(Skeleton, { lines: 2, width: '100%' });
  const [a, b] = qa('.skeleton');
  expect(a.style.width).toBe('100%');
  expect(b.style.width).toBe('60%');
  done();
});
