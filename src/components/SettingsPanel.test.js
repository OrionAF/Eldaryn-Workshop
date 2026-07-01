import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SettingsPanel from './SettingsPanel.svelte';
import { settingsStore } from '../lib/settingsStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
});
afterEach(() => {
  settingsStore.setMultiplicative(false); // reset for other tests in this file
});

it('renders nothing when closed', () => {
  app = mount(SettingsPanel, { target, props: { open: false, onClose: () => {} } });
  flushSync();
  expect(target.querySelector('[aria-label="Settings"]')).toBeNull();
  unmount(app);
});

it('checkbox reflects and updates the multiplicative setting', () => {
  app = mount(SettingsPanel, { target, props: { open: true, onClose: () => {} } });
  flushSync();

  const checkbox = target.querySelector('input[type="checkbox"]');
  expect(checkbox.checked).toBe(false);

  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(settingsStore.speedCritMultMultiplicative).toBe(true);
  unmount(app);
});

it('Close button calls onClose', () => {
  let closed = false;
  app = mount(SettingsPanel, { target, props: { open: true, onClose: () => (closed = true) } });
  flushSync();
  target.querySelector('button').click();
  flushSync();
  expect(closed).toBe(true);
  unmount(app);
});
