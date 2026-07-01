import { it, expect, beforeEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsPanel from './SettingsPanel.svelte';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
});

it('renders nothing when closed', () => {
  app = mount(SettingsPanel, { target, props: { open: false, onClose: () => {} } });
  flushSync();
  expect(target.querySelector('[aria-label="Settings"]')).toBeNull();
  unmount(app);
});

it('shows only the Reset trigger until clicked, then reveals the confirm input', () => {
  app = mount(SettingsPanel, { target, props: { open: true, onClose: () => {} } });
  flushSync();

  expect(target.querySelector('input')).toBeNull();
  target.querySelector('.reset-trigger').click();
  flushSync();

  expect(target.querySelector('input')).not.toBeNull();
  expect(target.querySelector('.reset-trigger')).toBeNull();
  unmount(app);
});

it('Confirm reset is disabled until the text exactly matches RESET, and Cancel backs out', () => {
  app = mount(SettingsPanel, { target, props: { open: true, onClose: () => {} } });
  flushSync();
  target.querySelector('.reset-trigger').click();
  flushSync();

  const input = target.querySelector('input');
  const confirmBtn = [...target.querySelectorAll('button')].find((b) => b.textContent === 'Confirm reset');
  expect(confirmBtn.disabled).toBe(true);

  input.value = 'reset'; // wrong case
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(confirmBtn.disabled).toBe(true);

  input.value = 'RESET';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(confirmBtn.disabled).toBe(false);

  [...target.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click();
  flushSync();
  expect(target.querySelector('input')).toBeNull();
  expect(target.querySelector('.reset-trigger')).not.toBeNull();
  unmount(app);
});

it('typing RESET and pressing Enter clears localStorage and reloads', () => {
  localStorage.setItem('eldaryn_optimiser_state_v1', '{"probe":true}');
  // jsdom's window.location.reload isn't configurable, so it can't be
  // vi.spyOn'd directly - stub the whole global instead.
  const reloadMock = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload: reloadMock });

  app = mount(SettingsPanel, { target, props: { open: true, onClose: () => {} } });
  flushSync();
  target.querySelector('.reset-trigger').click();
  flushSync();

  const input = target.querySelector('input');
  input.value = 'RESET';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();

  expect(localStorage.getItem('eldaryn_optimiser_state_v1')).toBeNull();
  expect(reloadMock).toHaveBeenCalled();

  vi.unstubAllGlobals();
  unmount(app);
});

it('pressing Enter with the wrong text does not clear anything', () => {
  localStorage.setItem('eldaryn_optimiser_state_v1', '{"probe":true}');
  const reloadMock = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload: reloadMock });

  app = mount(SettingsPanel, { target, props: { open: true, onClose: () => {} } });
  flushSync();
  target.querySelector('.reset-trigger').click();
  flushSync();

  const input = target.querySelector('input');
  input.value = 'not it';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();

  expect(localStorage.getItem('eldaryn_optimiser_state_v1')).not.toBeNull();
  expect(reloadMock).not.toHaveBeenCalled();

  vi.unstubAllGlobals();
  unmount(app);
});

it('Close button calls onClose and resets any in-progress confirm state', () => {
  let closed = false;
  app = mount(SettingsPanel, { target, props: { open: true, onClose: () => (closed = true) } });
  flushSync();
  target.querySelector('.reset-trigger').click();
  flushSync();

  [...target.querySelectorAll('button')].find((b) => b.textContent === 'Close').click();
  flushSync();
  expect(closed).toBe(true);
  // onClose doesn't itself unmount here (that's the parent's call) - confirm
  // the confirm-row state was actually cleared, not just that onClose fired.
  expect(target.querySelector('.reset-trigger')).not.toBeNull();
  expect(target.querySelector('input')).toBeNull();
  unmount(app);
});
