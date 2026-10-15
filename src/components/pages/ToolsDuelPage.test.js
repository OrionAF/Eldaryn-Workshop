import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import ToolsDuelPage from './ToolsDuelPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs, jobsStore } from '../../lib/jobs.svelte.js';
import { setup, click, type } from '../ui/testkit.js';

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
  // Fighters as simulated marks the defaulted cells and shows HP after the x8 buff
  const cells = view.qa('[data-testid="fighters-table"] td[data-defaulted="true"]');
  expect(cells.length).toBeGreaterThan(0);
  expect(view.q('[data-testid="fighters-table"]').textContent).toContain('x8 PVP');
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
  expect(view.q('[data-testid="win-ci"]').textContent).toContain('N=1,600');
  expect(view.q('[data-testid="duel-verdict"]').textContent).toMatch(/Too close to call at N=1,600: about N=[\d,]+ would resolve a 3-pt edge/);

  click(buttonByText(/Run more/));
  await vi.waitFor(() => expect(calls.length).toBe(2));
  expect(calls[1].n).toBe(3200);
  await vi.waitFor(() => expect(view.q('[data-testid="win-ci"]').textContent).toContain('N=6,400'));
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
  expect(view.q('[data-testid="duel-verdict"]').textContent).toContain('Favoured');
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
  view = setup(ToolsDuelPage, { tab: 'verify' });
  const ta = view.q('textarea');
  type(ta, '{}');
  click(buttonByText(/^Check log$/));
  const rows = view.qa('[data-testid="replay-rules"] tbody tr');
  expect(rows.length).toBeGreaterThan(3);
  expect(rows.filter((r) => /Skipped/.test(r.textContent)).length).toBeGreaterThan(0);
  expect(view.q('[data-testid="replay-skipped"]').textContent).toContain('not counted as passes');
});

it('Verify: invalid JSON is reported without throwing', () => {
  view = setup(ToolsDuelPage, { tab: 'verify' });
  type(view.q('textarea'), '{nope');
  click(buttonByText(/^Check log$/));
  expect(view.q('[role="alert"]').textContent).toMatch(/not valid JSON/);
});
