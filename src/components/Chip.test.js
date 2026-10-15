import { it, expect, vi } from 'vitest';
import Chip from './Chip.svelte';
import { setup, click } from './ui/testkit.js';

it('is a toggle button reflecting selected via aria-pressed', () => {
  const onClick = vi.fn();
  const { q, done } = setup(Chip, { label: 'Set 1', selected: true, onClick });
  expect(q('button').getAttribute('aria-pressed')).toBe('true');
  expect(q('button').classList.contains('selected')).toBe(true);
  click(q('button'));
  expect(onClick).toHaveBeenCalledTimes(1);
  done();
});

it('keeps its text content to the label (the tick is not text)', () => {
  const { q, done } = setup(Chip, { label: 'Set 2' });
  expect(q('button').textContent.trim()).toBe('Set 2');
  done();
});

it('shows the optional mono count', () => {
  const { q, done } = setup(Chip, { label: 'Slots', count: 4 });
  expect(q('.num').textContent).toBe('4');
  done();
});

it('disabled with no reason is natively disabled', () => {
  const onClick = vi.fn();
  const { q, done } = setup(Chip, { label: 'Relic', disabled: true, onClick });
  expect(q('button').disabled).toBe(true);
  done();
});

it('"not owned" (disabled + reason) stays focusable, says why, and does not fire', () => {
  const onClick = vi.fn();
  const { q, done } = setup(Chip, { label: 'Relic', disabled: true, reason: 'Level 0: set it on Relics', onClick });
  const b = q('button');
  expect(b.disabled).toBe(false);
  expect(b.getAttribute('aria-disabled')).toBe('true');
  expect(b.title).toBe('Level 0: set it on Relics');
  expect(b.textContent).toContain('Level 0: set it on Relics');
  click(b);
  expect(onClick).not.toHaveBeenCalled();
  done();
});

it('static renders a non-interactive label', () => {
  const { q, done } = setup(Chip, { label: 'Warrior', static: true });
  expect(q('button')).toBeNull();
  expect(q('.chip').textContent.trim()).toBe('Warrior');
  done();
});
