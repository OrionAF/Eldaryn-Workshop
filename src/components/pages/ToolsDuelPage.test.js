import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { applyPrefs } from '../../lib/prefs.svelte.js';
import ToolsDuelPage from './ToolsDuelPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs, jobsStore } from '../../lib/jobs.svelte.js';
import { setup, click, type } from '../ui/testkit.js';
import { loadImportText, confirmImport, resetImportFlow } from '../../lib/importFlow.svelte.js';
import { resetDuelSetup } from '../../lib/duelSetup.svelte.js';
import fightLog from '../../lib/__fixtures__/real/arena-fight-warrior.json';
import SampleDuel from '../duel/SampleDuel.svelte';
import VerifyFightLog from '../duel/VerifyFightLog.svelte';
import { setPrefs as setEstimatePrefs, applyPrefs as resetEstimatePrefs } from '../../lib/prefs.svelte.js';
import { APP_VERSION as ESTIMATE_VERSION } from '../../lib/calibration.js';

let view;
let calls;

/** A fake worker: answers instantly with a canned result so the page logic is what is tested. */
function fakeRun(result) {
  return (request, hooks) => {
    calls.push(request);
    return {
      promise: Promise.resolve().then(() => {
        hooks?.onProgress?.({ done: request.n, n: request.n, phases: [{ id: 'attacker', label: 'I attack', state: 'done', done: request.n, total: request.n }] });
        return typeof result === 'function' ? result(request) : result;
      }),
      cancel() {},
    };
  };
}
const summary = (p, n, extra = {}) => ({ p, lo: Math.max(0, p - 0.05), hi: Math.min(1, p + 0.05), n, meanMs: 30000, p90Ms: 40000, timeoutShare: 0, ...extra });
const trace = [{ timestamp: 1000, type: 'attacker_hit', damage: 500, attackerHpAfter: 1, defenderHpAfter: 1 }];

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  calls = [];
  resetImportFlow();
  resetDuelSetup();
  window.location.hash = '';
  rosterStore.addCharacter('Duelist', 'WARRIOR');
});
afterEach(() => {
  view?.done();
  __resetJobs();
});

const buttonByText = (re) => view.qa('button').find((b) => re.test(b.textContent));
const ready = (sheet = { totalHp: 800, totalAttack: 30, totalAttackSpeed: 1 }) => {
  const id = rosterStore.addOpponent('WARRIOR_TANK', 'Dummy');
  rosterStore.setOpponentSheet(id, sheet);
  return id;
};

it('with no opponent it offers a link to Opponents and cannot run', () => {
  view = setup(ToolsDuelPage);
  expect(view.q('[data-testid="duel-setup"]').textContent).toContain('No saved opponents yet');
  const run = buttonByText(/^Run /);
  expect(run.getAttribute('aria-disabled')).toBe('true');
});

it('a blank-row opponent shows the rows the duel will default and lists the missing required stats', () => {
  ready({ totalHp: 800, totalAttack: 30, totalAttackSpeed: 1 });
  view = setup(ToolsDuelPage);
  const setup_ = view.q('[data-testid="duel-setup"]').textContent;
  expect(setup_).toContain('Blank rows use neutral values');
  expect(setup_).toContain('Crit Chance');
  // Stats used in the fight marks the defaulted cells and shows HP after the x8 buff
  const cells = view.qa('[data-testid="fighters-table"] td[data-defaulted="true"]');
  expect(cells.length).toBeGreaterThan(0);
  expect(view.q('[data-testid="fighters-table"]').textContent).toContain('PVP buff applied');
});

it('an opponent without Attack Speed blocks the run with a fix link', () => {
  ready({ totalHp: 800, totalAttack: 30 });
  view = setup(ToolsDuelPage);
  expect(view.q('[data-testid="duel-setup"]').textContent).toContain('Dummy has no Attack Speed');
  expect(view.q('[data-testid="duel-setup"]').textContent).toContain('Needs: HP, Attack, Attack Speed');
  expect(buttonByText(/^Run /).getAttribute('aria-disabled')).toBe('true');
  expect(buttonByText(/Open Opponents/)).toBeTruthy();
});

it('Both seats: one job, three rows, the Wilson verdict with nNeeded, and Run more extends N', async () => {
  ready();
  __resetJobs({ run: fakeRun((req) => ({ ...summary(0.53, req.n, { trace, traceResult: { attackerWon: true, totalDuration: 30000 } }), swapped: summary(0.51, req.n) })) });
  view = setup(ToolsDuelPage);
  expect(buttonByText(/^Run /).textContent).toContain('1.600 duels'.replace('.', ',')); // 800 per seat, two seats
  click(buttonByText(/^Run /));
  await vi.waitFor(() => expect(view.q('[data-testid="duel-result"]')).not.toBeNull());
  expect(calls[0]).toMatchObject({ mode: 'duel', n: 800, both: true });
  expect(view.qa('[data-testid^="win-row-"]').map((r) => r.dataset.testid)).toEqual(['win-row-total', 'win-row-attack', 'win-row-defend']);
  // the defender row is the complement of the swapped run (their 0.51 as attacker -> my 0.49)
  expect(view.q('[data-testid="win-row-defend"]').textContent).toContain('49.0%');
  expect(view.q('[data-testid="win-ci"]').textContent).toContain('1,600 fights');
  expect(view.q('[data-testid="duel-verdict"]').textContent).toMatch(/Too close to call after 1,600 fights. Around [0-9,]+ fights should show whether a 3-point lead is real/);

  click(buttonByText(/Run more/));
  await vi.waitFor(() => expect(calls.length).toBe(2));
  expect(calls[1].n).toBe(3200);
  await vi.waitFor(() => expect(view.q('[data-testid="win-ci"]').textContent).toContain('6,400 fights'));
});

it('Defender seat puts me in the defender slot and reads the complement', async () => {
  ready();
  __resetJobs({ run: fakeRun((req) => summary(0.2, req.n, { trace, traceResult: { attackerWon: true, totalDuration: 1000 } })) });
  view = setup(ToolsDuelPage);
  click(view.q('button[data-value="defender"]'));
  click(buttonByText(/^Run /));
  await vi.waitFor(() => expect(view.q('[data-testid="duel-result"]')).not.toBeNull());
  expect(calls[0].both).toBe(false);
  expect(calls[0].defender.class).toBe('WARRIOR'); // mine
  expect(view.q('[data-testid="win-rate"]').textContent).toBe('80.0%');
  expect(view.q('[data-testid="duel-verdict"]').textContent).toContain('Likely to win');
});

it('the result survives leaving the page and an edited opponent marks it stale', async () => {
  const oppId = ready();
  __resetJobs({ run: fakeRun((req) => summary(0.7, req.n, { trace, traceResult: { attackerWon: true, totalDuration: 1000 } })) });
  view = setup(ToolsDuelPage);
  click(buttonByText(/^Run /));
  await vi.waitFor(() => expect(view.q('[data-testid="duel-result"]')).not.toBeNull());
  view.done();
  expect(jobsStore.list).toHaveLength(1);
  view = setup(ToolsDuelPage);
  expect(view.q('[data-testid="duel-result"]')).not.toBeNull();
  rosterStore.setOpponentSheet(oppId, { totalHp: 9999, totalAttack: 30, totalAttackSpeed: 1 });
  flushSync();
  expect(view.q('[data-testid="duel-output"]').textContent).toContain('Setup changed since this run');
});

it('Verify: an unrecognised log shows rules as skipped, not passed', () => {
  window.location.hash = '#/tools/duel/verify';
  view = setup(VerifyFightLog, { handoff: { text: '{}', n: 1 } });
  flushSync();
  const rows = view.qa('[data-testid="replay-rules"] tbody tr');
  expect(rows.length).toBeGreaterThan(3);
  expect(rows.filter((r) => /Skipped/.test(r.textContent)).length).toBeGreaterThan(0);
  expect(view.q('[data-testid="replay-skipped"]').textContent).toContain('not counted as passes');
});

it('Verify: a handed-over log that is not JSON is reported without throwing', () => {
  view = setup(VerifyFightLog, { handoff: { text: '{nope', n: 1 } });
  flushSync();
  expect(view.q('[role="alert"]').textContent).toMatch(/could not be read/);
});

it('with game-data import hidden (the default) there is no Verify tab, and its route shows the duel', () => {
  view = setup(ToolsDuelPage, { tab: 'verify' });
  expect([...view.target.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim())).toEqual(['Duel']);
  expect(view.target.querySelector('#duel-panel-verify')).toBeNull();
});

it('Verify: no drop zone or paste box, only a pointer to Settings > Advanced', () => {
  setEstimatePrefs({ showImport: true });
  view = setup(ToolsDuelPage, { tab: 'verify' });
  expect(view.q('#duel-panel-verify input[type="file"]')).toBeNull();
  expect(view.q('#duel-panel-verify textarea')).toBeNull();
  const link = view.q('[data-testid="import-pointer"] a');
  expect(link.getAttribute('href')).toBe('#/settings');
  expect(link.textContent).toContain('Import a fight log in Settings');
  expect(view.q('[data-testid="log-state"]').textContent).toContain('No fight log');
  resetEstimatePrefs();
});

it('a cancelled Both-seats run with one seat shows no verdict and no Both-seats row, only a partial label', async () => {
  ready();
  // the first seat finished, the second never started (summary 0.9 over 50 duels, swapped empty)
  __resetJobs({ run: fakeRun(() => ({ ...summary(0.9, 50, { trace, traceResult: { attackerWon: true, totalDuration: 1000 } }), swapped: null, aborted: true })) });
  view = setup(ToolsDuelPage);
  click(buttonByText(/^Run /));
  await vi.waitFor(() => expect(view.q('[data-testid="win-row-attack"]')).not.toBeNull());
  expect(view.q('[data-testid="win-row-total"]')).toBeNull();
  expect(view.q('[data-testid="duel-verdict"]')).toBeNull();
  expect(view.q('[data-testid="duel-partial"]').textContent).toMatch(/not finished yet/i);
  expect(view.q('[data-testid="win-row-attack"]').textContent).not.toMatch(/Clearly better|Clearly worse/);
});

it('the setup (seat, effort, preset) survives leaving the page and the Run label matches', () => {
  ready();
  view = setup(ToolsDuelPage);
  click(view.q('button[data-value="defender"]'));
  click(view.q('button[data-value="thorough"]'));
  expect(buttonByText(/^Run /).textContent).toContain('3.200'.replace('.', ','));
  view.done();
  view = setup(ToolsDuelPage);
  expect(view.q('button[data-value="defender"]').getAttribute('aria-pressed')).toBe('true');
  expect(view.q('button[data-value="thorough"]').getAttribute('aria-pressed')).toBe('true');
  expect(buttonByText(/^Run /).textContent).toContain('3.200'.replace('.', ','));
});

it('the preference default effort is where the effort starts', () => {
  localStorage.setItem('eldaryn_ui_v1', JSON.stringify({ prefs: { defaultEffort: 'quick' } }));
  applyPrefs();
  try {
    ready();
    view = setup(ToolsDuelPage);
    expect(view.q('button[data-value="quick"]').getAttribute('aria-pressed')).toBe('true');
  } finally {
    localStorage.clear();
    applyPrefs();
  }
});

it('Import dialog handoff: a fight log lands on Verify and is checked at once', () => {
  expect(loadImportText(JSON.stringify(fightLog))).toBe(true);
  expect(confirmImport()).toBe(true);
  view = setup(ToolsDuelPage);
  expect(view.q('#duel-panel-verify')).not.toBeNull();
  expect(view.q('[data-testid="log-state"]').textContent).toContain('loaded');
  expect(view.qa('[data-testid="replay-rules"] tbody tr').length).toBeGreaterThan(3);
});

it('Import dialog handoff: an open Duel page switches to Verify when a fight log arrives', async () => {
  view = setup(ToolsDuelPage);
  expect(view.q('#duel-panel-duel')).not.toBeNull();
  loadImportText(JSON.stringify(fightLog));
  confirmImport();
  flushSync();
  await vi.waitFor(() => expect(view.q('[data-testid="replay-rules"]')).not.toBeNull());
  expect(view.q('#duel-panel-verify')).not.toBeNull();
});

it('the sample duel header keeps the space before the duration ("you lose in 60.0 s")', () => {
  const s = setup(SampleDuel, { trace, traceResult: { attackerWon: false, totalDuration: 60000 }, attackerName: 'A', defenderName: 'B', mineSide: 'attacker', seed: 1, onreroll: () => {} });
  expect(s.target.textContent).toContain('you lose in 60.0 s');
  s.done();
});

it('S2: shows the run-time estimate under Effort, or a link to calibrate', () => {
  resetEstimatePrefs();
  view = setup(ToolsDuelPage);
  expect(view.q('[data-testid="run-estimate"] a').getAttribute('href')).toBe('#/settings');
  view.done();
  view = null;
  setEstimatePrefs({ calibration: { profile: 'balanced', workers: 4, fightsPerSec: { dummy: 100, dungeon: 100, duel: 100 }, measuredAt: Date.now(), version: ESTIMATE_VERSION } });
  view = setup(ToolsDuelPage);
  expect(view.q('[data-testid="run-estimate"]').textContent).toMatch(/on this device \(estimate\)/);
  localStorage.clear();
  resetEstimatePrefs();
});

// ---- All opponents (F35) --------------------------------------------------------------------------

const opponentSelect = () => view.qa('select').find((s) => [...s.options].some((o) => o.value === '__all__'));
const pickOpponent = (value) => {
  const sel = opponentSelect();
  sel.value = value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  return sel;
};
const threeOpponents = () => {
  const weak = rosterStore.addOpponent('WARRIOR_TANK', 'Weakling');
  rosterStore.setOpponentSheet(weak, { totalHp: 800, totalAttack: 30, totalAttackSpeed: 1 });
  const strong = rosterStore.addOpponent('WARRIOR_TANK', 'Brute');
  rosterStore.setOpponentSheet(strong, { totalHp: 900, totalAttack: 40, totalAttackSpeed: 1 });
  const blank = rosterStore.addOpponent('WARRIOR_TANK', 'Blanky');
  rosterStore.setOpponentSheet(blank, { totalHp: 900, totalAttack: 40 });
  return { weak, strong, blank };
};

it('All opponents is offered only with two or more opponents', () => {
  ready();
  view = setup(ToolsDuelPage);
  expect(opponentSelect()).toBeUndefined();
  view.done();
  ready();
  view = setup(ToolsDuelPage);
  expect(opponentSelect().options[0].textContent).toBe('All opponents');
});

it('All opponents: one job per opponent with the same N and seed, a sorted table, skipped rows, and a row opens that duel', async () => {
  const { weak, strong, blank } = threeOpponents();
  // my win rate depends on the opponent: 0.9 against Weakling, 0.2 against Brute
  __resetJobs({ run: fakeRun((req) => summary(req.defender.stats.totalAttack === 30 ? 0.9 : 0.2, req.n, { trace, traceResult: { attackerWon: true, totalDuration: 1000 } })) });
  view = setup(ToolsDuelPage);
  click(view.q('button[data-value="attacker"]'));
  pickOpponent('__all__');
  expect(view.q('[data-testid="duel-output"]').textContent).toContain('No run yet');
  expect(view.q('[data-testid="duel-setup"]').textContent).not.toContain('Blanky has no');
  expect(buttonByText(/^Run /).textContent).toContain('1,600 duels'); // 800 x 2 runnable opponents
  click(buttonByText(/^Run /));
  await vi.waitFor(() => expect(view.q('[data-testid="roster-progress"]').textContent).toContain('2 of 2 duels finished, 1 skipped'));
  expect(calls).toHaveLength(2);
  expect(calls.every((c) => c.n === 800 && c.seed === 1)).toBe(true);
  expect(jobsStore.list.filter((j) => j.tool === 'duel')).toHaveLength(2);
  const rows = view.qa('[data-testid^="roster-row-"]');
  expect(rows.map((r) => r.dataset.testid)).toEqual([`roster-row-${weak}`, `roster-row-${strong}`, `roster-row-${blank}`]);
  expect(rows[0].textContent).toContain('90.0%');
  expect(rows[0].textContent).toContain('85.0% to 95.0%');
  expect(rows[0].textContent).toContain('800');
  expect(rows[0].textContent).toContain('Likely to win');
  expect(rows[1].textContent).toContain('Likely to lose');
  expect(view.q('[data-testid="roster-skipped"]').textContent).toContain('Blanky has no Attack Speed');
  expect(rows[2].querySelector('button')).toBeNull();

  click(rows[1].querySelector('button'));
  expect(opponentSelect().value).toBe(strong);
  expect(view.q('[data-testid="win-rate"]').textContent).toBe('20.0%');
  expect(view.q('[data-testid="duel-output"]').textContent).toContain('vs Brute');
  // back to All opponents finds the same table
  pickOpponent('__all__');
  expect(view.qa('[data-testid^="roster-row-"]')).toHaveLength(3);
});

it('All opponents: cannot run when no opponent has the needed stats, and Cancel all stops every job', async () => {
  const a = rosterStore.addOpponent('WARRIOR_TANK', 'A');
  rosterStore.setOpponentSheet(a, { totalHp: 800, totalAttack: 30 });
  const b = rosterStore.addOpponent('WARRIOR_TANK', 'B');
  rosterStore.setOpponentSheet(b, { totalHp: 800 });
  view = setup(ToolsDuelPage);
  pickOpponent('__all__');
  const run = buttonByText(/^Run /);
  expect(run.getAttribute('aria-disabled')).toBe('true');
  view.done();

  rosterStore.setOpponentSheet(a, { totalHp: 800, totalAttack: 30, totalAttackSpeed: 1 });
  rosterStore.setOpponentSheet(b, { totalHp: 800, totalAttack: 30, totalAttackSpeed: 1 });
  const c = rosterStore.addOpponent('WARRIOR_TANK', 'C');
  rosterStore.setOpponentSheet(c, { totalHp: 800, totalAttack: 30, totalAttackSpeed: 1 });
  const cancels = [];
  __resetJobs({
    run: (request) => {
      calls.push(request);
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      return { promise, cancel: () => { cancels.push(request); resolve({ aborted: true }); } };
    },
  });
  view = setup(ToolsDuelPage);
  pickOpponent('__all__');
  click(buttonByText(/^Run /));
  expect(calls).toHaveLength(2); // at most two run at once; the third waits queued
  expect(view.q('[data-testid="duel-output"]').textContent).toContain('Queued');
  click(buttonByText(/^Cancel all$/));
  await vi.waitFor(() => expect(jobsStore.list.every((j) => j.status === 'cancelled')).toBe(true));
  expect(cancels).toHaveLength(2);
  expect(calls).toHaveLength(2);
  expect(buttonByText(/^Run /)).toBeTruthy();
});
