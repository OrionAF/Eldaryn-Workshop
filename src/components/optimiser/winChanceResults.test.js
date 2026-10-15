// 'Highest chance to win' in the setup and the results (W3; simulation.md §Win rate): the goal list and its
// one-line explanations, tries per clear on every row without a target, and the no-wins and already states.
import { it, expect, afterEach, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import OptimiserResults from './OptimiserResults.svelte';
import ToolsOptimiserPage from '../pages/ToolsOptimiserPage.svelte';
import { setup, click } from '../ui/testkit.js';
import { viewResult, viewRun, goalWinRate } from '../../lib/ui/optimiserView.js';
import { runFromResult, normaliseRun } from '../../lib/model/runs.js';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { saveUi } from '../../lib/uiState.js';
import { SCHEMA_VERSION } from '../../lib/model/index.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { winChanceResult } from '../../lib/__fixtures__/optimiser/index.js';

let mounted;
afterEach(() => {
  mounted?.done();
  mounted = null;
});
const mountResults = (result) => {
  mounted = setup(OptimiserResults, { view: viewResult(result), presetName: 'Main' });
  return mounted;
};

describe('the setup', () => {
  beforeEach(() => {
    localStorage.clear();
    const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
    rosterStore.importFromJson(JSON.stringify({ schemaVersion: SCHEMA_VERSION, currentId: raw.id, characters: [raw] }));
  });
  const page = (objective) => {
    saveUi({ optimiserSetups: { [rosterStore.current.id]: { target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, ...(objective ? { objective } : {}) } } });
    mounted = setup(ToolsOptimiserPage, {});
    flushSync();
    return mounted;
  };
  const options = (ui) => [...ui.target.querySelectorAll('select option')].map((o) => o.textContent.trim());

  it("a dungeon's goal list leads with 'Highest chance to win' (the default) and explains it in one line", () => {
    const ui = page();
    const opts = options(ui);
    expect(opts.indexOf('Highest chance to win')).toBeGreaterThanOrEqual(0);
    expect(opts.indexOf('Reach a win rate')).toBe(opts.indexOf('Highest chance to win') + 1);
    expect(ui.q('[data-testid="win-chance-explain"]').textContent.trim()).toBe('Finds the build with the best chance to clear this; ties go to the fewest changes. Speed does not matter.');
    expect(ui.q('[data-testid="win-rate-target"]')).toBeNull();
  });

  it("an old saved 'Reach a win rate' setup keeps its target field and explanation", () => {
    const ui = page({ kind: 'win-rate', target: 0.7 });
    expect(ui.q('[data-testid="win-chance-explain"]')).toBeNull();
    expect(ui.q('[data-testid="win-rate-target"] input').value).toBe('70');
    expect(ui.q('[data-testid="win-rate-explain"]').textContent).toMatch(/at least 70% of the time/);
  });
});

it('rows show the win rate with its CI and tries per clear, and no target chip', () => {
  const ui = mountResults(winChanceResult());
  const rows = ui.qa('[data-testid="result-row"]');
  expect(rows[0].textContent).toMatch(/96\.0% \(95\.0% to 97\.0%\)/);
  expect(rows[0].textContent).toMatch(/about 1\.0 tries per clear/);
  expect(ui.q('[data-testid="baseline-row"]').textContent).toMatch(/about 1\.4 tries per clear/);
  expect(ui.q('[data-testid="target-chip"]')).toBeNull();
  expect(goalWinRate(viewResult(winChanceResult()))).toBe(0.96);
});

it('when no build won, a banner says so and the rows are compared on how far the fights got', () => {
  const ui = mountResults(winChanceResult('no-wins'));
  expect(ui.q('[data-testid="goal-no-wins"]').textContent).toMatch(/No build won a fight/);
  expect(ui.q('[data-testid="result-row"]').textContent).toMatch(/no clears/);
  click(ui.q('[data-testid="result-row"] button[aria-expanded]'));
  expect(ui.q('[data-testid="goal-basis"]').textContent).toMatch(/Neither build won a fight/);
});

it('the best build leads with its chance to win and its CI', () => {
  const ui = mountResults(winChanceResult('best'));
  const b = ui.q('[data-testid="goal-best"]');
  expect(b.textContent).toMatch(/Best chance to win: 96\.0% \(95\.0% to 97\.0%\)\./);
  expect(b.textContent).toMatch(/fewer changes ranks first/);
  expect(b.querySelector('.banner').classList.contains('success')).toBe(true);
  expect(ui.q('[data-testid="goal-no-gain"]')).toBeNull();
});

it('when no change beat the current build, a neutral banner says so with the current rate', () => {
  const ui = mountResults(winChanceResult('no-gain'));
  const b = ui.q('[data-testid="goal-no-gain"]');
  expect(b.textContent).toMatch(/No change raised the chance to win\./);
  expect(b.textContent).toMatch(/The current build wins 70\.0% \(68\.0% to 72\.0%\)/);
  expect(b.querySelector('.banner').classList.contains('info')).toBe(true);
  expect(ui.q('[data-testid="goal-best"]')).toBeNull();
});

it('a build that clears every try needs no change', () => {
  const ui = mountResults(winChanceResult('already'));
  expect(ui.q('[data-testid="goal-already"]').textContent).toMatch(/Already clears every try/);
  expect(ui.qa('[data-testid="result-row"]')).toHaveLength(0);
});

it('a saved run keeps the goal mode and status', () => {
  const run = normaliseRun(JSON.parse(JSON.stringify(runFromResult(winChanceResult('no-wins'), {}))));
  expect(run.headline.goal).toEqual({ mode: 'max', status: 'no-wins', target: null });
  const v = viewRun(run);
  expect(v.goal).toEqual({ mode: 'max', status: 'no-wins', target: null });
  expect(v.kind).toBe('win-chance');
});

it('a run saved before W3 (a target goal, no goal.mode) still loads as a target goal', () => {
  const run = normaliseRun(JSON.parse(JSON.stringify(runFromResult(winChanceResult('best'), {}))));
  run.objective = { ...run.objective, kind: 'win-rate' };
  run.headline.goal = { status: 'not-reached', target: 0.95 };
  const v = viewRun(normaliseRun(JSON.parse(JSON.stringify(run))));
  expect(v.goal).toEqual({ status: 'not-reached', target: 0.95 });
  expect(v.kind).toBe('win-rate');
});
