import { it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import Drawer from './Drawer.svelte';
import { setup, html, click, key } from './testkit.js';

it('renders nothing while closed', () => {
  const { q, done } = setup(Drawer, { open: false, title: 'Item' });
  expect(q('aside')).toBeNull();
  done();
});

it('is a labelled, non-modal complementary region with a unique heading id', () => {
  const a = setup(Drawer, { open: true, title: 'Sword', children: html('x') });
  const b = setup(Drawer, { open: true, title: 'Shield', children: html('x') });
  const idA = a.q('aside').getAttribute('aria-labelledby');
  expect(idA).not.toBe(b.q('aside').getAttribute('aria-labelledby'));
  expect(document.getElementById(idA).textContent).toBe('Sword');
  expect(a.q('aside').getAttribute('aria-modal')).toBeNull();
  a.done();
  b.done();
});

it('moves focus into the drawer on open', () => {
  const { q, done } = setup(Drawer, { open: true, title: 'Sword' });
  expect(document.activeElement).toBe(q('aside'));
  done();
});

it('Escape and the close button close it and call onclose', () => {
  const onclose = vi.fn();
  const { q, done } = setup(Drawer, { open: true, title: 'Sword', onclose });
  key(q('aside'), 'Escape');
  expect(onclose).toHaveBeenCalledTimes(1);
  expect(q('aside')).toBeNull();
  done();
  const again = vi.fn();
  const s = setup(Drawer, { open: true, title: 'Sword', onclose: again });
  click(s.q('.close'));
  expect(again).toHaveBeenCalledTimes(1);
  s.done();
});

it('returns focus to the opener when it closes', () => {
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  opener.focus();
  const { q, done } = setup(Drawer, { open: true, title: 'Sword' });
  expect(document.activeElement).toBe(q('aside'));
  click(q('.close'));
  flushSync();
  expect(document.activeElement).toBe(opener);
  done();
  opener.remove();
});

it('renders footer content', () => {
  const { q, done } = setup(Drawer, { open: true, title: 'Sword', footer: html('Changes save as you edit') });
  expect(q('.drawer-foot').textContent).toContain('Changes save as you edit');
  done();
});
