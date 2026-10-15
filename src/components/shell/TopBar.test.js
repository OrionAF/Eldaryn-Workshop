import { it, expect, afterEach } from 'vitest';
import { setup } from '../ui/testkit.js';
import TopBar from './TopBar.svelte';

let ui;
afterEach(() => ui?.done());

it('keeps character, preset/realm, jobs, notifications and settings as separately placed phone-bar groups', () => {
  localStorage.clear();
  ui = setup(TopBar, {});
  const bar = ui.q('.topbar');
  expect(bar.querySelector('.who')).not.toBeNull();
  expect(bar.querySelector('.ctx')).not.toBeNull();
  expect(bar.querySelector('.jobs-slot')).not.toBeNull();
  expect(bar.querySelector('[aria-label^="Notifications"]')).not.toBeNull();
  expect(bar.querySelector('a[aria-label="Data and settings"]')).not.toBeNull();
  expect(bar.querySelector('.ctx select')).not.toBeNull();
  expect(bar.querySelector('.ctx [role="group"][aria-label="Realm"]')).not.toBeNull();
});
