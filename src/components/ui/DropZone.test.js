import { it, expect, vi } from 'vitest';
import { flushSync } from 'svelte';
import DropZone from './DropZone.svelte';
import { setup, click } from './testkit.js';

const file = () => new File(['{}'], 'profile.json', { type: 'application/json' });

it('is a real button plus a hidden file input; the button opens the picker', () => {
  const { q, done } = setup(DropZone, { onfile: () => {} });
  const input = q('input[type=file]');
  const spy = vi.spyOn(input, 'click');
  click(q('button.dropzone'));
  expect(spy).toHaveBeenCalledTimes(1);
  expect(input.getAttribute('aria-hidden')).toBe('true');
  done();
});

it('chosen file reaches onfile', () => {
  const onfile = vi.fn();
  const { q, done } = setup(DropZone, { onfile });
  const f = file();
  const input = q('input[type=file]');
  Object.defineProperty(input, 'files', { value: [f], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  expect(onfile).toHaveBeenCalledWith(f);
  done();
});

it('drag-over adds the over state; drop hands over the file and clears it', () => {
  const onfile = vi.fn();
  const { q, done } = setup(DropZone, { onfile });
  const zone = q('button.dropzone');
  zone.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
  flushSync();
  expect(zone.classList.contains('is-over')).toBe(true);
  const f = file();
  const drop = new Event('drop', { bubbles: true, cancelable: true });
  drop.dataTransfer = { files: [f] };
  zone.dispatchEvent(drop);
  flushSync();
  expect(onfile).toHaveBeenCalledWith(f);
  expect(zone.classList.contains('is-over')).toBe(false);
  done();
});

it('error is an alert linked to the button; summary shows only without an error', () => {
  const e = setup(DropZone, { onfile: () => {}, error: 'Not a game profile', summary: '3 characters' });
  const zone = e.q('button.dropzone');
  expect(document.getElementById(zone.getAttribute('aria-describedby')).textContent).toContain('Not a game profile');
  expect(e.q('.summary')).toBeNull();
  e.done();
  const s = setup(DropZone, { onfile: () => {}, summary: '3 characters' });
  expect(s.q('.summary').textContent).toBe('3 characters');
  s.done();
});

it('disabled ignores drops', () => {
  const onfile = vi.fn();
  const { q, done } = setup(DropZone, { onfile, disabled: true });
  const drop = new Event('drop', { bubbles: true, cancelable: true });
  drop.dataTransfer = { files: [file()] };
  q('button.dropzone').dispatchEvent(drop);
  expect(onfile).not.toHaveBeenCalled();
  done();
});
