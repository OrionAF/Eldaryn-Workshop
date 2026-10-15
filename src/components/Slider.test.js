import { it, expect, vi } from 'vitest';
import Slider from './Slider.svelte';
import { setup } from './ui/testkit.js';

it('keeps the markup that lets the thumb reach both ends: a separate track under an overlaid range input', () => {
  const { q, done } = setup(Slider, { value: 25, min: 0, max: 100, ariaLabel: 'Quality' });
  expect(q('.slider-track')).not.toBeNull();
  expect(q('.slider').style.getPropertyValue('--fill')).toBe('25%');
  expect(q('input[type=range]').getAttribute('aria-label')).toBe('Quality');
  done();
});

it('oninput receives the parsed Number, not the event', () => {
  const oninput = vi.fn();
  const { q, done } = setup(Slider, { value: 0, min: 0, max: 10, oninput });
  const input = q('input');
  input.value = '7';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  expect(oninput).toHaveBeenCalledWith(7);
  done();
});

it('disabled disables the input', () => {
  const { q, done } = setup(Slider, { value: 0, disabled: true });
  expect(q('input').disabled).toBe(true);
  done();
});

it('a zero-width range reads as full', () => {
  const { q, done } = setup(Slider, { value: 3, min: 3, max: 3 });
  expect(q('.slider').style.getPropertyValue('--fill')).toBe('100%');
  done();
});
