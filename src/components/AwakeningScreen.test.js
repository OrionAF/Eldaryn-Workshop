import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AwakeningScreen from './AwakeningScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.resetAwakening();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(AwakeningScreen, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('shows a hint and no points control until a path is chosen', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();
  expect(target.querySelector('.points-row')).toBeNull();
  cleanup();
});

it('choosing Shadow Path reveals the points control and per-point bonus list', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  [...target.querySelectorAll('.path-card')].find((b) => b.textContent.trim() === 'Shadow Path').click();
  flushSync();

  expect(target.querySelector('.empty-hint')).toBeNull();
  expect(target.textContent).toContain('0 / 15 points');
  const labels = [...target.querySelectorAll('.bonus-label')].map((l) => l.textContent);
  expect(labels).toEqual(['Attack %', 'Critical %', 'Crit Mult %', 'Penetration %']);
  cleanup();
});

it('+ raises points and scales the displayed bonus; - lowers it, clamped at 0', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  [...target.querySelectorAll('.path-card')].find((b) => b.textContent.trim() === 'Shadow Path').click();
  flushSync();

  const plusButton = () => target.querySelector('.rank-controls button:last-child');
  const minusButton = () => target.querySelector('.rank-controls button:first-child');

  plusButton().click();
  plusButton().click();
  plusButton().click();
  flushSync();
  expect(target.textContent).toContain('3 / 15 points');
  const attackRow = [...target.querySelectorAll('.bonus-row')].find((r) => r.textContent.includes('Attack %'));
  expect(attackRow.querySelector('.bonus-value').textContent).toContain('+6.0%'); // 2%/point * 3

  expect(minusButton().disabled).toBe(false);
  minusButton().click();
  minusButton().click();
  minusButton().click();
  flushSync();
  expect(target.textContent).toContain('0 / 15 points');
  expect(minusButton().disabled).toBe(true);
  cleanup();
});

it("Radiant Path's bonus list differs by class, resolved live (no re-selection needed)", () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  [...target.querySelectorAll('.path-card')].find((b) => b.textContent.trim() === 'Radiant Path').click();
  flushSync();
  let labels = [...target.querySelectorAll('.bonus-label')].map((l) => l.textContent);
  expect(labels).toEqual(['Health %', 'HP Regen %/s', 'DMG Reduction %', 'Block Chance %']);

  // Awakening's path isn't reset by a class switch - Radiant just resolves
  // to a different class's stats live, no need to re-pick the path.
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  labels = [...target.querySelectorAll('.bonus-label')].map((l) => l.textContent);
  expect(labels).toEqual(['Health %', 'Blind Chance %', 'Paralyze Chance %', 'Miss Chance %']);
  cleanup();
});

it('switching path resets points to 0, and Reset Awakening clears the path entirely', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  [...target.querySelectorAll('.path-card')].find((b) => b.textContent.trim() === 'Shadow Path').click();
  flushSync();
  target.querySelector('.rank-controls button:last-child').click();
  flushSync();
  expect(target.textContent).toContain('1 / 15 points');

  [...target.querySelectorAll('.path-card')].find((b) => b.textContent.trim() === 'Radiant Path').click();
  flushSync();
  expect(target.textContent).toContain('0 / 15 points');

  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Reset Awakening').click();
  flushSync();
  expect(target.querySelector('.empty-hint')).toBeNull(); // not yet - just revealed the confirm step

  target.querySelector('.confirm-yes').click();
  flushSync();
  expect(target.querySelector('.empty-hint')).not.toBeNull();
  cleanup();
});
