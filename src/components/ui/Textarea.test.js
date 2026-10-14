import { it, expect, vi } from 'vitest';
import Textarea from './Textarea.svelte';
import { setup, type } from './testkit.js';

it('labels the textarea and reports typed text', () => {
  const oninput = vi.fn();
  const { q, done } = setup(Textarea, { label: 'Paste JSON', value: '', oninput });
  expect(q('label').getAttribute('for')).toBe(q('textarea').id);
  type(q('textarea'), '{"a":1}');
  expect(oninput).toHaveBeenCalledWith('{"a":1}');
  done();
});

it('error state: aria-invalid + alert message linked by aria-describedby', () => {
  const { q, done } = setup(Textarea, { label: 'L', value: '', error: 'Not valid JSON' });
  const t = q('textarea');
  expect(t.getAttribute('aria-invalid')).toBe('true');
  expect(document.getElementById(t.getAttribute('aria-describedby')).textContent).toContain('Not valid JSON');
  done();
});

it('disabled disables it', () => {
  const { q, done } = setup(Textarea, { label: 'L', value: '', disabled: true });
  expect(q('textarea').disabled).toBe(true);
  done();
});
