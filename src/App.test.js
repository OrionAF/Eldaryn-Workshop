/**
 * Smoke test for the app shell: Sidebar + screen router + onboarding gate.
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
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('shows an onboarding hint and no screen content until the character has a class', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, null);
  flushSync();

  expect(target.querySelector('.onboarding-hint')).not.toBeNull();
  expect(target.textContent).toContain('Choose a class');

  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  expect(target.querySelector('.onboarding-hint')).toBeNull();
  cleanup();
});

it('renders the sidebar nav and defaults to the Presets screen', () => {
  expect(target.querySelector('nav.sidebar')).not.toBeNull();
  expect(target.querySelector('.context-sub').textContent).toBe('Presets');
  cleanup();
});

it('clicking a nav item swaps the visible screen', () => {
  const navButtons = [...target.querySelectorAll('.nav-item')];
  navButtons.find((b) => b.textContent.trim() === 'Transcendence').click();
  flushSync();

  expect(target.querySelector('.context-sub').textContent).toBe('Transcendence');
  expect(target.textContent).toContain('has not been added yet'); // Warrior has no tree yet
  cleanup();
});

it('switching characters shows a status pill', () => {
  const altId = rosterStore.addCharacter('Alt');
  rosterStore.selectCharacter(rosterStore.current.id); // no-op, just ensure state is settled
  flushSync();

  target.querySelector('.change-character').click();
  flushSync();
  const firstCharButton = target.querySelectorAll('.character-button')[0];
  firstCharButton.click();
  flushSync();

  expect(target.querySelector('.status-pill')).not.toBeNull();
  expect(target.querySelector('.status-pill').textContent).toContain('Switched to');
  cleanup();
});
