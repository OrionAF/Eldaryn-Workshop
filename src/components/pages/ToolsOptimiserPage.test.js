import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import ToolsOptimiserPage from './ToolsOptimiserPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs, jobsStore } from '../../lib/jobs.svelte.js';
import { loadUi, saveUi } from '../../lib/uiState.js';
import { loadRoster } from '../../lib/storage.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { cloneAsOpponent } from '../../lib/features/duel.js';
import { SCHEMA_VERSION } from '../../lib/model/index.js';
import { metricKey } from '../../lib/engine/metrics.js';
import { searchCharacter } from '../../lib/ui/optimiserSetup.js';
import { notifications } from '../../lib/notify.svelte.js';
import { setup, click } from '../ui/testkit.js';
import { richResult, dpsResult, legacyRun, ttkResult } from '../../lib/__fixtures__/optimiser/index.js';
import { setPrefs as setEstimatePrefs, applyPrefs as resetEstimatePrefs } from '../../lib/prefs.svelte.js';
import { APP_VERSION as ESTIMATE_VERSION } from '../../lib/calibration.js';

let view;
let requests;

/** A fake runner: answers with a canned result (and a checkpoint) so the page logic is what is tested. */
function fakeRun(result) {
  return (request, hooks) => {
    requests.push(request);
    return {
      promise: Promise.resolve().then(() => {
        hooks?.onProgress?.({ phases: [{ id: 'search', label: 'Search', state: 'current', done: 1, total: 2 }], counts: { evaluated: 3, fights: 40 }, block: 'relics' });
        hooks?.onCheckpoint?.({ schema: 'optimiser-checkpoint/1', phase: 'search' });
        return typeof result === 'function' ? result(request) : result;
      }),
      cancel() {},
    };
  };
}

function loadCharacter({ opponent = false } = {}) {
  localStorage.clear();
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  if (opponent) raw.opponents = [{ ...cloneAsOpponent(fixtureCharacter('WARRIOR'), 'p1', 'WARRIOR_TANK', 'Tanky'), id: 'opp-a' }];
  rosterStore.importFromJson(JSON.stringify({ schemaVersion: SCHEMA_VERSION, currentId: raw.id, characters: [raw] }));
}
const mountPage = (props = {}) => {
  view = setup(ToolsOptimiserPage, props);
  flushSync();
  return view;
};
const text = () => view.target.textContent;
const btn = (re) => [...view.target.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));
const settle = () => vi.waitFor(() => expect(view.q('[data-testid="optimiser-results"]')).not.toBeNull(), { timeout: 5000 });

beforeEach(() => {
  requests = [];
  loadCharacter();
  __resetJobs({ run: fakeRun(richResult()) });
});
afterEach(() => {
  view?.done();
  view = null;
});

it('shows the five setup steps with the effort budgets printed and no time cap', () => {
  mountPage();
  const t = text();
  for (const step of ['Build to improve', 'Fight', 'Maximise', 'Allowed to change', 'Effort']) expect(t).toContain(step);
  expect(view.q('[data-testid="effort-plan"]').textContent).toMatch(/Resolves differences of 0\.5%/);
  expect(view.q('[data-testid="effort-plan"]').textContent).toMatch(/N 16 and stops.*N 32,768/);
  expect(view.q('[data-testid="effort-cost"]').textContent).toMatch(/not capped.*every block about 4 minutes/);
  expect(view.q('[data-testid="plan-summary"]').textContent).toMatch(/13 of 13 dimensions against Training dummy, 60 s/);
  expect(view.q('[data-testid="relic-cap"]')).not.toBeNull();
});

it('the Effort control shows each level with its indifference zone', () => {
  mountPage();
  const labels = [...view.qa('[aria-label="Effort"] button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  expect(labels).toEqual(['Quickδ 1%', 'Standardδ 0.5%', 'Thoroughδ 0.25%']);
});

it('starts a job whose request has the effort level, the toggles and a run-free character', async () => {
  mountPage();
  click(btn(/^Optimise Main/));
  expect(requests).toHaveLength(1);
  const req = requests[0];
  expect(req).toMatchObject({ mode: 'optimize', presetId: 'p1', effort: 'standard', seed: 1, target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' } });
  expect(req.character.runs).toEqual([]);
  for (const k of ['maxMs', 'finalMs', 'maxEvals', 'maxPasses', 'budget']) expect(req).not.toHaveProperty(k);
  expect(jobsStore.list[0]).toMatchObject({ tool: 'optimiser', title: 'Optimise Main' });
  await settle();
});

it('renders a finished result: sticky baseline, tie groups, verdicts, and saves schema 2 to the history', async () => {
  mountPage();
  click(btn(/^Optimise Main/));
  await settle();
  expect(view.q('[data-testid="baseline-row"]').textContent).toMatch(/NOW/);
  expect(view.qa('[data-testid="result-row"]')).toHaveLength(3);
  expect(text()).toContain('2 builds measured better than the current preset');
  expect(text()).toMatch(/1 build measured worse and is hidden/);
  expect(view.q('[data-testid="how-to-read"]').textContent).toMatch(/Significant/);
  expect(view.q('[data-testid="search-summary"]').textContent).toMatch(/builds tried/);
  await vi.waitFor(() => expect(rosterStore.current.runs).toHaveLength(1));
  const run = rosterStore.current.runs[0];
  expect(run).toMatchObject({ schema: 2, presetName: 'Main', headline: { unit: 'dps' } });
  expect(view.q('[role="tablist"]').textContent).toMatch(/Run history\s*1/);
});

it('Apply opens a scoped review that names side effects, writes through the store and marks the run applied', async () => {
  const result = dpsResult();
  result.rows[0].writes[0].sideEffects = [{ presetId: 'p2', name: 'Boss build', reason: 'uses Talent Set 1' }];
  __resetJobs({ run: fakeRun(result) });
  mountPage();
  click(btn(/^Optimise Main/));
  await settle();
  click(view.qa('[data-testid="result-row"] button[aria-expanded]')[0]);
  click(btn(/^Apply to Main/));
  const review = view.q('[data-testid="apply-review"]');
  expect(review.textContent).toMatch(/Also changes Boss build/);
  expect(view.qa('[data-testid="write-group"]')).toHaveLength(2);
  expect(rosterStore.current.presets[0].relicIds).toEqual([]);
  click(btn(/^Apply 2 groups/));
  expect(rosterStore.current.presets[0].relicIds.length).toBeGreaterThan(0);
  expect(rosterStore.current.runs[0].applied).toMatchObject({ rank: 1 });
  expect(notifications.log.at(-1).message).toMatch(/Applied rank 1 to Main/);
  // the character changed, so the measured run is now stale and Apply is off
  expect(text()).toMatch(/Setup changed since this run/);
});

it('excluding a group leaves it as it was', async () => {
  __resetJobs({ run: fakeRun(dpsResult()) });
  mountPage();
  click(btn(/^Optimise Main/));
  await settle();
  click(view.qa('[data-testid="result-row"] button[aria-expanded]')[0]);
  click(btn(/^Apply to Main/));
  const talentsBefore = JSON.stringify(rosterStore.current.talentSets);
  click(view.qa('[data-testid="write-group"] input[type="checkbox"]')[0]); // the talent group
  click(btn(/^Apply 1 group/));
  expect(rosterStore.current.presets[0].relicIds.length).toBeGreaterThan(0);
  expect(JSON.stringify(rosterStore.current.talentSets)).toBe(talentsBefore);
});

it('editing the preset after a run marks it stale and blocks Apply and Run more', async () => {
  mountPage();
  click(btn(/^Optimise Main/));
  await settle();
  expect(text()).not.toMatch(/Setup changed since this run/);
  rosterStore.renamePreset('p1', 'Renamed');
  flushSync();
  expect(text()).toMatch(/Setup changed since this run/);
  click(view.qa('[data-testid="result-row"] button[aria-expanded]')[2]);
  const apply = btn(/^Apply to/);
  expect(apply.getAttribute('aria-disabled')).toBe('true');
  expect(apply.title).toMatch(/character changed/);
  expect(btn(/^Run more$/)).toBeUndefined();
});

it('saving a run does not make it stale', async () => {
  mountPage();
  click(btn(/^Optimise Main/));
  await settle();
  await vi.waitFor(() => expect(rosterStore.current.runs).toHaveLength(1));
  expect(text()).not.toMatch(/Setup changed since this run/);
});

it('Run more re-measures the chosen row as a second job and replaces the saved run', async () => {
  mountPage();
  click(btn(/^Optimise Main/));
  await settle();
  await vi.waitFor(() => expect(rosterStore.current.runs).toHaveLength(1));
  const runId = rosterStore.current.runs[0].id;
  const row = view.qa('[data-testid="result-row"]')[2];
  click(row.querySelector('button[aria-expanded]'));
  click([...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Run more'));
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({ mode: 'optimizeMore', targetN: 4096, rowKeys: [richResult().rows[2].key] });
  expect(requests[1].result.schema).toBe('optimiser-result/2');
  await vi.waitFor(() => expect(jobsStore.list.at(-1).status).toBe('finished'));
  await vi.waitFor(() => expect(rosterStore.current.runs).toHaveLength(1));
  expect(rosterStore.current.runs[0].id).toBe(runId);
});

it('a cancelled run shows provisional rows and offers Resume', async () => {
  const r = richResult();
  r.status = 'cancelled';
  r.aborted = true;
  r.rows.forEach((x) => {
    x.provisional = true;
    x.vsBaseline = null;
    x.runMore = null;
    x.changes.forEach((c) => { c.own = null; c.needed = null; c.keptBecause = null; });
  });
  __resetJobs({ run: fakeRun(r) });
  mountPage();
  click(btn(/^Optimise Main/));
  await vi.waitFor(() => expect(text()).toMatch(/Cancelled\./));
  expect(text()).toMatch(/provisional/);
  expect(view.qa('[data-testid="result-row"]')[0].textContent).toMatch(/Simulating/);
  click(view.qa('[data-testid="result-row"] button[aria-expanded]')[0]);
  const apply = btn(/^Apply to/);
  expect(apply.getAttribute('aria-disabled')).toBe('true');
  click(btn(/^Resume$/));
  expect(requests).toHaveLength(2);
  expect(requests[1].resumeFrom).toMatchObject({ schema: 'optimiser-checkpoint/1' });
});

it('a failed baseline names the broken rules and links to the Loadout', async () => {
  const r = { ...dpsResult(), status: 'failed', rows: [], baseline: null, error: { message: 'The current preset breaks a game rule; fix it before optimising.' }, baselineViolations: [{ gate: 'relicSlots', field: 'relicIds', detail: '5 relics equipped, 4 slots' }] };
  __resetJobs({ run: fakeRun(r) });
  mountPage();
  click(btn(/^Optimise Main/));
  await vi.waitFor(() => expect(view.q('[data-testid="baseline-violations"]')).not.toBeNull());
  expect(view.q('[data-testid="baseline-violations"]').textContent).toMatch(/5 relics equipped, 4 slots/);
  expect(btn(/^Open Loadout$/)).toBeDefined();
  expect(view.q('[data-testid="optimiser-results"]')).toBeNull();
  expect(rosterStore.current.runs).toHaveLength(0);
});

it('a run that throws shows the error with Retry', async () => {
  __resetJobs({ run: () => ({ promise: Promise.reject(new Error('worker died')), cancel() {} }) });
  mountPage();
  click(btn(/^Optimise Main/));
  await vi.waitFor(() => expect(text()).toMatch(/worker died/));
  expect(btn(/^Retry$/)).toBeDefined();
});

it('the PVP fight needs a saved opponent and says where to add one', () => {
  mountPage();
  const opt = [...view.qa('option')].find((o) => o.value === 'pvp');
  expect(opt.disabled).toBe(true);
  expect(text()).toMatch(/PVP win rate needs a saved opponent/);
});

it('a PVP run sends the chosen opponents and seat', async () => {
  loadCharacter({ opponent: true });
  __resetJobs({ run: fakeRun(richResult()) });
  mountPage();
  const sel = [...view.qa('select')].find((s) => [...s.options].some((o) => o.value === 'pvp'));
  sel.value = 'pvp';
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  click([...view.qa('[data-testid="pvp-seats"] button')].find((b) => b.textContent.trim() === 'Both'));
  click(btn(/^Optimise Main/));
  expect(requests[0].target).toEqual({ kind: 'pvp', opponentIds: ['opp-a'], seats: 'both' });
  expect(requests[0].objective.kind).toBe('pvp-winrate');
  await settle();
});

it('keeps the setup per character across a remount, and a new character starts from the defaults', () => {
  mountPage();
  const seed = view.qa('input').find((i) => i.closest('.field')?.querySelector('label')?.textContent.trim() === 'Seed');
  seed.value = '7';
  seed.dispatchEvent(new Event('input', { bubbles: true }));
  seed.dispatchEvent(new Event('blur'));
  flushSync();
  click(btn(/^Quick/));
  const id = rosterStore.current.id;
  expect(loadUi().optimiserSetups[id]).toMatchObject({ seed: 7, effort: 'quick' });
  view.done();
  mountPage();
  expect(view.q('[aria-label="Effort"] [aria-pressed="true"]').textContent).toMatch(/Quick/);
  const other = rosterStore.addCharacter('Other', 'MAGE');
  flushSync();
  expect(rosterStore.current.id).toBe(other);
  expect(view.q('[aria-label="Effort"] [aria-pressed="true"]').textContent).toMatch(/Standard/);
});

it('a stored setup that no longer fits the character falls back instead of breaking', () => {
  saveUi({ optimiserSetups: { [rosterStore.current.id]: { presetId: 'gone', target: { kind: 'chapter', chapter: 99, level: 1 }, objective: { kind: 'bogus' }, effort: 'warp', seed: 'x' } } });
  mountPage();
  expect(view.q('[aria-label="Effort"] [aria-pressed="true"]').textContent).toMatch(/Standard/);
  expect(view.q('[data-testid="plan-summary"]').textContent).toMatch(/Training dummy/);
});

it('with no run yet the results pane says so', () => {
  mountPage();
  expect(view.q('[data-testid="optimiser-output"]').textContent).toMatch(/No run yet/);
});

// ---- Run history ---------------------------------------------------------------------------------

it('the history tab lists runs; a legacy run opens with "not measured"; Re-run with settings loads its setup', () => {
  rosterStore.addRun(legacyRun('old'), {});
  flushSync();
  mountPage({ tab: 'history' });
  const row = view.q('[data-testid="run-row"]');
  expect(row.textContent).toMatch(/Old run/);
  expect(row.textContent).toMatch(/before per-change effects/);
  click([...row.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Details'));
  expect(row.textContent).toMatch(/Per-change effects: not measured/);
  click(row.querySelector('[data-testid="baseline-row"]') ? row.querySelector('[data-testid="result-row"] button[aria-expanded]') : null);
  expect(row.querySelector('[data-testid="result-row"]').textContent).toMatch(/not measured/);
  click(btn(/^Re-run with settings$/));
  const saved = loadUi().optimiserSetups[rosterStore.current.id];
  expect(saved).toMatchObject({ seed: 3, target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' } });
});

it('two runs can be compared side by side', async () => {
  mountPage();
  click(btn(/^Optimise Main/));
  await settle();
  await vi.waitFor(() => expect(rosterStore.current.runs).toHaveLength(1));
  rosterStore.addRun(legacyRun('old'), {});
  view.done();
  mountPage({ tab: 'history' });
  const boxes = view.qa('[data-testid="run-row"] input[type="checkbox"]');
  expect(boxes).toHaveLength(2);
  expect(view.q('[data-testid="run-compare"]')).toBeNull();
  click(boxes[0]);
  click(boxes[1]);
  expect(view.q('[data-testid="run-compare"]')).not.toBeNull();
});

it('an empty history says so', () => {
  mountPage({ tab: 'history' });
  expect(text()).toMatch(/No runs yet/);
});

// ---- the real search -----------------------------------------------------------------------------

it('runs a real quick search over the relics, with every row listing a change, and saves it', async () => {
  __resetJobs(); // the real runner (inline in jsdom)
  saveUi({
    optimiserSetups: {
      [rosterStore.current.id]: {
        presetId: 'p1',
        target: { kind: 'dummy', seconds: 10 },
        objective: { kind: 'dps' },
        space: Object.fromEntries(['equipmentSet', 'spec', 'talents', 'pet', 'mount', 'minorGlyphs', 'majorGlyphs', 'relics', 'sigils', 'utility', 'ancient', 'conditions', 'transcendence'].map((k) => [k, k === 'relics'])),
        effort: 'quick',
        seed: 2,
      },
    },
  });
  mountPage();
  click(btn(/^Optimise Main/));
  await vi.waitFor(() => expect(view.q('[data-testid="optimiser-results"]')).not.toBeNull(), { timeout: 90000 });
  const rows = view.qa('[data-testid="result-row"]');
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    click(row.querySelector('button[aria-expanded]'));
    expect(row.querySelectorAll('.abl').length).toBeGreaterThan(0);
  }
  expect(view.q('[data-testid="baseline-row"]').textContent).toMatch(/NOW/);
  await vi.waitFor(() => expect(rosterStore.current.runs).toHaveLength(1));
  expect(text()).not.toMatch(/Setup changed since this run/);
}, 100000);

it('a history row opens its stored result in Setup & results, with Apply but not Run more', () => {
  rosterStore.addRun(richResult(), { presetName: 'Main', name: 'Pinned find' });
  flushSync();
  mountPage({ tab: 'history' });
  click(view.q('[data-testid="run-row"] button.open'));
  expect(view.q('#opt-panel-setup')).not.toBeNull();
  expect(view.q('[data-testid="optimiser-results"]')).not.toBeNull();
  expect(text()).toMatch(/Saved run/);
  expect(view.qa('[data-testid="result-row"]').length).toBeGreaterThan(0);
  // Apply is offered (off here: the fixture run was measured on another character); Run more never is
  click(view.q('[data-testid="result-row"] button[aria-expanded]'));
  expect(btn(/^Apply to Main/)).toBeDefined();
  expect(btn(/^Run more$/)).toBeUndefined();
  click(btn(/^Close$/));
  expect(view.q('[data-testid="optimiser-results"]')).toBeNull();
});

it('Pin on a history row keeps the run through Clear unpinned', () => {
  rosterStore.addRun(richResult(), { presetName: 'Main', name: 'Keep me' });
  rosterStore.addRun(dpsResult(), { presetName: 'Main', name: 'Drop me' });
  flushSync();
  mountPage({ tab: 'history' });
  const rows = () => view.qa('[data-testid="run-row"]');
  const keep = rows().find((r) => /Keep me/.test(r.textContent));
  click([...keep.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pin'));
  expect(rosterStore.current.runs.find((r) => r.name === 'Keep me').pinned).toBe(true);
  click(btn(/^Clear unpinned$/));
  click(btn(/^Confirm clear$/));
  expect(rosterStore.current.runs.map((r) => r.name)).toEqual(['Keep me']);
});

it('a saved run survives a reload with its rows and changes', () => {
  rosterStore.addRun(richResult(), { presetName: 'Main' });
  const reloaded = loadRoster().characters.find((c) => c.id === rosterStore.current.id);
  const run = reloaded.runs[0];
  expect(run.detail.rows.length).toBeGreaterThan(0);
  expect(run.detail.rows[0].changes.length).toBeGreaterThan(0);
});

it('a blank survival window means the whole fight, not 5 s', () => {
  saveUi({
    optimiserSetups: {
      [rosterStore.current.id]: { presetId: 'p1', target: { kind: 'custom', mob: { hp: 1000000, attack: 10000, attackSpeed: 1 }, seconds: 60 }, objective: { kind: 'survival', seconds: 30 }, effort: 'quick', seed: 1 },
    },
  });
  mountPage();
  const field = [...view.qa('label')].find((l) => l.textContent.trim() === 'Survive for (s)');
  const input = document.getElementById(field.htmlFor);
  expect(input.value).toBe('30');
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  click(btn(/^Optimise Main/));
  expect(requests[0].objective).toEqual({ kind: 'survival' });
});

// ---- saved runs can be applied -------------------------------------------------------------------

/** A fixture result measured on the character as it is now (so the saved run is not stale). */
const keyed = (r) => {
  r.request.characterKey = metricKey('character', searchCharacter(rosterStore.current));
  return r;
};
const expandFirst = () => click(view.qa('[data-testid="result-row"] button[aria-expanded]')[0]);

it('after a reload (no job) the newest saved run shows in Setup & results with Apply, not "No run yet"', () => {
  rosterStore.addRun(keyed(dpsResult()), { presetName: 'Main' });
  flushSync();
  mountPage();
  expect(text()).not.toMatch(/No run yet/);
  expect(text()).toMatch(/Saved/);
  expandFirst();
  const apply = btn(/^Apply to Main/);
  expect(apply).toBeDefined();
  expect(apply.getAttribute('aria-disabled')).not.toBe('true');
});

it('Apply from the saved run writes through the store, marks that run applied and then goes stale', () => {
  rosterStore.addRun(keyed(dpsResult()), { presetName: 'Main' });
  flushSync();
  mountPage();
  expandFirst();
  expect(rosterStore.current.presets[0].relicIds).toEqual([]);
  click(btn(/^Apply to Main/));
  expect(view.q('[data-testid="apply-review"]')).not.toBeNull();
  click(btn(/^Apply \d groups?/));
  expect(rosterStore.current.presets[0].relicIds.length).toBeGreaterThan(0);
  expect(rosterStore.current.runs[0].applied).toMatchObject({ rank: 1 });
  expect(notifications.log.at(-1).message).toMatch(/Applied rank 1 to Main/);
  // the character moved on: the same run cannot be applied twice from stale numbers
  expect(btn(/^Apply to Main/).getAttribute('aria-disabled')).toBe('true');
});

it('Run history Details offers Apply on the row, with the reason when the character has changed', () => {
  rosterStore.addRun(keyed(dpsResult()), { presetName: 'Main' });
  flushSync();
  mountPage({ tab: 'history' });
  click(btn(/^Details$/));
  expandFirst();
  expect(btn(/^Apply to Main/).getAttribute('aria-disabled')).not.toBe('true');
  rosterStore.renamePreset('p1', 'Renamed');
  flushSync();
  expect(btn(/^Apply to Main/).getAttribute('aria-disabled')).toBe('true');
  expect(btn(/^Apply to Main/).title).toMatch(/character changed/);
});

it('Closing the opened saved run leaves the empty state, not the run again', () => {
  rosterStore.addRun(keyed(dpsResult()), { presetName: 'Main' });
  flushSync();
  mountPage();
  click(btn(/^Close$/));
  expect(view.q('[data-testid="optimiser-results"]')).toBeNull();
  expect(text()).toMatch(/No run yet/);
});

it('a run saved without write groups says to re-run, not "Nothing to write"', () => {
  rosterStore.addRun(keyed(dpsResult()), { presetName: 'Main' });
  for (const row of rosterStore.current.runs[0].detail.rows) row.writes = [];
  flushSync();
  mountPage();
  expandFirst();
  expect(btn(/^Apply to Main/).title).toMatch(/saved before it could be applied/);
});

it('§3: the Estimate section shows builds, fights and time, or a link to calibrate', () => {
  resetEstimatePrefs();
  mountPage();
  const sec = () => view.q('[data-testid="setup-estimate"]');
  expect(sec().textContent).toMatch(/Estimate/);
  expect(view.q('[data-testid="estimate-builds"] .num').textContent).toMatch(/^[\d,]+$/);
  expect(view.q('[data-testid="estimate-fights"] .num').textContent).toMatch(/^[\d,]+$/);
  expect(view.q('[data-testid="estimate-time"] a').getAttribute('href')).toBe('#/settings');
  view.done();
  view = null;
  setEstimatePrefs({ calibration: { profile: 'balanced', workers: 4, fightsPerSec: { dummy: 100, dungeon: 100, duel: 100 }, measuredAt: Date.now(), version: ESTIMATE_VERSION } });
  mountPage();
  expect(view.q('[data-testid="estimate-time"] a')).toBeNull();
  expect(view.q('[data-testid="estimate-time"]').textContent).toMatch(/about .* range .* to /);
  localStorage.clear();
  resetEstimatePrefs();
});

it('§3: the estimate updates live when an allowed-to-change toggle changes', () => {
  mountPage();
  const builds = () => view.q('[data-testid="estimate-builds"]').textContent.replace(/\s+/g, ' ').trim();
  const chip = (label) => [...view.qa('[data-testid="space-picker"] button')].find((b) => b.textContent.trim() === label);
  click(btn(/^None$/));
  flushSync();
  expect(builds()).toMatch(/^Builds to try 1 exactly/);
  click(chip('Pet'));
  flushSync();
  expect(builds()).toMatch(/^Builds to try 2 exactly/);
  click(chip('Talent points'));
  flushSync();
  expect(builds()).toMatch(/^Builds to try about [\d,]+ range [\d,]+ to [\d,]+/);
});

// ---- retired goals stay viewable but cannot be re-run ------------------------------------------------

it('a saved kill-time run stays viewable; Re-run with settings is off with the reason', () => {
  const r = ttkResult();
  r.request.characterKey = metricKey('character', searchCharacter(rosterStore.current));
  rosterStore.addRun(r, { presetName: 'Main' });
  flushSync();
  mountPage();
  expect(text()).toMatch(/Saved/);
  expect(view.q('[data-testid="optimiser-results"]')).not.toBeNull();
  const rerun = btn(/^Re-run with settings/);
  expect(rerun.getAttribute('aria-disabled')).toBe('true');
  expect(rerun.title).toBe('This goal was retired.');
});

it('Run history: Re-run with settings is off for a retired goal and on for a live one', () => {
  rosterStore.addRun(ttkResult(), { presetName: 'Main', id: 'retired' });
  rosterStore.addRun(dpsResult(), { presetName: 'Main', id: 'live' });
  flushSync();
  mountPage({ tab: 'history' });
  const rerunOf = (i) => {
    click([...view.target.querySelectorAll('button')].filter((x) => /^Details$/.test(x.textContent.trim()))[i]);
    const found = [...view.target.querySelectorAll('button')].find((x) => /^Re-run with settings/.test(x.textContent.trim()));
    return found;
  };
  const states = [0, 1].map((i) => {
    const b = rerunOf(i);
    return [b.getAttribute('aria-disabled') === 'true', b.title];
  });
  expect(states.map((x) => x[0]).sort()).toEqual([false, true]);
  expect(states.find((x) => x[0])[1]).toBe('This goal was retired.');
});
