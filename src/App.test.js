/**
 * Smoke test (build step 4 checkpoint): App.svelte wires TopBar + Tabs +
 * the two tab panels together, and clicking a tab swaps which panel shows.
 */
import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import App from './App.svelte';
import { rosterStore } from './lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(App, { target });
  flushSync();
  // A fresh character has no class - most tests in this file are about the
  // tabs/panels, which only render once a class is chosen (see the
  // dedicated onboarding-gate test below for the un-classed state itself).
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
});

it('hides the tabs and shows an onboarding hint until the character has a class', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, null);
  flushSync();

  expect(target.querySelector('[role="tab"]')).toBeNull();
  expect(target.querySelector('[aria-label="Profile Stats"]')).toBeNull();
  expect(target.querySelector('.onboarding-hint')).not.toBeNull();
  expect(target.textContent).toContain('create a profile');

  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  expect(target.querySelector('.onboarding-hint')).toBeNull();
  expect(target.querySelector('[aria-label="Profile Stats"]')).not.toBeNull();
});

it('renders the top bar, tabs, and defaults to the Profile Stats panel', () => {
  expect(target.querySelector('select')).not.toBeNull(); // TopBar character select
  expect(target.querySelector('[aria-label="Profile Stats"]')).not.toBeNull();
  expect(target.querySelector('[aria-label="Gear Panel"]')).toBeNull();
  unmount(app);
});

it('clicking the Gear Panel tab swaps the visible section', () => {
  const tabButtons = [...target.querySelectorAll('button[role="tab"]')];
  tabButtons.find((b) => b.textContent.trim() === 'Gear Panel').click();
  flushSync();

  expect(target.querySelector('[aria-label="Gear Panel"]')).not.toBeNull();
  expect(target.querySelector('[aria-label="Profile Stats"]')).toBeNull();
  unmount(app);
});
