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

it('the stat sheet is the shared SheetTable: typing a flat value commits it with "." as thousands', () => {
  click(buttonByText(/\+ New opponent/));
  const input = view.q('[data-testid="opponent-editor"] table.sheet input[aria-label="Health"]');
  expect(input).not.toBeNull();
  input.value = '48.124';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  expect(opp()[0].sheet.values.totalHp).toBe(48124);
});

it('Clone defaults "as spec" to the preset\'s own talent-set spec, and follows the preset picked', () => {
  rosterStore.setTalentSetSpec(0, 'WARRIOR_TANK');
  rosterStore.setTalentSetSpec(1, 'WARRIOR_DPS');
  flushSync();
  const selectFor = (text) => document.getElementById([...view.qa('label')].find((l) => l.textContent.trim() === text).htmlFor);
  expect(selectFor('as spec').value).toBe('WARRIOR_TANK');
  const second = rosterStore.current.presets.find((p) => p.talentSet === 1);
  const presetSelect = selectFor('Clone my preset');
  presetSelect.value = second.id;
  presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(selectFor('as spec').value).toBe('WARRIOR_DPS');
  presetSelect.value = rosterStore.current.presets.find((p) => p.talentSet === 0).id;
  presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  click(buttonByText(/^Clone$/));
  expect(opp()[0].spec).toBe('WARRIOR_TANK');
});

it('the cloned opponent\'s sheet table has no empty Model column', () => {
  click(buttonByText(/^Clone$/));
  const heads = view.qa('[data-testid="opponent-editor"] thead th').map((th) => th.textContent.trim());
  expect(heads).not.toContain('App');
  expect(heads).toContain('In-game stats');
});

it('the Rankings import line shows only while game-data import is switched on', async () => {
  const { setPrefs, applyPrefs } = await import('../../lib/prefs.svelte.js');
  expect(view.target.querySelector('[data-testid="rankings-import-note"]')).toBeNull();
  setPrefs({ showImport: true });
  flushSync();
  expect(view.q('[data-testid="rankings-import-note"] a').textContent).toContain('Import a player from Rankings');
  localStorage.clear();
  applyPrefs();
});
