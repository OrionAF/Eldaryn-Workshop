import { it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import CharacterSkillsPage from './CharacterSkillsPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { setup, click } from '../ui/testkit.js';

let view;
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  rosterStore.addCharacter('Test', 'WARRIOR');
  view = setup(CharacterSkillsPage);
});
afterEach(() => view.done());

it('raises a skill with the stepper and shows level / cap', () => {
  click(view.q('button[aria-label="Increase Hunting"]'));
  expect(rosterStore.current.skills.hunting).toBe(1);
  expect(view.q('[data-testid="level-hunting"]').textContent).toContain('1 / 10');
});

it('shows the gems still needed and a total that falls as skills are bought', () => {
  const before = Number(view.q('[data-testid="gems-total"]').textContent.replace(/\D/g, ''));
  expect(before).toBeGreaterThan(0);
  rosterStore.setSkillLevel('hunting', 10);
  flushSync();
  const after = Number(view.q('[data-testid="gems-total"]').textContent.replace(/\D/g, ''));
  expect(after).toBeLessThan(before);
  expect(view.q('[data-skill="hunting"]').textContent).toContain('max');
});

it('fortress TOP and BOTTOM are an exclusive radio pair, CORE is independent', () => {
  click(view.q('input[aria-label="Fortress TOP"]'));
  expect(rosterStore.current.fortress.owned).toEqual(['TOP']);
  click(view.q('input[aria-label="Fortress BOTTOM"]'));
  expect(rosterStore.current.fortress.owned).toEqual(['BOTTOM']);
  expect(view.q('input[aria-label="Fortress TOP"]').checked).toBe(false);
  click(view.q('input[type="checkbox"]'));
  expect(rosterStore.current.fortress.owned).toEqual(['BOTTOM', 'CORE']);
});

it('attunement bans are capped per class and the blocked chip says why', () => {
  const chip = () => view.q('.chip');
  expect(chip().getAttribute('aria-disabled')).toBe('true'); // warrior: 0 slots at level 0
  expect(chip().title).toContain('ban slots are used');
  click(chip());
  expect(rosterStore.current.attunementBans).toEqual([]);
  rosterStore.setSkillLevel('attunement', 2);
  click(chip());
  expect(rosterStore.current.attunementBans.length).toBe(1);
  expect(view.q('.chip.on')).not.toBeNull();
});
