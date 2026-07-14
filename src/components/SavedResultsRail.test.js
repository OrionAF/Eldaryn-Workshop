import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SavedResultsRail from './SavedResultsRail.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app, statuses;

function mountRail(props = {}) {
  app = mount(SavedResultsRail, {
    target,
    props: { kinds: ['sim', 'opt'], setStatus: (m) => statuses.push(m), ...props },
  });
  flushSync();
}

beforeEach(() => {
  localStorage.clear();
  statuses = [];
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
  for (const r of [...(rosterStore.current.savedResults || [])]) rosterStore.deleteSavedResult(r.id);
});

const heads = () => [...target.querySelectorAll('.saved-head')];
const expandFirst = () => {
  heads()[0].click();
  flushSync();
};

it('renders only the kinds this screen owns, empty state otherwise', () => {
  rosterStore.saveResult('sim', 'PVE run', { meanDps: 10 });
  rosterStore.saveResult('pvp-sim', 'Duel run', { winRate: 55 });
  mountRail({ kinds: ['pvp-sim', 'pvp-opt'] });

  const text = target.querySelector('[data-testid="saved-results"]').textContent;
  expect(text).toContain('Duel run');
  expect(text).not.toContain('PVE run');
});

it('pinned results sort first; pin/unpin via the expanded body', () => {
  rosterStore.saveResult('sim', 'Older', { meanDps: 1 });
  rosterStore.saveResult('sim', 'Newer', { meanDps: 2 });
  mountRail();

  // Newest first by default.
  expect(heads().map((h) => h.textContent)).toEqual([
    expect.stringContaining('Newer'),
    expect.stringContaining('Older'),
  ]);

  heads()[1].click(); // expand 'Older'
  flushSync();
  target.querySelector('[data-testid="saved-pin"]').click();
  flushSync();

  expect(heads()[0].textContent).toContain('Older');
  expect(heads()[0].textContent).toContain('★');
  expect(rosterStore.current.savedResults.find((r) => r.name === 'Older').pinned).toBe(true);
});

it('rename and notes edit the persisted entry', () => {
  rosterStore.saveResult('sim', 'Run', { meanDps: 5 });
  mountRail();
  expandFirst();

  const buttons = [...target.querySelectorAll('.saved-actions button')];
  buttons.find((b) => b.textContent.trim() === 'Rename').click();
  flushSync();
  const input = target.querySelector('.rename-input');
  input.value = 'Best run yet';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  flushSync();
  expect(rosterStore.current.savedResults[0].name).toBe('Best run yet');

  const notes = target.querySelector('[data-testid="saved-notes"]');
  notes.value = 'with the new mount';
  notes.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.savedResults[0].notes).toBe('with the new mount');
});

it('delete needs a confirming second click', () => {
  rosterStore.saveResult('sim', 'Run', {});
  mountRail();
  expandFirst();

  const del = target.querySelector('.saved-delete');
  del.click();
  flushSync();
  expect(rosterStore.current.savedResults).toHaveLength(1);
  expect(del.textContent).toContain('Confirm');
  del.click();
  flushSync();
  expect(rosterStore.current.savedResults).toHaveLength(0);
});

it('export copies a plain-text summary (scalars + changes + config) to the clipboard', async () => {
  const writeText = vi.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  rosterStore.saveResult('opt', 'Opt run', {
    baselineScore: 100,
    bestScore: 110,
    changes: [{ dimension: 'Pet', from: 'Fox', to: 'Wolf' }],
    config: [{ label: 'Gear Loadout', value: 'Loadout 1' }],
  });
  mountRail();
  expandFirst();

  target.querySelector('[data-testid="saved-export"]').click();
  await Promise.resolve();
  flushSync();

  expect(writeText).toHaveBeenCalledOnce();
  const text = writeText.mock.calls[0][0];
  expect(text).toContain('Opt run');
  expect(text).toContain('baselineScore: 100');
  expect(text).toContain('Pet: Fox → Wolf');
  expect(text).toContain('Gear Loadout: Loadout 1');
});

it('compare mode diffs the shared numeric fields of two same-kind results and rejects kind mismatches', () => {
  rosterStore.saveResult('opt', 'Optimizer run', { bestScore: 1 });
  rosterStore.saveResult('sim', 'Run A', { meanDps: 100, totalDamage: { mean: 6000 } });
  rosterStore.saveResult('sim', 'Run B', { meanDps: 110, totalDamage: { mean: 6600 } });
  mountRail();

  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Compare').click();
  flushSync();

  heads()[1].click(); // Run A first - it becomes side A of the diff
  flushSync();
  heads()[2].click(); // the opt entry - different kind, rejected
  flushSync();
  expect(statuses).toContain('Compare two results of the same kind');
  expect(target.querySelector('[data-testid="saved-compare"]')).toBeNull();

  heads()[0].click(); // Run B - same kind, comparison renders as B
  flushSync();
  const panel = target.querySelector('[data-testid="saved-compare"]');
  expect(panel).not.toBeNull();
  expect(panel.textContent).toContain('meanDps');
  expect(panel.textContent).toContain('+10'); // 110 vs 100 shown B-minus-A
});

it('re-run appears only when canRerun allows it and hands the entry back to the screen', () => {
  const onRerun = vi.fn();
  rosterStore.saveResult('opt', 'Opt run', {});
  rosterStore.saveResult('sim', 'Sim run', { seed: 7 });
  mountRail({ onRerun, canRerun: (r) => r.kind === 'sim' });

  expandFirst(); // 'Sim run' (newest first)
  target.querySelector('[data-testid="saved-rerun"]').click();
  flushSync();
  expect(onRerun).toHaveBeenCalledOnce();
  expect(onRerun.mock.calls[0][0].summary.seed).toBe(7);

  heads()[0].click(); // collapse
  flushSync();
  heads()[1].click(); // 'Opt run' - not re-runnable
  flushSync();
  expect(target.querySelector('[data-testid="saved-rerun"]')).toBeNull();
});

it('expand(id) opens the entry from outside (expand-after-save)', () => {
  const id = rosterStore.saveResult('sim', 'Fresh save', { meanDps: 42 });
  mountRail();
  app.expand(id);
  flushSync();
  expect(target.querySelector('.saved-body')).not.toBeNull();
  expect(target.querySelector('.saved-body').textContent).toContain('42.00');
});
