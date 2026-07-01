import { it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ConfirmButton from './ConfirmButton.svelte';

function setup(props = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const onConfirm = vi.fn();
  const app = mount(ConfirmButton, { target, props: { label: 'Remove', onConfirm, ...props } });
  flushSync();
  return { target, app, onConfirm };
}

it('shows only the label button until clicked, then reveals Confirm/Cancel', () => {
  const { target, app } = setup();
  expect(target.querySelectorAll('button').length).toBe(1);
  expect(target.querySelector('button').textContent).toBe('Remove');

  target.querySelector('button').click();
  flushSync();

  const buttons = [...target.querySelectorAll('button')].map((b) => b.textContent);
  expect(buttons).toEqual(['Confirm', 'Cancel']);
  unmount(app);
});

it('does not call onConfirm on the first click - only after the second', () => {
  const { target, app, onConfirm } = setup();
  target.querySelector('button').click();
  flushSync();
  expect(onConfirm).not.toHaveBeenCalled();

  [...target.querySelectorAll('button')].find((b) => b.textContent === 'Confirm').click();
  flushSync();
  expect(onConfirm).toHaveBeenCalledTimes(1);
  unmount(app);
});

it('Cancel backs out without calling onConfirm, restoring the label button', () => {
  const { target, app, onConfirm } = setup();
  target.querySelector('button').click();
  flushSync();
  [...target.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click();
  flushSync();

  expect(onConfirm).not.toHaveBeenCalled();
  expect(target.querySelectorAll('button').length).toBe(1);
  expect(target.querySelector('button').textContent).toBe('Remove');
  unmount(app);
});

it('uses confirmLabel and prompt when given', () => {
  const { target, app } = setup({ confirmLabel: 'Confirm delete', prompt: 'Delete "Rex"?' });
  target.querySelector('button').click();
  flushSync();

  expect(target.querySelector('.confirm-prompt').textContent).toBe('Delete "Rex"?');
  expect([...target.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Confirm delete', 'Cancel']);
  unmount(app);
});

it('disabled prevents entering the confirm state', () => {
  const { target, app, onConfirm } = setup({ disabled: true });
  const button = target.querySelector('button');
  expect(button.disabled).toBe(true);
  button.click();
  flushSync();

  expect(target.querySelectorAll('button').length).toBe(1); // still just the label button
  expect(onConfirm).not.toHaveBeenCalled();
  unmount(app);
});
