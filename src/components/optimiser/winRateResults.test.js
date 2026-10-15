// The PVE win-rate goal in the setup and the results (backlog §4, W2): the Target field, the Meets / Below
// target chips, the success and not-reached states, win-rate-point effects, run history.
import { it, expect, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import OptimiserResults from './OptimiserResults.svelte';
import WinRateTarget from './WinRateTarget.svelte';
import { setup, click, type } from '../ui/testkit.js';
import { viewResult, viewRun, orientContrast, targetStanding, optimiserJobChips, OBJECTIVE_LABEL } from '../../lib/ui/optimiserView.js';
import { objectiveKindsFor } from '../../lib/search/objectives.js';
import { runFromResult, normaliseRun } from '../../lib/model/runs.js';
import { winRateResult } from '../../lib/__fixtures__/optimiser/index.js';

let mounted;
afterEach(() => {
  mounted?.done();
  mounted = null;
});
const mountView = (view, props = {}) => {
  mounted?.done();
  mounted = setup(OptimiserResults, { view, presetName: 'Main', ...props });
  return mounted;
};
const mountResults = (result, props) => mountView(viewResult(result), props);
const change = (input, v) => {
  type(input, v);
  input.dispatchEvent(new Event('blur'));
  flushSync();
};

it('the goal list leads with win rate for chapter, dungeon, raid and Oblivion, labelled as clearing without dying', () => {
  for (const k of ['chapter', 'dungeon', 'raid', 'oblivion']) expect(objectiveKindsFor(k)[0]).toBe('win-rate');
  expect(OBJECTIVE_LABEL['win-rate']).toBe('Win rate (clear without dying)');
});

it('the Target field shows percent (default 95), clamps to 10-100 and explains itself with the target', () => {
  const state = { objective: { kind: 'win-rate' } };
  mounted = setup(WinRateTarget, {
    get objective() { return state.objective; },
    set objective(v) { state.objective = v; },
  });
  const ui = mounted;
  const input = ui.q('input');
  expect(ui.q('label').textContent).toMatch(/Target/);
  expect(input.value).toBe('95');
  expect(ui.q('[data-testid="win-rate-explain"]').textContent.replace(/\s+/g, ' ').trim()).toBe(
    'Finds the build with the fewest changes that clears this at least 95% of the time. Speed does not matter. A loss usually costs nothing but time (a chapter level restarts; an Oblivion floor keeps its key), so a lower target is fine for content you can retry.',
  );
  change(input, '80');
  expect(state.objective).toEqual({ kind: 'win-rate', target: 0.8 });
  change(input, '10');
  expect(state.objective.target).toBe(0.1);
  change(input, '5'); // below 10 is refused with an error, the target stays
  expect(state.objective.target).toBe(0.1);
  expect(ui.q('.error, [id$="-err"]')?.textContent ?? '').toMatch(/minimum/i);
});

it('the explanation names the chosen target', () => {
  mounted = setup(WinRateTarget, { objective: { kind: 'win-rate', target: 0.8 } });
  expect(mounted.q('[data-testid="win-rate-explain"]').textContent).toMatch(/at least 80% of the time/);
});

it('a win-rate contrast is shown in win-rate points, uncapped, keeping its verdict', () => {
  const c = { ...winRateResult().rows[0].vsBaseline, delta: 0.12, winRate: { delta: 0.26, lo: 0.21, hi: 0.31 } };
  const o = orientContrast(c);
  expect([o.delta, o.lo, o.hi]).toEqual([0.26, 0.21, 0.31]);
  expect(o.verdict).toBe('better');
});

it('rows show the win rate with its 95% CI, a Meets / Below target chip and the gap below the target', () => {
  const ui = mountResults(winRateResult('not-reached'));
  const rows = ui.qa('[data-testid="result-row"]');
  expect(rows[0].textContent).toMatch(/82\.0% \(80\.0% to 84\.0%\)/);
  expect(rows[0].querySelector('[data-testid="target-chip"]').textContent).toMatch(/Below target/);
  expect(rows[0].textContent).toMatch(/13\.0 pts below target/);
  expect(ui.q('[data-testid="baseline-row"] [data-testid="target-chip"]').textContent).toMatch(/Below target/);
  const ok = mountResults(winRateResult('reached'));
  expect(ok.q('[data-testid="result-row"] [data-testid="target-chip"]').textContent).toMatch(/Meets target/);
});

it('one axis in percentage points of win rate; per-change rows show their own effect in points', () => {
  const ui = mountResults(winRateResult('reached'));
  expect(ui.qa('.axis')).toHaveLength(1);
  expect(ui.q('.head').textContent).toMatch(/percentage points/);
  expect(ui.q('[data-testid="result-row"]').textContent).toMatch(/\+26\.0 pts/);
  click(ui.qa('[data-testid="result-row"] button[aria-expanded]')[0]);
  expect(ui.q('[data-testid="result-row"] [role="region"]').textContent).toMatch(/\+10\.0 pts/);
});

it('says which criterion decided a verdict, and shows no TTK-fallback note', () => {
  const ui = mountResults(winRateResult('not-reached'));
  click(ui.qa('[data-testid="result-row"] button[aria-expanded]')[1]);
  expect(ui.qa('[data-testid="goal-basis"]').map((n) => n.textContent).join(' ')).toMatch(/how far the fights got/);
  expect(ui.q('[data-testid="winrate-note"]')).toBeNull();
});

it('a build that already clears shows a success state, no rows and no suggested changes', () => {
  const ui = mountResults(winRateResult('already'));
  expect(ui.q('[data-testid="goal-already"]').textContent).toMatch(/Already clears the target/);
  expect(ui.q('[data-testid="goal-already"]').textContent).toMatch(/No changes suggested/);
  expect(ui.qa('[data-testid="result-row"]')).toHaveLength(0);
  expect(ui.q('[data-testid="baseline-row"] [data-testid="target-chip"]').textContent).toMatch(/Meets target/);
});

it('when no build reaches the target it says so and lists the closest builds', () => {
  const ui = mountResults(winRateResult('not-reached'));
  expect(ui.q('[data-testid="goal-not-reached"]').textContent).toMatch(/No build reached 95%/);
  expect(ui.qa('[data-testid="result-row"]')).toHaveLength(2);
});

it('targetStanding: meets, below, open, none', () => {
  const row = (m, est) => ({ aux: { meetsTarget: m, winRate: { est } } });
  expect(targetStanding(row(true, 0.97), 0.95)).toEqual({ verdict: 'meets', gap: '' });
  expect(targetStanding(row(false, 0.8), 0.95)).toEqual({ verdict: 'below', gap: '15.0 pts below target' });
  expect(targetStanding(row(null, 0.94), 0.95).verdict).toBe('open');
  expect(targetStanding({ aux: {} }, 0.95).verdict).toBeNull();
  expect(targetStanding(row(true, 1), null).verdict).toBeNull();
});

it('the Jobs tray names the goal outcome', () => {
  expect(optimiserJobChips(winRateResult('already'))[0].text).toBe('Already clears');
  expect(optimiserJobChips(winRateResult('reached'))[0].text).toBe('Target reached');
  expect(optimiserJobChips(winRateResult('not-reached'))[0].text).toBe('Target not reached');
});

it('a saved win-rate run keeps the goal, the chips and the win-rate points, and replays in the table', () => {
  for (const status of ['reached', 'not-reached', 'already']) {
    const run = normaliseRun(JSON.parse(JSON.stringify(runFromResult(winRateResult(status), { presetName: 'Main' }))));
    expect(run.headline.goal).toEqual({ status, target: 0.95 });
    const view = viewRun(run);
    expect(view.kind).toBe('win-rate');
    const ui = mountView(view);
    expect(ui.q('[data-testid="baseline-row"] [data-testid="target-chip"]')).not.toBeNull();
    if (status === 'already') expect(ui.q('[data-testid="goal-already"]')).not.toBeNull();
    else expect(ui.qa('[data-testid="result-row"]')).toHaveLength(2);
  }
  const run = runFromResult(winRateResult('reached'));
  expect(run.detail.rows[0].vsBaseline.winRate).toEqual({ delta: 0.26, lo: 0.21, hi: 0.31 });
  expect(run.detail.rows[0].aux.meetsTarget).toBe(true);
});

it('every win rate carries "about N tries per clear": rows, baseline and the goal banners', () => {
  const ui = mountResults(winRateResult('not-reached'));
  const rows = ui.qa('[data-testid="result-row"]');
  expect(rows[0].textContent).toMatch(/about 1\.2 tries per clear/); // 82.0 %
  expect(ui.q('[data-testid="baseline-row"]').textContent).toMatch(/about 1\.4 tries per clear/); // 70.0 %
  expect(ui.q('[data-testid="goal-not-reached"]').textContent).toMatch(/about 1\.2 tries per clear/); // the leading row
  const already = mountResults(winRateResult('already'));
  expect(already.q('[data-testid="goal-already"]').textContent).toMatch(/about 1\.0 tries per clear/);
  expect(already.q('[data-testid="baseline-row"]').textContent).toMatch(/about 1\.0 tries per clear/);
});

it('the Target field accepts 10 % and says a loss usually costs nothing but time', () => {
  mounted = setup(WinRateTarget, { objective: { kind: 'win-rate', target: 0.1 } });
  expect(mounted.q('input').value).toBe('10');
  expect(mounted.q('[data-testid="win-rate-explain"]').textContent).toMatch(/A loss usually costs nothing but time/);
});

it('a Fortress boss result shows raw and credited damage for the rows and the current build', () => {
  const result = winRateResult();
  result.objective = { kind: 'dps', label: 'Damage per second', unit: 'dps', higherIsBetter: true, statistic: 'mean', q: null };
  result.target = { ...result.target, kind: 'fortressBoss', fortress: { shieldPercent: 30, contributionBonus: 1.5, starVulnerability: 6, total: 6.3 } };
  for (const r of [result.baseline, ...result.rows]) r.value = { ...r.value, est: 1000 };
  const view = viewResult(result);
  expect(view.fortress.total).toBe(6.3);
  const ui = mountView(view);
  const base = ui.q('[data-testid="fortress-credit-baseline"]');
  expect(base.textContent).toMatch(/60,?000/);
  expect(base.textContent).toMatch(/378,?000/);
  click(ui.qa('[data-testid="result-row"] button[aria-expanded]')[0]);
  const notes = ui.qa('[data-testid="fortress-credit"]');
  expect(notes.length).toBeGreaterThan(0);
  expect(notes[0].textContent).toMatch(/378,?000/);
});
