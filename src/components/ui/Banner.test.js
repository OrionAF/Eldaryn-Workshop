import { it, expect, vi } from 'vitest';
import Banner from './Banner.svelte';
import { setup, html, click } from './testkit.js';

it('error is an alert; info, warn and estimate are status', () => {
  const role = (variant) => {
    const t = setup(Banner, { variant, lead: 'Note', children: html('text') });
    const r = t.q('.banner').getAttribute('role');
    t.done();
    return r;
  };
  expect(role('error')).toBe('alert');
  expect(role('info')).toBe('status');
  expect(role('warn')).toBe('status');
  expect(role('estimate')).toBe('status');
});

it('carries the variant class, the bold lead and the sentence; the glyph is decorative', () => {
  const { q, done } = setup(Banner, { variant: 'warn', lead: 'Careful.', children: html('Pets will be wiped') });
  expect(q('.banner').classList.contains('warn')).toBe(true);
  expect(q('b').textContent).toBe('Careful.');
  expect(q('.text').textContent).toContain('Pets will be wiped');
  expect(q('.glyph').getAttribute('aria-hidden')).toBe('true');
  done();
});

it('a close button appears only with onclose and calls it', () => {
  const none = setup(Banner, { children: html('x') });
  expect(none.q('.close')).toBeNull();
  none.done();
  const onclose = vi.fn();
  const c = setup(Banner, { children: html('x'), onclose });
  click(c.q('.close'));
  expect(onclose).toHaveBeenCalledTimes(1);
  c.done();
});
