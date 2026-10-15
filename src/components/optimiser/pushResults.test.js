// Push (backlog §10 item 1, simulation.md §Push) in the Optimiser: the goal list, the Target field, the
// ladder strip and headline, per-rung progress, Apply, and the saved run (jsdom).
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import PushLadder from './PushLadder.svelte';
import WinRateTarget from './WinRateTarget.svelte';
import ToolsOptimiserPage from '../pages/ToolsOptimiserPage.svelte';
import { setup, click, type } from '../ui/testkit.js';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs } from '../../lib/jobs.svelte.js';
import { saveUi } from '../../lib/uiState.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { SCHEMA_VERSION } from '../../lib/model/index.js';
import { metricKey } from '../../lib/engine/metrics.js';
import { searchCharacter, normaliseSetup } from '../../lib/ui/optimiserSetup.js';
import { viewResult, viewRun, ladderStrip, optimiserJobChips, OBJECTIVE_LABEL } from '../../lib/ui/optimiserView.js';
import { objectiveKindsFor } from '../../lib/search/objectives.js';
import { runFromResult } from '../../lib/model/runs.js';
import { pushResult } from '../../lib/__fixtures__/optimiser/index.js';

let mounted;
afterEach(() => {
  mounted?.done();
  mounted = null;
});

it('the goal list offers Push (deepest step) for chapters, dungeons, raids and Oblivion only', () => {
  expect(OBJECTIVE_LABEL.push).toBe('Push (deepest step)');
  for (const k of ['chapter', 'dungeon', 'raid', 'oblivion']) expect(objectiveKindsFor(k)).toEqual(['win-rate', 'push']);
  for (const k of ['dummy', 'worldBoss', 'custom']) expect(objectiveKindsFor(k)).not.toContain('push');
  const character = fixtureCharacter('WARRIOR');
  const s = normaliseSetup({ target: { kind: 'oblivion', floor: 4 }, objective: { kind: 'push', target: 0.6 } }, character);
  expect(s.objective).toEqual({ kind: 'push', target: 0.6 });
  expect(normaliseSetup({ target: { kind: 'dummy' }, objective: { kind: 'push' } }, character).objective).toEqual({ kind: 'dps' });
});

it('the Target field keeps the Push goal and explains the climb from the start step', () => {
  const state = { objective: { kind: 'push' } };
  mounted = setup(WinRateTarget, {
    get objective() { return state.objective; },
    set objective(v) { state.objective = v; },
    start: 'Dungeon Forsaken Mines, step 3',
  });
  expect(mounted.q('input').value).toBe('95');
  expect(mounted.q('[data-testid="win-rate-explain"]').textContent.replace(/\s+/g, ' ')).toMatch(/Climbs from Dungeon Forsaken Mines, step 3 to the deepest step a build clears at least 95% of the time/);
  const input = mounted.q('input');
  type(input, '60');
  input.dispatchEvent(new Event('blur'));
  flushSync();
  expect(state.objective).toEqual({ kind: 'push', target: 0.6 });
});

it('the ladder strip marks rungs the current build clears, rungs only the suggested build clears and the first not reached', () => {
  const push = pushResult().push;
  expect(ladderStrip(push).map((c) => [c.label, c.state])).toEqual([
    ['step 3', 'now'], ['step 4', 'now'], ['step 5', 'new'], ['step 6', 'new'], ['step 7', 'stop'],
  ]);
  mounted = setup(PushLadder, { push });
  const cells = mounted.qa('[data-testid="push-strip"] li');
  expect(cells.map((c) => c.dataset.state)).toEqual(['now', 'now', 'new', 'new', 'stop']);
  expect(cells[2].getAttribute('aria-label')).toBe('step 5: suggested build clears');
  expect(mounted.q('[data-testid="push-now"]').textContent).toBe('step 4');
  expect(mounted.q('[data-testid="push-reached"]').textContent).toBe('step 6');
  expect(mounted.q('[data-testid="push-found"]').textContent).toMatch(/measured on step 5/);
  expect(mounted.q('[data-testid="push-stop"]').textContent).toMatch(/Stopped at step 7: no build one change away came plausibly near 95% and no single change raised the rate \(best seen 40%\)\. Not reached at this effort/);
  expect(optimiserJobChips(pushResult())).toEqual([{ tone: 'up', text: 'Reaches step 6' }]);
});

it('a climb stopped by an optimisation that did not reach the target says so, and the top of the ladder too', () => {
  const r = pushResult();
  r.push.stop = { ...r.push.stop, reason: 'not-reached', best: { ...r.push.stop.best, est: 0.81 } };
  mounted = setup(PushLadder, { push: viewResult(r).push });
  expect(mounted.q('[data-testid="push-stop"]').textContent).toBe('Stopped at step 7: the search found no build that reaches 95% (best 81%).');
  expect(mounted.qa('[data-testid="push-strip"] li').at(-1).dataset.state).toBe('stop');
  const saved = viewRun(runFromResult(r, { presetName: 'Main' })).push;
  expect(saved.stop.reason).toBe('not-reached');
  mounted.done();
  const top = pushResult();
  top.push.stop = { index: null, label: null, reason: 'top', best: null };
  mounted = setup(PushLadder, { push: top.push });
  expect(mounted.q('[data-testid="push-stop"]').textContent).toBe('The climb reached the top of the ladder.');
  expect(mounted.qa('[data-testid="push-strip"] li').map((c) => c.dataset.state)).not.toContain('stop');
});

it('a saved Push run keeps its headline block and ladder strip', () => {
  const run = runFromResult(pushResult(), { presetName: 'Main' });
  expect(run.headline.push).toMatchObject({ status: 'pushed', target: 0.95, reached: { index: 5, label: 'step 6', foundLabel: 'step 5' }, baseline: { index: 3 }, stop: { index: 6, reason: 'screen' } });
  expect(run.detail.push.rungs).toHaveLength(5);
  expect(ladderStrip(viewRun(run).push)).toEqual(ladderStrip(viewResult(pushResult()).push));
});

// ---- the page --------------------------------------------------------------------------------------

let view;
let requests;
let release;
beforeEach(() => {
  localStorage.clear();
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  rosterStore.importFromJson(JSON.stringify({ schemaVersion: SCHEMA_VERSION, currentId: raw.id, characters: [raw] }));
  requests = [];
  // a runner that reports Push progress and finishes when the test says so
  __resetJobs({
    run: (request, hooks) => {
      requests.push(request);
      let done;
      const promise = new Promise((res) => { done = res; });
      queueMicrotask(() => hooks?.onProgress?.({
        type: 'progress', phase: 'climb', phases: [{ id: 'climb', label: 'Climb', state: 'current' }, { id: 'confirm', label: 'Confirm', state: 'queued' }],
        block: 'step 4', counts: { evaluated: 0, fights: 120 },
        steps: [{ id: 'a', label: 'Step 3', state: 'done', text: 'current build clears' }, { id: 'b', label: 'Step 4', state: 'current', text: '' }],
      }));
      release = () => {
        const r = pushResult();
        r.request.characterKey = metricKey('character', searchCharacter(rosterStore.current));
        done(r);
      };
      return { promise, cancel() {} };
    },
  });
  saveUi({ optimiserSetups: { [rosterStore.current.id]: { presetId: 'p1', target: { kind: 'dungeon', id: 'dungeon_1', step: 3 }, objective: { kind: 'push' }, effort: 'quick', seed: 1 } } });
});
afterEach(() => {
  view?.done();
  view = null;
});

it('runs Push as a job with per-step progress, then shows the strip, the headline, the build diff and Apply, and saves it', async () => {
  view = setup(ToolsOptimiserPage, {});
  flushSync();
  const objective = [...view.qa('select')].find((s) => [...s.options].some((o) => o.textContent === 'Push (deepest step)'));
  expect(objective.value).toBe('push');
  expect(view.q('[data-testid="win-rate-explain"]').textContent).toMatch(/Climbs from Dungeon Forsaken Mines, step 3/);
  click([...view.target.querySelectorAll('button')].find((b) => /^Optimise Main/.test(b.textContent.trim())));
  expect(requests[0]).toMatchObject({ mode: 'optimize', target: { kind: 'dungeon', id: 'dungeon_1', step: 3 }, objective: { kind: 'push' } });
  await vi.waitFor(() => expect(view.q('[data-testid="push-steps"]')).not.toBeNull());
  expect(view.q('[data-testid="push-steps"]').textContent).toMatch(/Step 3: current build clears/);
  release();
  await vi.waitFor(() => expect(view.q('[data-testid="push-ladder"]')).not.toBeNull());
  expect(view.target.textContent).toMatch(/Reaches step 6 \(now: step 4\)/);
  expect(view.qa('[data-testid="result-row"]')).toHaveLength(1);
  expect([...view.target.querySelectorAll('button')].some((b) => /^Apply/.test(b.textContent.trim()))).toBe(true);
  await vi.waitFor(() => expect(rosterStore.current.runs).toHaveLength(1));
  expect(rosterStore.current.runs[0].headline.push).toMatchObject({ status: 'pushed' });
});
