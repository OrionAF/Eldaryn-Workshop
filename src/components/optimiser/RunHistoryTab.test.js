import { it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import RunHistoryTab from './RunHistoryTab.svelte';
import { rosterStore as store } from '../../lib/rosterStore.svelte.js';
import { setup, click, type } from '../ui/testkit.js';
import { dpsResult } from '../../lib/__fixtures__/optimiser/index.js';

let mounted;
beforeEach(() => {
  const id = store.addCharacter('Test', 'WARRIOR');
  for (const c of [...store.roster.characters]) if (c.id !== id) store.deleteCharacter(c.id);
  localStorage.clear();
});
afterEach(() => {
  mounted?.done();
  mounted = null;
});

const seed = (n) => {
  const ids = [];
  for (let i = 0; i < n; i++) {
    const r = store.addRun(dpsResult(), { name: `Run ${i}`, presetName: i % 2 ? 'Alt' : 'Main' });
    ids.push(r.id);
  }
  return ids;
};
const names = (ui) => ui.qa('[data-testid="run-row"] .open').map((b) => b.textContent.trim());
const select = (ui, v) => {
  const el = ui.q('[data-testid="run-filters"] select');
  el.value = v;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};

it('hides the filters until there are more than five runs', () => {
  seed(5);
  mounted = setup(RunHistoryTab);
  expect(mounted.q('[data-testid="run-filters"]')).toBeNull();
  expect(names(mounted)).toHaveLength(5);
});

it('filters by preset, text, notes and pinned, and counts the matches', () => {
  const ids = seed(8);
  store.setRunNotes(ids[2], 'dungeon seven');
  store.setRunPinned(ids[3], true);
  mounted = setup(RunHistoryTab);
  expect(mounted.q('[data-testid="run-filters"]')).not.toBeNull();
  expect(mounted.q('[data-testid="run-count"]')).toBeNull();

  select(mounted, 'Alt');
  expect(names(mounted)).toHaveLength(4);
  expect(mounted.q('[data-testid="run-count"]').textContent).toBe('4 of 8 runs');
  select(mounted, '');

  type(mounted.q('.search input'), 'DUNGEON');
  expect(names(mounted)).toEqual(['Run 2']);
  type(mounted.q('.search input'), '');

  click([...mounted.qa('[data-testid="run-filters"] input[type="checkbox"]')].at(-1));
  expect(names(mounted)).toEqual(['Run 3']);
});

it('shows an empty state with a Clear filters button when nothing matches', () => {
  seed(7);
  mounted = setup(RunHistoryTab);
  type(mounted.q('.search input'), 'zzz-no-such');
  expect(names(mounted)).toHaveLength(0);
  expect(mounted.target.textContent).toContain('No runs match');
  click([...mounted.qa('button')].find((b) => b.textContent.trim() === 'Clear filters'));
  expect(names(mounted)).toHaveLength(7);
  expect(mounted.q('.search input').value).toBe('');
});

it('keeps the compare selection while the list is filtered', () => {
  seed(6);
  mounted = setup(RunHistoryTab);
  const boxes = () => mounted.qa('[data-testid="run-row"] input[type="checkbox"]');
  click(boxes()[0]);
  click(boxes()[1]);
  expect(mounted.target.textContent).not.toContain('side by side');
  type(mounted.q('.search input'), 'Run 5');
  expect(names(mounted)).toEqual(['Run 5']);
  type(mounted.q('.search input'), '');
  expect(boxes().filter((b) => b.checked)).toHaveLength(2);
});
