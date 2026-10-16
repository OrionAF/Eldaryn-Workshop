import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import BuildsSheetPage from '../pages/BuildsSheetPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs, jobsStore } from '../../lib/jobs.svelte.js';

const bar = (key, label, delta, lo, hi, rank, o = {}) => ({
  key, label, unit: '+1%', delta, lo, hi, n: 256, measurable: rank != null, rank, ...o,
});
const RESULT = {
  aborted: false,
  calibration: { attack: 12000, p: 0.52, n: 128, tries: 5, inBand: true },
  damage: {
    label: 'Mean DPS over 60 s on the training dummy', n: 256, base: { mean: 50000, lo: 49000, hi: 51000, n: 256 },
    bars: [
      bar('totalAttackSpeed', 'Attack Speed', 4000, 3800, 4200, 1, { pct: 8, pctLo: 7.6, pctHi: 8.4, unit: '+10%' }),
      bar('totalCritChance', 'Crit Chance', 500, 300, 700, 2, { pct: 1, pctLo: 0.6, pctHi: 1.4 }),
      bar('totalSpellDamage', 'Spell Damage', 5, -20, 30, null, { pct: 0.01, pctLo: -0.04, pctHi: 0.06 }),
    ],
  },
  survival: {
    label: 'Chance to survive 60 s against the reference enemy (Attack 12000)', n: 1024, base: { mean: 0.5, lo: 0.47, hi: 0.53, n: 1024 },
    enemy: { attack: 12000 },
    bars: [
      bar('totalHpRegen', 'HP Regen', 0.08, 0.05, 0.11, 1),
      bar('totalBlockChance', 'Block Chance', 0.004, -0.01, 0.02, null),
    ],
  },
};

let requests;
let target;
let app;

beforeEach(() => {
  localStorage.clear();
  requests = [];
  __resetJobs({
    run: (req, { onProgress } = {}) => {
      requests.push(req);
      onProgress?.({ done: 10, total: 100, phases: [] });
      return { cancel() {}, promise: Promise.resolve(RESULT) };
    },
  });
  rosterStore.addCharacter('Weights', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
});
afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

it('the Stat Sheet page runs stat weights as a job for the active preset and renders both charts', async () => {
  app = mount(BuildsSheetPage, { target });
  flushSync();
  target.querySelector('[data-testid="stat-weights-run"]').click();
  flushSync();
  const ch = rosterStore.current;
  expect(requests[0]).toMatchObject({ mode: 'statWeights', presetId: ch.activePresetId, characterId: ch.id, realm: 'base', nDps: 256 });
  expect(requests[0].probes.length).toBeGreaterThan(5);
  await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('finished'));
  flushSync();

  const damage = target.querySelector('[data-chart="damage"]');
  const survival = target.querySelector('[data-chart="survival"]');
  expect(damage).not.toBeNull();
  expect(survival).not.toBeNull();
  expect(target.querySelector('[data-testid="chart-label-damage"]').textContent).toContain('training dummy');
  expect(target.querySelector('[data-testid="chart-label-survival"]').textContent).toContain('reference enemy');

  // largest first, ranked; an interval spanning 0 reads "No clear effect" and has no rank
  const rows = [...damage.querySelectorAll('[data-stat]')];
  expect(rows.map((r) => r.dataset.stat)).toEqual(['totalAttackSpeed', 'totalCritChance', 'totalSpellDamage']);
  expect(rows[0].querySelector('[data-testid="rank"]').textContent.trim()).toBe('#1');
  expect(rows[2].querySelector('[data-testid="rank"]').textContent.trim()).toBe('No clear effect');
  expect(rows[2].textContent).not.toContain('#');
  const block = survival.querySelector('[data-stat="totalBlockChance"]');
  expect(block.querySelector('[data-testid="rank"]').textContent.trim()).toBe('No clear effect');
  expect(survival.querySelector('[data-stat="totalHpRegen"]').textContent).toContain('+8.0 pts');
  // each chart has one labelled axis and every row an interval mark
  expect(damage.querySelectorAll('.axis').length).toBe(1);
  expect(survival.querySelectorAll('.axis').length).toBe(1);
  expect(damage.querySelectorAll('.forest .bar').length).toBe(3);
});

it('shows progress while running; Cancel keeps the finished chart and offers Resume', async () => {
  let resolve;
  __resetJobs({
    run: (req, { onProgress } = {}) => {
      onProgress?.({ done: 25, total: 100, phases: [] });
      return {
        cancel() { resolve({ ...RESULT, survival: null, aborted: true }); },
        promise: new Promise((r) => { resolve = r; }),
      };
    },
  });
  app = mount(BuildsSheetPage, { target });
  flushSync();
  target.querySelector('[data-testid="stat-weights-run"]').click();
  flushSync();
  expect(target.querySelector('[data-testid="stat-weights-progress"]').textContent).toContain('25%');
  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel').click();
  await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('cancelled'));
  flushSync();
  expect(target.textContent).toContain('Showing the stats finished so far');
  expect(target.querySelector('[data-chart="damage"]')).not.toBeNull();
  expect(target.querySelector('[data-chart="survival"]')).toBeNull();
  expect([...target.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Resume')).toBe(true);
});
