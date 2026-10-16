// Combat Power on screen (backlog §10 item 2): each result row's Power change, the guard in setup step IV
// (quick picks, the blocker when the current build is below the floor, the request), and the Overview figure.
import { it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import OptimiserResults from './OptimiserResults.svelte';
import ToolsOptimiserPage from '../pages/ToolsOptimiserPage.svelte';
import CharacterOverviewPage from '../pages/CharacterOverviewPage.svelte';
import { setup, click } from '../ui/testkit.js';
import { viewResult, viewRun, powerText } from '../../lib/ui/optimiserView.js';
import { runFromResult } from '../../lib/model/runs.js';
import { richResult } from '../../lib/__fixtures__/optimiser/index.js';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs } from '../../lib/jobs.svelte.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { SCHEMA_VERSION } from '../../lib/model/index.js';
import { presetPower } from '../../lib/build/power.js';
import { formatFlat } from '../../lib/format.js';
import { crusadePowerRequirement } from '../../lib/game/pveContent.js';
import { powerFloorPicks, currentCrusadeGate } from '../../lib/ui/optimiserSetup.js';

let view;
let requests;
afterEach(() => {
  view?.done();
  view = null;
});

function withPower(result) {
  result.baseline.power = 20000;
  result.rows[0].power = 18760;
  result.rows[1].power = 20310;
  result.rows[2].power = 20000;
  return result;
}

it('powerText: the baseline\'s Power, a build\'s signed change, nothing without figures', () => {
  expect(powerText({ isBaseline: true, power: 250969 }, 250969)).toBe('Power 250.969');
  expect(powerText({ isBaseline: false, power: 18760 }, 20000)).toBe('Power −1.240');
  expect(powerText({ isBaseline: false, power: 20310 }, 20000)).toBe('Power +310');
  expect(powerText({ isBaseline: false, power: 20000 }, 20000)).toBe('Power ±0');
  expect(powerText({ isBaseline: false }, 20000)).toBe('');
  expect(powerText({ isBaseline: false, power: 1 }, null)).toBe('');
});

it('every result row shows its Power change against the baseline, in the data face', () => {
  view = setup(OptimiserResults, { view: viewResult(withPower(richResult())), presetName: 'Main' });
  expect(view.q('[data-testid="baseline-row"] [data-testid="row-power"]').textContent).toBe('Power 20.000');
  const rows = view.qa('[data-testid="result-row"] [data-testid="row-power"]').map((e) => e.textContent);
  expect(rows).toEqual(['Power −1.240', 'Power +310', 'Power ±0']);
  expect(view.q('[data-testid="row-power"]').classList.contains('pw')).toBe(true); // .pw: the data face (ResultRank styles)
});

it('a saved run keeps the rows\' Power; a run saved without it shows none', () => {
  const run = runFromResult(withPower(richResult()), { id: 'r', at: '2026-10-01T00:00:00.000Z' });
  view = setup(OptimiserResults, { view: viewRun(run), presetName: 'Main' });
  expect(view.qa('[data-testid="row-power"]')).toHaveLength(4);
  view.done();
  view = setup(OptimiserResults, { view: viewRun(runFromResult(richResult(), { id: 'o', at: '2026-10-01T00:00:00.000Z' })), presetName: 'Main' });
  expect(view.qa('[data-testid="row-power"]')).toHaveLength(0);
});

it('a change kept for the floor says so', () => {
  const r = withPower(richResult());
  r.rows[0].changes[0].keptBecause = 'power-floor';
  view = setup(OptimiserResults, { view: viewResult(r), presetName: 'Main' });
  click(view.q('[data-testid="result-row"] button[aria-expanded]'));
  expect(view.target.textContent).toContain('Kept to stay at or above your minimum Combat Power');
});

// ---- the page --------------------------------------------------------------------------------------

function fakeRun(result) {
  return (request, hooks) => {
    requests.push(request);
    return { promise: Promise.resolve().then(() => result), cancel() {} };
  };
}
function loadCharacter() {
  localStorage.clear();
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  rosterStore.importFromJson(JSON.stringify({ schemaVersion: SCHEMA_VERSION, currentId: raw.id, characters: [raw] }));
}
const btn = (re) => [...view.target.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));

beforeEach(() => {
  requests = [];
  loadCharacter();
  __resetJobs({ run: fakeRun(richResult()) });
});

it('setup step IV: the guard is off by default; on, it starts at the current Crusade gate and offers the quick picks', () => {
  view = setup(ToolsOptimiserPage, {});
  const guard = view.q('[data-testid="power-guard"]');
  expect(guard).not.toBeNull();
  expect(guard.querySelector('input[type="number"], .field input:not([type="checkbox"])')).toBeNull();
  click(guard.querySelector('input[type="checkbox"]'));
  const current = presetPower(rosterStore.current, 'p1').power;
  const labels = [...guard.querySelectorAll('select option')].map((o) => o.textContent);
  expect(labels).toEqual(expect.arrayContaining([`Current Power (${formatFlat(current)})`, 'Crusade Hard (11.000)', 'Crusade Mythic (13.000)', `Crusade Mythic+10 (${formatFlat(crusadePowerRequirement('MYTHIC', 10))})`]));
  expect(labels).toHaveLength(powerFloorPicks(current).length + 1); // + "Choose…"
  expect(view.q('[data-testid="power-guard-explain"]').textContent).toContain(formatFlat(current));

  click(btn(/^Optimise Main/));
  expect(requests[0].powerFloor).toBe(currentCrusadeGate(current)?.value ?? current); // on: the current Crusade gate
});

it('a floor above the current Power blocks the run and says why', () => {
  view = setup(ToolsOptimiserPage, {});
  const guard = view.q('[data-testid="power-guard"]');
  click(guard.querySelector('input[type="checkbox"]'));
  const select = guard.querySelector('select');
  const mythic10 = [...select.options].find((o) => o.textContent.startsWith('Crusade Mythic+10'));
  const current = presetPower(rosterStore.current, 'p1').power;
  // the fixture is far above Mythic+10, so set the floor above it by hand
  const input = guard.querySelector('input:not([type="checkbox"])');
  input.dispatchEvent(new Event('focus'));
  input.value = String(current + 1000);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur'));
  flushSync();
  expect(view.target.textContent).toMatch(/is below the floor of/);
  expect(btn(/^Optimise Main/).disabled || btn(/^Optimise Main/).getAttribute('aria-disabled') === 'true').toBe(true);
  // a quick pick under the current Power lifts the block
  select.value = mythic10.value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(view.target.textContent).not.toMatch(/is below the floor of/);
});

it('the Overview shows the active preset\'s Combat Power with a breakdown', () => {
  view = setup(CharacterOverviewPage, {});
  const p = presetPower(rosterStore.current, rosterStore.current.activePresetId);
  const box = view.q('[data-testid="combat-power"]');
  expect(box.textContent).toContain(formatFlat(p.power));
  expect(box.textContent).toContain('Main');
  for (const label of ['Gear', 'Sigils', 'Stones', 'Transcendence', 'Pet', 'Mount', 'Relics', 'Talents', 'Awakening', 'Level']) expect(box.textContent).toContain(label);
});
