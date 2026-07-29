import { it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Modal from './Modal.svelte';

function setup(props = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const onclose = vi.fn();
  const app = mount(Modal, { target, props: { title: 'Glyphs', onclose, ...props } });
  flushSync();
  return { target, app, onclose, dialog: () => target.querySelector('dialog') };
}

it('stays closed until open is set', () => {
  const { app, dialog } = setup({ open: false });
  expect(dialog().open).toBe(false);
  unmount(app);
});

it('opens as a modal dialog when open is true', () => {
  const { app, dialog } = setup({ open: true });
  expect(dialog().open).toBe(true);
  unmount(app);
});

it('labels itself from the title for screen readers', () => {
  const { target, app, dialog } = setup({ open: true });
  expect(dialog().getAttribute('aria-labelledby')).toBe('modal-title');
  expect(target.querySelector('#modal-title').textContent).toBe('Glyphs');
  unmount(app);
});

it('the close button fires onclose', () => {
  const { target, app, onclose } = setup({ open: true });
  target.querySelector('.modal-close').click();
  flushSync();
  expect(onclose).toHaveBeenCalledTimes(1);
  unmount(app);
});

it('a click on the backdrop (the dialog element itself) closes it', () => {
  const { app, onclose, dialog } = setup({ open: true });
  dialog().dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  flushSync();
  expect(onclose).toHaveBeenCalledTimes(1);
  unmount(app);
});

it('a click inside the modal body does NOT close it', () => {
  const { target, app, onclose } = setup({ open: true });
  target.querySelector('.modal-content').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  flushSync();
  expect(onclose).not.toHaveBeenCalled();
  unmount(app);
});

it('Esc (the native cancel event) closes it', () => {
  const { app, onclose, dialog } = setup({ open: true });
  dialog().dispatchEvent(new window.Event('cancel', { bubbles: false, cancelable: true }));
  flushSync();
  expect(onclose).toHaveBeenCalledTimes(1);
  unmount(app);
});

it('falls back to an aria-label when no title is given', () => {
  const { app, dialog } = setup({ open: true, title: '' });
  expect(dialog().getAttribute('aria-label')).toBe('Dialog');
  unmount(app);
});
