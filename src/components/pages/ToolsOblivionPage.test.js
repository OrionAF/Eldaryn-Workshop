import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ToolsOblivionPage from './ToolsOblivionPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs, jobsStore } from '../../lib/jobs.svelte.js';

const ROWS = [
  { floor: 1, instability: 10, strain: 0, p: 1, pLo: 0.94, pHi: 1, wins: 64, deaths: 0, timeouts: 0, n: 64, medianMs: 4000, verdict: 'pass' },
  { floor: 2, instability: 20, strain: 5, p: 0.5, pLo: 0.38, pHi: 0.62, wins: 32, deaths: 30, timeouts: 2, n: 64, medianMs: 9000, verdict: 'fail' },
];
let requests;
let target;
let app;

beforeEach(() => {
  localStorage.clear();
  requests = [];
  __resetJobs({
    run: (req) => {
      requests.push(req);
      return { cancel() {}, promise: Promise.resolve({ power: 0, threshold: 0.9, rows: ROWS, maxFloor: 30, scanCapped: true, assumptions: [{ key: 'fight-cap', text: 'Each fight is cut off at 5 minutes' }], aborted: false }) };
    },
  });
  rosterStore.addCharacter('Obl', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
});
afterEach(() => {
  if (app) unmount(app);
  app = null;
  target.remove();
});

const mountPage = () => {
  app = mount(ToolsOblivionPage, { target });
  flushSync();
};

it('locked: inline unlock shows the scan UI', () => {
  mountPage();
  expect(target.textContent).toContain('locked');
  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Unlock Oblivion')).click();
  flushSync();
  expect(rosterStore.current.oblivion.unlocked).toBe(true);
  expect(target.querySelector('[data-testid="power"]')).toBeTruthy();
});

it('scan: runs as a job with Standard N and the output cut off; labels the estimate, cap, wins/deaths/timeouts', async () => {
  rosterStore.setOblivionUnlocked(true);
  mountPage();
  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Simulate floors')).click();
  flushSync();
  expect(requests[0]).toMatchObject({ mode: 'oblivionFloors', n: 64, applyOutputCut: false });
  await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('finished'));
  flushSync();
  const t = target.textContent;
  expect(t).toContain('the server resolves the real fight');
  expect(t).toContain('Sampling range');
  expect(target.querySelector('[data-testid="max-floor"]').textContent).toBe('30+ (scan cap)');
  expect(target.querySelector('tr[data-floor="2"]').textContent).toContain('30');
  expect(t).toContain('Each fight is cut off');
});

it('stale: changing the build greys the result out and drops the highest floor', async () => {
  rosterStore.setOblivionUnlocked(true);
  mountPage();
  [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Simulate floors')).click();
  await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('finished'));
  flushSync();
  expect(target.querySelector('table.stale')).toBeNull();
  rosterStore.setCharacterLevel(50);
  flushSync();
  expect(target.querySelector('table.stale')).toBeTruthy();
  expect(target.querySelector('[data-testid="max-floor"]').textContent).toBe('-');
  expect(target.textContent).toContain('Out of date');
});
