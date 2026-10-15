import { it, expect, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import OptimiserResults from './OptimiserResults.svelte';
import ApplyReview from './ApplyReview.svelte';
import SpaceGroups from './SpaceGroups.svelte';
import RunCompare from './RunCompare.svelte';
import { setup, click } from '../ui/testkit.js';
import { viewResult, viewRun } from '../../lib/ui/optimiserView.js';
import { runFromResult } from '../../lib/model/runs.js';
import { SPACE_DEFAULTS } from '../../lib/search/space.js';
import { dpsResult, ttkResult, richResult, pvpResult, legacyRun } from '../../lib/__fixtures__/optimiser/index.js';

let mounted;
afterEach(() => {
  mounted?.done();
  mounted = null;
});
const mountResults = (result, props = {}) => {
  mounted = setup(OptimiserResults, { view: viewResult(result), presetName: 'Main', ...props });
  return mounted;
};
const toggle = (ui, n) => {
  click(ui.qa('[data-testid="result-row"] button[aria-expanded]')[n]);
};

it('pins the baseline as NOW and draws one row per build on a single axis', () => {
  const ui = mountResults(dpsResult());
  expect(ui.q('[data-testid="baseline-row"]').textContent).toMatch(/NOW/);
  expect(ui.q('.sticky [data-testid="baseline-row"]')).not.toBeNull();
  expect(ui.qa('[data-testid="result-row"]')).toHaveLength(3);
  expect(ui.qa('.axis')).toHaveLength(1);
});

it('prints tie groups as "1=", and every row has at least one change', () => {
  const ui = mountResults(richResult());
  const marks = ui.qa('[data-testid="result-row"] .mark').map((m) => m.textContent.trim());
  expect(marks).toEqual(['1=', '2=', '3']);
  const result = richResult();
  result.rows[0].changes = [];
  const ui2 = setup(OptimiserResults, { view: viewResult(result), presetName: 'Main' });
  expect(ui2.qa('[data-testid="result-row"]')).toHaveLength(2);
  ui2.done();
});

it('an expanded row lists each change with its own effect, scope, and what dropping it costs', () => {
  const ui = mountResults(richResult());
  toggle(ui, 0);
  const body = ui.q('[data-testid="result-row"] [role="region"]');
  expect(body.textContent).toMatch(/Talents \(set 1\)/);
  expect(body.textContent).toMatch(/Without it:/);
  expect(body.textContent).toMatch(/Kept for its own effect/);
  expect(body.querySelector('.scope-chip').textContent).toMatch(/Character/);
  expect(body.textContent).toMatch(/also Boss build/);
});

it('the interaction remainder is shown with no interval and no verdict colour', () => {
  const ui = mountResults(richResult());
  toggle(ui, 0);
  const rem = ui.q('.remainder');
  expect(rem.textContent).toMatch(/Interaction remainder/);
  expect(rem.textContent).toMatch(/no interval/);
  expect(rem.querySelector('.up, .down')).toBeNull();
});

it('the remainder never prints an interval, even when a saved row carries bounds', () => {
  const result = richResult();
  result.rows[0].remainder = { delta: 1200, lo: 800, hi: 1600, method: 'difference' };
  const ui = mountResults(result);
  toggle(ui, 0);
  const rem = ui.q('.remainder');
  expect(rem.textContent).toMatch(/no interval/);
  expect(rem.textContent).not.toMatch(/95% CI/);
});

it('a row that is too close to call says how many fights would settle it and offers Run more', () => {
  const onrunmore = vi.fn();
  const ui = mountResults(richResult(), { onrunmore });
  toggle(ui, 2);
  const rows = ui.qa('[data-testid="result-row"]');
  expect(rows[2].textContent).toMatch(/Too close to call at/);
  expect(rows[2].textContent).toMatch(/about 2,400 fights needed/);
  expect(rows[2].textContent).toMatch(/target N 4,096/);
  click([...rows[2].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Run more'));
  expect(onrunmore).toHaveBeenCalledOnce();
  expect(onrunmore.mock.calls[0][0].key).toBe(richResult().rows[2].key);
});

it('Run more is not offered while another run is busy or on a saved run', () => {
  const ui = mountResults(richResult(), { onrunmore: null, busy: true });
  expect(ui.q('[aria-busy="true"]')).not.toBeNull();
  expect([...ui.qa('button')].some((b) => b.textContent.trim() === 'Run more')).toBe(false);
});

it('a time-to-kill row reads in seconds with the sign of "faster", one axis in ms', () => {
  const ui = mountResults(ttkResult());
  const row = ui.q('[data-testid="result-row"]').textContent;
  expect(row).toMatch(/\+0\.10 s/);
  expect(ui.q('.axis').textContent).toMatch(/Time saved vs current/);
});

it('a provisional row is neutral, says Simulating, and its changes say "not measured"', () => {
  const r = dpsResult();
  const row = r.rows[0];
  row.provisional = true;
  row.vsBaseline = null;
  row.changes.forEach((c) => { c.own = null; c.needed = null; c.keptBecause = null; });
  const ui = mountResults(r, { unmeasured: (x) => x.provisional });
  const first = ui.q('[data-testid="result-row"]');
  expect(first.textContent).toMatch(/Simulating/);
  toggle(ui, 0);
  expect(first.textContent).toMatch(/not measured/);
  expect(first.querySelector('.up, .down')).toBeNull();
});

it('Apply is blocked with its reason when the run is stale, and for provisional rows', () => {
  const onapply = vi.fn();
  const ui = mountResults(dpsResult(), { onapply, applyBlocked: 'The character changed since this run.' });
  toggle(ui, 0);
  const btn = [...ui.qa('button')].find((b) => /^Apply to Main/.test(b.textContent.trim()));
  expect(btn.getAttribute('aria-disabled')).toBe('true');
  expect(btn.title).toMatch(/character changed/);
  click(btn);
  expect(onapply).not.toHaveBeenCalled();
});

it('Apply hands the row to the caller', () => {
  const onapply = vi.fn();
  const ui = mountResults(dpsResult(), { onapply });
  toggle(ui, 0);
  click([...ui.qa('button')].find((b) => /^Apply to Main/.test(b.textContent.trim())));
  expect(onapply).toHaveBeenCalledOnce();
});

it('Show full build lists the describeBuild lines in the inspector', () => {
  const ui = mountResults(dpsResult());
  toggle(ui, 0);
  click([...ui.qa('button')].find((b) => b.textContent.trim() === 'Show full build'));
  expect(ui.q('[data-testid="full-build"]').textContent).toMatch(/Gear set/);
});

it('a PVP row expands to the opponent x seat table with each matchup its own N', () => {
  const ui = mountResults(pvpResult());
  toggle(ui, 0);
  const t = ui.q('[data-testid="matchups"]');
  expect(t.textContent).toMatch(/Tanky/);
  expect(t.textContent).toMatch(/I attack/);
  expect(t.textContent).toMatch(/I defend/);
  expect(ui.q('[data-testid="result-row"]').textContent).toMatch(/\d+\.\d%/);
});

it('a TTK change compared by win rate says so instead of printing a time', () => {
  const r = ttkResult();
  const c = r.rows[0].changes[0];
  c.own = { ...c.own, basis: 'winRate', higherIsBetter: true, delta: 0.2, lo: 0.1, hi: 0.3 };
  const ui = mountResults(r);
  toggle(ui, 0);
  expect(ui.q('[data-testid="winrate-note"]').textContent).toMatch(/win rate/);
});

it('a legacy run renders from its saved entries and says per-change effects were not measured', () => {
  const v = viewRun({ ...legacyRun(), schema: 1 });
  mounted = setup(OptimiserResults, { view: v, presetName: 'Main', unmeasured: () => true });
  const ui = mounted;
  expect(ui.q('[data-testid="baseline-row"]').textContent).toMatch(/NOW/);
  toggle(ui, 0);
  expect(ui.q('[data-testid="result-row"]').textContent).toMatch(/not measured/);
  expect(ui.q('[data-testid="result-row"]').textContent).toMatch(/Relics: None/);
});

// ---- Apply review --------------------------------------------------------------------------------

function mountReview(row, extra = {}) {
  const onconfirm = vi.fn();
  mounted = setup(ApplyReview, { open: true, row, presetName: 'Main', onconfirm, ...extra });
  return { ui: mounted, onconfirm };
}

it('the Apply review lists every write group with the other presets it also changes', () => {
  const row = richResult().rows[0];
  const { ui } = mountReview(row);
  const groups = ui.qa('[data-testid="write-group"]');
  expect(groups).toHaveLength(2);
  expect(groups[0].textContent).toMatch(/Talents \(set 1\)/);
  expect(groups[0].textContent).toMatch(/Boss build/);
  expect(ui.q('[data-testid="side-effect"]').textContent).toMatch(/uses Talent Set 1/);
  expect(ui.q('[data-testid="apply-review"]').textContent).toMatch(/Other presets change too/);
});

it('confirming applies everything by default; switching a group off leaves it out', () => {
  const row = richResult().rows[0];
  const { ui, onconfirm } = mountReview(row);
  const apply = () => [...ui.qa('button')].find((b) => /^Apply \d/.test(b.textContent.trim()));
  expect(apply().textContent.trim()).toBe('Apply 2 groups');
  click(ui.qa('[data-testid="write-group"] input[type="checkbox"]')[0]);
  expect(apply().textContent.trim()).toBe('Apply 1 group');
  expect(ui.q('[data-testid="apply-review"]').textContent).not.toMatch(/Other presets change too/);
  click(apply());
  expect(onconfirm).toHaveBeenCalledOnce();
  const plan = onconfirm.mock.calls[0][0];
  expect(plan.include).toEqual(['preset']);
  expect(plan.cand.talentAllocation).toBeNull();
});

it('with every group off nothing can be applied', () => {
  const { ui } = mountReview(richResult().rows[0]);
  for (const box of ui.qa('[data-testid="write-group"] input[type="checkbox"]')) click(box);
  const apply = [...ui.qa('button')].find((b) => /^Apply \d/.test(b.textContent.trim()));
  expect(apply.getAttribute('aria-disabled')).toBe('true');
});

it('shows what the store refused', () => {
  const { ui } = mountReview(richResult().rows[0], { error: 'Talent points exceed the cap' });
  expect(ui.q('dialog').textContent).toMatch(/Not applied/);
  expect(ui.q('dialog').textContent).toMatch(/Talent points exceed the cap/);
});

// ---- Allowed to change ---------------------------------------------------------------------------

it('Allowed to change toggles by group, resets, and prints the relic cap', () => {
  const state = { space: { ...SPACE_DEFAULTS } };
  mounted = setup(SpaceGroups, {
    get space() { return state.space; },
    set space(v) { state.space = v; },
    relicCap: 4,
  });
  const ui = mounted;
  expect(ui.q('[data-testid="relic-cap"]').textContent).toMatch(/4 relic slots/);
  expect(ui.qa('[data-group]').map((g) => g.dataset.group)).toEqual(['gear', 'talents', 'companions', 'relics', 'sigils', 'transcendence']);
  const sigils = ui.q('[data-group="sigils"]');
  click([...sigils.querySelectorAll('button')].find((b) => b.textContent.trim() === 'none'));
  expect([state.space.sigils, state.space.utility, state.space.ancient, state.space.conditions]).toEqual([false, false, false, false]);
  expect(state.space.relics).toBe(true);
  click([...ui.qa('button')].find((b) => b.textContent.trim() === 'Reset to defaults'));
  expect(state.space).toEqual(SPACE_DEFAULTS);
});

it('counts the blocks that may change', () => {
  mounted = setup(SpaceGroups, { space: { ...SPACE_DEFAULTS, sigils: false, utility: false, ancient: false, conditions: false }, relicCap: 2 });
  expect(mounted.q('.count').textContent).toMatch(/9 of 13 may change/);
});

it('with no open relic slot the relic note says so', () => {
  mounted = setup(SpaceGroups, { space: { ...SPACE_DEFAULTS }, relicCap: 0 });
  expect(mounted.q('[data-testid="relic-cap"]').textContent).toMatch(/No relic slots/);
});

// ---- Compare -------------------------------------------------------------------------------------

it('compares two runs side by side and warns when they asked different questions', () => {
  const a = runFromResult(richResult(), { id: 'a', name: 'First', presetName: 'Main' });
  const b = runFromResult(ttkResult(), { id: 'b', name: 'Second', presetName: 'Main' });
  mounted = setup(RunCompare, { a, b });
  const t = mounted.q('[data-testid="run-compare"]').textContent;
  expect(t).toMatch(/Different questions/);
  expect(t).toMatch(/First/);
  expect(t).toMatch(/Second/);
  expect(t).toMatch(/Best vs current/);
});

it('two runs of the same question compare without the warning', () => {
  const a = runFromResult(richResult(), { id: 'a', name: 'First', presetName: 'Main' });
  const b = runFromResult(dpsResult(), { id: 'b', name: 'Second', presetName: 'Main' });
  mounted = setup(RunCompare, { a, b });
  expect(mounted.q('[data-testid="run-compare"]').textContent).not.toMatch(/Different questions/);
  flushSync();
});

// backlog §6: a talent change shows only the points that moved, everywhere a change is listed.
const movedRow = () => {
  const r = richResult();
  const t = r.rows[0].changes.find((c) => c.dimension === 'talents');
  t.moved = 'Essence Siphon 2 → 0, Focused Casting 0 → 3';
  return { r, t };
};

it('a talent change lists only the moved points in the row, the Apply review and a saved-run compare', () => {
  const { r, t } = movedRow();
  const ui = mountResults(r);
  toggle(ui, 0);
  const body = ui.q('[data-testid="result-row"]').textContent;
  expect(body).toContain('Essence Siphon 2 → 0, Focused Casting 0 → 3');
  expect(body).not.toContain(t.from);
  mounted.done();
  const { ui: review } = mountReview(r.rows[0]);
  expect(review.q('[data-testid="apply-review"]').textContent).toContain('Focused Casting 0 → 3');
  expect(review.q('[data-testid="apply-review"]').textContent).not.toContain(t.from);
  mounted.done();
  const a = runFromResult(r, { id: 'a', name: 'First', presetName: 'Main' });
  mounted = setup(RunCompare, { a, b: runFromResult(dpsResult(), { id: 'b', name: 'Second', presetName: 'Main' }) });
  expect(mounted.q('[data-testid="run-compare"]').textContent).toContain('Essence Siphon 2 → 0');
});

it('a baseline with no value says why instead of "n/a" (backlog §6)', () => {
  const r = ttkResult();
  r.baseline.value = { ...r.baseline.value, est: null, lo: null, hi: null };
  r.baseline.aux = { ...(r.baseline.aux ?? {}), winRate: { est: 0.18, lo: 0.1, hi: 0.28, n: 64 } };
  const ui = mountResults(r);
  const base = ui.q('[data-testid="baseline-row"]').textContent;
  expect(base).toContain('Rarely clears: 18% win rate');
  expect(base).not.toContain('n/a');
});

// A change kept for its interaction leads with its in-context value (Without it) and is never a red
// Downgrade: alone on the current build it may lose, which is why it was kept for the interaction.
it('a change kept for its interaction leads with Without it, says it helps only with the others, and is never red', () => {
  const r = richResult();
  const c = r.rows[0].changes[1];
  c.own = { ...c.own, delta: -800, lo: -1200, hi: -400, pct: -0.0112, verdict: 'worse', significant: true };
  c.needed = { ...c.needed, delta: 600, lo: 100, hi: 1100, pct: 0.008, verdict: 'better', significant: true };
  c.keptBecause = 'interaction';
  const ui = mountResults(r);
  toggle(ui, 0);
  const abl = ui.qa('[data-testid="result-row"]')[0].querySelectorAll('.abl')[1];
  expect(abl.querySelector('.vchip.down')).toBeNull();
  expect(abl.querySelector('.verdict').textContent).toContain('Helps with the other changes');
  expect(abl.querySelector('.delta .v').textContent).toContain('+0.80%');
  expect(abl.querySelector('.delta .v').className).not.toMatch(/down/);
  expect(abl.textContent).toMatch(/Alone on the current build: [−-]1\.12%/);
  expect(abl.textContent).not.toMatch(/Without it: \+/);
});

it('an "Only with" change also shows the helps-with badge', () => {
  const r = richResult();
  const [a, b] = r.rows[0].changes;
  b.own = { ...b.own, delta: 0, lo: 0, hi: 0, pct: 0, verdict: 'equivalent', significant: false };
  b.needed = { ...b.needed, delta: 500, lo: 100, hi: 900, verdict: 'better', significant: true };
  b.keptBecause = 'interaction';
  a.bundle = [...(a.bundle ?? []), b.id];
  const ui = mountResults(r);
  toggle(ui, 0);
  const abl = ui.qa('[data-testid="result-row"]')[0].querySelectorAll('.abl')[1];
  expect(abl.querySelector('.verdict').textContent).toContain('Helps with the other changes');
  expect(abl.textContent).toContain(`Only with: ${a.label}`);
});
