import { it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import ToolsOpponentsPage from './ToolsOpponentsPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { setup, click } from '../ui/testkit.js';

let view;
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  rosterStore.addCharacter('Duelist', 'WARRIOR');
  view = setup(ToolsOpponentsPage);
});
afterEach(() => view.done());

const buttonByText = (re) => view.qa('button').find((b) => re.test(b.textContent));
const opp = () => rosterStore.current.opponents;

it('the empty library has its own empty state', () => {
  expect(view.q('[data-testid="opponent-picker"]').textContent).toContain('No saved opponents yet');
  expect(view.q('[data-testid="opponent-editor"]')).toBeNull();
});

it('a new opponent opens its editor with the Needs line and a blank-row list', () => {
  click(buttonByText(/\+ New opponent/));
  expect(opp()).toHaveLength(1);
  expect(view.q('[data-testid="opponent-editor"]')).not.toBeNull();
  expect(view.q('[data-testid="opponent-needs"]').textContent).toContain('HP, Attack, Attack Speed');
  expect(view.q('[data-testid="opponent-defaulted"]').textContent).toContain('Crit Chance');
  expect(view.q('[data-testid="opponent-picker"]').textContent).toContain('Needs HP, Attack, Attack Speed');
});

it('entering the three required stats clears the Needs line and marks the opponent Ready', () => {
  click(buttonByText(/\+ New opponent/));
  rosterStore.setOpponentSheet(opp()[0].id, { totalHp: 800, totalAttack: 30, totalAttackSpeed: 1, totalCritChance: 0.1 });
  flushSync();
  expect(view.q('[data-testid="opponent-needs"]')).toBeNull();
  expect(view.q('[data-testid="opponent-picker"]').textContent).toContain('Ready');
  expect(view.q('[data-testid="opponent-defaulted"]').textContent).not.toContain('Crit Chance');
});

it('clones a preset as another spec, duplicates and deletes', () => {
  click(buttonByText(/^Clone$/));
  expect(opp()).toHaveLength(1);
  click(buttonByText(/^Duplicate$/));
  expect(opp()).toHaveLength(2);
  expect(view.q('[data-testid="opponent-count"]').textContent).toContain('2 of 12');
  click(buttonByText(/^Delete$/));
  click(buttonByText(/Confirm delete/));
  expect(opp()).toHaveLength(1);
});

it('the editor edits spec and sigils and keeps the store normalised', () => {
  click(buttonByText(/\+ New opponent/));
  const chip = (label) => view.qa('.chip').find((b) => b.textContent.trim() === label);
  click(chip('Berserk Stance'));
  expect(opp()[0].sigils).toEqual([{ species: 'BERSERK_STANCE', level: 1 }]);
  click(chip('Mystic · Mage'));
  expect(opp()[0]).toMatchObject({ class: 'MYSTIC', spec: 'MYSTIC_MAGE', sigils: [] });
});
