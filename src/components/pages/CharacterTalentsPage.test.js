import { it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import CharacterTalentsPage from './CharacterTalentsPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { setup, click } from '../ui/testkit.js';
import { inspector } from '../../lib/inspector.svelte.js';
import InspectorOutlet from '../InspectorOutlet.svelte';

let view;
beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  rosterStore.addCharacter('Test', 'WARRIOR');
  view = setup(CharacterTalentsPage);
});
afterEach(() => view.done());

const specSelect = () => view.q('select');
const pick = (value) => {
  specSelect().value = value;
  specSelect().dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};

it('shows Set A / Set B tabs and a spec prompt', () => {
  const tabs = view.qa('[role="tab"]');
  expect(tabs).toHaveLength(2);
  expect(tabs[0].textContent).toContain('Set A');
  expect(tabs[1].textContent).toContain('Set B');
  expect(view.q('[role="tabpanel"]').textContent).toContain('Choose a specialization');
});

it('lists only the class specs and allocates points with the + button', () => {
  expect([...specSelect().options].map((o) => o.textContent.trim())).toEqual(['Choose a spec...', 'Protection', 'Arms']);
  pick('WARRIOR_DPS');
  expect(view.q('[data-testid="points"]').textContent).toBe('0 / 29 pts');
  click(view.q('button[aria-label="Raise Sharpened Blade"]'));
  expect(view.q('[data-testid="points"]').textContent).toBe('1 / 29 pts');
  expect(rosterStore.current.talentSets[0].allocation.dps_t1_sharpened_blade).toBe(1);
});

it('the points bar is measured against what the level grants, and + stops at the cap', () => {
  rosterStore.setCharacterLevel(20); // level 20 grants 20 - 14 = 6 points
  pick('WARRIOR_DPS');
  const readout = () => view.q('[data-testid="points"]').textContent;
  expect(readout()).toBe('0 / 6 pts');
  expect(view.q('[role="progressbar"]').getAttribute('aria-valuemax')).toBe('6');
  rosterStore.setTalentSetRank(0, 'dps_t1_sharpened_blade', 5);
  rosterStore.setTalentSetRank(0, 'dps_t1_quick_strikes', 1);
  flushSync();
  expect(readout()).toBe('6 / 6 pts');
  const raise = view.q('button[aria-label="Raise Quick Strikes"]');
  expect(raise.getAttribute('aria-disabled')).toBe('true');
  expect(raise.title).toContain('No talent points left');
});

it('Set B is locked below the dual-talent level and says so', () => {
  rosterStore.setCharacterLevel(30);
  flushSync();
  const tabB = view.qa('[role="tab"]')[1];
  expect(tabB.disabled || tabB.getAttribute('aria-disabled') === 'true').toBe(true);
  expect(tabB.title).toContain('unlocks at level 38');
});

it('every talent tile shows its art, or a placeholder where the tree has none', () => {
  pick('WARRIOR_DPS');
  const tiles = view.qa('.talent-tile');
  expect(tiles.length).toBeGreaterThan(10);
  expect(tiles.every((t) => t.querySelector('img.talent-art'))).toBe(true);
  rosterStore.setCharacterClass(rosterStore.current.id, 'NECROMANCER');
  flushSync();
  pick('NECROMANCER_DEATHLORD');
  expect(view.qa('.talent-tile').every((t) => t.querySelector('.talent-art.placeholder'))).toBe(true);
});

it('registers a set-effect summary in the inspector that follows the allocation and the selected set', () => {
  const outlet = setup(InspectorOutlet);
  pick('WARRIOR_TANK');
  expect(outlet.target.textContent).toContain('Set A effects');
  expect(outlet.target.textContent).toContain('No points spent');
  click(view.q('button[aria-label="Raise Fortitude"]'));
  click(view.q('button[aria-label="Raise Fortitude"]'));
  expect(outlet.target.textContent).toContain('Max HP');
  expect(outlet.target.textContent).toContain('+4%');
  expect(outlet.target.textContent).toContain('2 of 29 points');
  outlet.done();
});

it('leaves the inspector empty once the page unmounts', () => {
  expect(inspector.current).not.toBeNull();
  view.done();
  expect(inspector.current).toBeNull();
  view = setup(CharacterTalentsPage); // afterEach disposes this one
});
