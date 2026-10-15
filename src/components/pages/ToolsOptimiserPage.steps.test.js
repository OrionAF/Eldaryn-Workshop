import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import ToolsOptimiserPage from './ToolsOptimiserPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs } from '../../lib/jobs.svelte.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { SCHEMA_VERSION } from '../../lib/model/index.js';
import { setup, click } from '../ui/testkit.js';
import { richResult, legacyRun } from '../../lib/__fixtures__/optimiser/index.js';

let view;

const stepRow = (id, o = {}) => ({ id, state: 'queued', reason: null, pass: 0, tried: 0, fights: 0, improved: false, ...o });
const STEPS = [
  stepRow('equipmentSet', { state: 'done', pass: 1, tried: 2, fights: 40, improved: true }),
  stepRow('spec', { state: 'skipped', reason: 'off' }),
  stepRow('talents', { state: 'done', pass: 1, tried: 9, fights: 300 }),
  stepRow('relics', { state: 'running', pass: 1, tried: 2, fights: 50 }),
];
const DONE = STEPS.map((s) => (s.state === 'running' ? { ...s, state: 'done' } : s));
const LINES_DONE = ['1. Gear set: done', '2. Talent set: skipped', '3. Talents: done', '4. Relics: done'];
const stepLines = (scope) => [...scope.querySelectorAll('.steplist li .what')].map((e) => e.textContent.replace(/\s+/g, ' ').trim());
const btn = (re) => [...view.target.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));
const mountPage = (props = {}) => {
  view = setup(ToolsOptimiserPage, props);
  flushSync();
  return view;
};

beforeEach(() => {
  localStorage.clear();
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  rosterStore.importFromJson(JSON.stringify({ schemaVersion: SCHEMA_VERSION, currentId: raw.id, characters: [raw] }));
});
afterEach(() => {
  view?.done();
  view = null;
});

it('search steps: a running run lists the blocks done and the one it is on, behind a button', () => {
  __resetJobs({
    run: (request, hooks) => {
      hooks.onProgress({ phases: [{ id: 'search', label: 'Search', state: 'current' }], counts: { evaluated: 3, fights: 40 }, block: 'relics', searchSteps: STEPS });
      return { promise: new Promise(() => {}), cancel() {} };
    },
  });
  mountPage();
  click(btn(/^Optimise Main/));
  const toggle = view.q('[data-testid="search-steps"] button');
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(stepLines(view.target)).toEqual([]);
  click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect(stepLines(view.target)).toEqual(['1. Gear set: done', '2. Talent set: skipped', '3. Talents: done', '4. Relics: in progress']);
  expect(view.q('.steplist').textContent).toContain('turned off under Allowed to change');
});

it('phase help: a collapsed disclosure explains the five steps next to the progress bar', () => {
  __resetJobs({
    run: (request, hooks) => {
      hooks.onProgress({ phases: [{ id: 'search', label: 'Search', state: 'current' }], counts: { evaluated: 3, fights: 40 }, block: 'relics', searchSteps: STEPS });
      return { promise: new Promise(() => {}), cancel() {} };
    },
  });
  mountPage();
  click(btn(/^Optimise Main/));
  const help = view.q('[data-testid="phase-help"]');
  expect(help.tagName).toBe('DETAILS');
  expect(help.open).toBe(false);
  expect(help.querySelector('summary').textContent).toBe('What the steps mean');
  expect([...help.querySelectorAll('dt')].map((d) => d.textContent)).toEqual(['Screen', 'Search', 'Minimise', 'Confirm', 'Attribute']);
});

it('search steps: a finished run keeps its list, in the history too', async () => {
  const r = richResult();
  r.search = { ...r.search, steps: DONE };
  __resetJobs({ run: () => ({ promise: Promise.resolve(r), cancel() {} }) });
  mountPage();
  click(btn(/^Optimise Main/));
  await vi.waitFor(() => expect(view.q('[data-testid="optimiser-results"]')).not.toBeNull(), { timeout: 5000 });
  click(view.q('[data-testid="search-steps"] button'));
  expect(stepLines(view.target)).toEqual(LINES_DONE);
  await vi.waitFor(() => expect(rosterStore.current.runs).toHaveLength(1));
  expect(rosterStore.current.runs[0].steps).toHaveLength(4);
  view.done();
  mountPage({ tab: 'history' });
  const row = view.q('[data-testid="run-row"]');
  click([...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Details'));
  click(row.querySelector('.steplist button'));
  expect(stepLines(row)).toEqual(LINES_DONE);
});

it('search steps: a saved run from before the list existed opens without one', () => {
  rosterStore.addRun(legacyRun('old'), {});
  flushSync();
  mountPage({ tab: 'history' });
  const row = view.q('[data-testid="run-row"]');
  click([...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Details'));
  expect(row.querySelector('.steplist')).toBeNull();
});
