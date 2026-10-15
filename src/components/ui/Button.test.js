import { it, expect, vi } from 'vitest';
import Button from './Button.svelte';
import { setup, html, click } from './testkit.js';

it('renders each variant as a .btn-<variant> and fires onclick', () => {
  for (const variant of ['primary', 'secondary', 'ghost', 'quiet', 'danger']) {
    const onclick = vi.fn();
    const { q, done } = setup(Button, { variant, onclick, children: html('Go') });
    expect(q('button').classList.contains(`btn-${variant}`)).toBe(true);
    click(q('button'));
    expect(onclick).toHaveBeenCalledTimes(1);
    done();
  }
});

it('disabled without a reason is natively disabled', () => {
  const onclick = vi.fn();
  const { q, done } = setup(Button, { disabled: true, onclick, children: html('Go') });
  expect(q('button').disabled).toBe(true);
  done();
});

it('disabled with a reason stays focusable, explains itself and ignores clicks', () => {
  const onclick = vi.fn();
  const { q, done } = setup(Button, { disabled: true, reason: 'Unlock Oblivion first', onclick, children: html('Go') });
  const b = q('button');
  expect(b.disabled).toBe(false);
  expect(b.getAttribute('aria-disabled')).toBe('true');
  expect(b.title).toBe('Unlock Oblivion first');
  click(b);
  expect(onclick).not.toHaveBeenCalled();
  done();
});

it('loading swaps the label for the busy label, sets aria-busy and ignores clicks', () => {
  const onclick = vi.fn();
  const { q, done } = setup(Button, { loading: true, onclick, children: html('Run') });
  const b = q('button');
  expect(b.getAttribute('aria-busy')).toBe('true');
  expect(b.textContent.trim()).toBe('Running…');
  click(b);
  expect(onclick).not.toHaveBeenCalled();
  done();
});

it('confirming adds the is-confirming state class', () => {
  const { q, done } = setup(Button, { variant: 'danger', confirming: true, children: html('Remove') });
  expect(q('button').classList.contains('is-confirming')).toBe(true);
  done();
});
