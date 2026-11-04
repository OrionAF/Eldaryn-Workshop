import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ToolsOblivionPage from './ToolsOblivionPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs, jobsStore } from '../../lib/jobs.svelte.js';
import { notifications } from '../../lib/notify.svelte.js';
import { setPrefs as setEstimatePrefs, applyPrefs as resetEstimatePrefs } from '../../lib/prefs.svelte.js';
import { resetOblivionSetup, setOblivionSetup, getOblivionSetup } from '../../lib/oblivionSetup.svelte.js';
import { APP_VERSION as ESTIMATE_VERSION } from '../../lib/calibration.js';

const ROWS = [
  { floor: 1, instability: 10, strain: 0, p: 1, pLo: 0.94, pHi: 1, wins: 64, deaths: 0, timeouts: 0, n: 64, medianMs: 4000, verdict: 'pass' },
  { floor: 2, instability: 20, strain: 5, p: 0.5, pLo: 0.38, pHi: 0.62, wins: 32, deaths: 30, timeouts: 2, n: 64, medianMs: 9000, verdict: 'fail' },
];
let requests;
let target;
let app;

beforeEach(() => {
  localStorage.clear();
  resetOblivionSetup();
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
  expect(t).toContain('the game server decides the real fight');
  expect(t).toContain('Likely range');
  expect(target.querySelector('[data-testid="max-floor"]').textContent).toBe('30+ (scan limit)');
  expect(target.querySelector('tr[data-floor="2"]').textContent).toContain('30');
  expect(t).toContain('Each fight is cut off');
  // the wide floors table scrolls inside its own focusable region, never the page
  const region = target.querySelector('[role="region"][aria-label="Floors table"]');
  expect(region.getAttribute('tabindex')).toBe('0');
  expect(region.querySelector('table.floors')).not.toBeNull();
  // the "started" note went with the job
  expect(notifications.toasts.map((x) => x.message)).not.toContain('Floor run started');
});

it('the three scan steppers carry visible labels, not only aria-labels', () => {
  rosterStore.setOblivionUnlocked(true);
  mountPage();
  const fields = [...target.querySelectorAll('.setup .field')];
  expect(fields.map((f) => f.querySelector('.micro-label').textContent.trim())).toEqual(['From floor', 'To floor', 'Win chance needed %']);
  for (const f of fields) expect(f.querySelector('[role="group"]').getAttribute('aria-label')).toBe(f.querySelector('.micro-label').textContent.trim());
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

const press = (re) => [...target.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));

it('cancel keeps the floors finished so far and Resume runs the scan again to the end', async () => {
  rosterStore.setOblivionUnlocked(true);
  const done = { power: 0, threshold: 0.9, rows: ROWS, maxFloor: 30, scanCapped: false, assumptions: [] };
  __resetJobs({
    run: (req) => {
      requests.push(req);
      if (requests.length > 1) return { cancel() {}, promise: Promise.resolve({ ...done, aborted: false }) };
      let finish;
      const promise = new Promise((r) => (finish = r));
      return { promise, cancel() { finish({ ...done, rows: [ROWS[0]], maxFloor: 1, aborted: true }); } };
    },
  });
  mountPage();
  press(/Simulate floors/).click();
  flushSync();
  press(/^Cancel$/).click();
  await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('cancelled'));
  flushSync();
  expect(target.textContent).toContain('Showing the floors finished so far');
  expect(target.querySelector('tr[data-floor="1"]').textContent).toContain('64');
  expect(target.querySelector('tr[data-floor="2"]').textContent).not.toContain('30');
  press(/^Resume$/).click();
  flushSync();
  await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('finished'));
  flushSync();
  expect(requests).toHaveLength(2);
  expect(target.querySelector('tr[data-floor="2"]').textContent).toContain('30');
  expect(target.textContent).not.toContain('Showing the floors finished so far');
});

it('stale: changing the scan setup (not only the build) marks the finished scan out of date', async () => {
  rosterStore.setOblivionUnlocked(true);
  mountPage();
  press(/Simulate floors/).click();
  await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('finished'));
  flushSync();
  expect(target.textContent).not.toContain('Out of date');
  target.querySelector('button[aria-label="Increase From floor"]').click();
  flushSync();
  expect(target.querySelector('table.stale')).toBeTruthy();
  expect(target.textContent).toContain('Out of date');
});

it('S2: the scan setup shows an upper-bound run-time estimate, or a link to calibrate', () => {
  resetEstimatePrefs();
  rosterStore.setOblivionUnlocked(true);
  mountPage();
  expect(target.querySelector('[data-testid="run-estimate"] a').getAttribute('href')).toBe('#/settings');
  setEstimatePrefs({ calibration: { profile: 'balanced', workers: 4, fightsPerSec: { dummy: 100, dungeon: 100, duel: 100 }, measuredAt: Date.now(), version: ESTIMATE_VERSION } });
  flushSync();
  expect(target.querySelector('[data-testid="run-estimate"]').textContent).toMatch(/Up to .* on this device \(estimate\)/);
  localStorage.clear();
  resetEstimatePrefs();
});

it('F28: the scan setup is kept when the page is left and reopened', () => {
  rosterStore.setOblivionUnlocked(true);
  mountPage();
  target.querySelector('button[aria-label="Increase From floor"]').click();
  target.querySelector('button[aria-label="Increase To floor"]').click();
  flushSync();
  unmount(app);
  mountPage();
  expect(press(/Simulate floors/).textContent).toContain('2-31');
});

it('F28: a finished scan marks the highest floor won and Scan from here narrows the range', async () => {
  rosterStore.setOblivionUnlocked(true);
  const rows = Array.from({ length: 30 }, (_, i) => ({ ...ROWS[0], floor: i + 1, verdict: i < 12 ? 'pass' : 'fail' }));
  __resetJobs({ run: () => ({ cancel() {}, promise: Promise.resolve({ power: 0, threshold: 0.9, rows, maxFloor: 12, scanCapped: false, assumptions: [], aborted: false }) }) });
  mountPage();
  expect(press(/Scan from here/)).toBeUndefined();
  press(/Simulate floors/).click();
  await vi.waitFor(() => expect(jobsStore.list[0].status).toBe('finished'));
  flushSync();
  expect(target.querySelectorAll('tr.frontier')).toHaveLength(1);
  expect(target.querySelector('tr.frontier').dataset.floor).toBe('12');
  expect(target.querySelector('tr.frontier').textContent).toContain('highest floor won');
  press(/Scan from here/).click();
  flushSync();
  expect(press(/Simulate floors/).textContent).toContain('10-20');
  // the setup changed, so the old result is out of date and the button goes away
  expect(press(/Scan from here/)).toBeUndefined();
  expect(target.querySelector('tr.frontier')).toBeNull();
});

it('F28: a kept setup that is out of range or garbage is clamped on load', () => {
  rosterStore.setOblivionUnlocked(true);
  setOblivionSetup(rosterStore.current.id, { from: 99, to: 0, threshold: 10, effort: 'bogus', applyOutputCut: 'yes' });
  mountPage();
  // to clamps to 1, from to at most to
  expect(press(/Simulate floors/).textContent).toContain('1-1');
  expect(target.textContent).toContain('Highest floor won 50%+');
  expect(target.querySelector('[aria-label="Effort"] button[aria-pressed="true"]').textContent).toContain('Standard');
});

it('F28: switching character while mounted loads the new setup and keeps the old one', () => {
  rosterStore.setOblivionUnlocked(true);
  const firstId = rosterStore.current.id;
  mountPage();
  target.querySelector('button[aria-label="Increase To floor"]').click();
  flushSync();
  expect(press(/Simulate floors/).textContent).toContain('1-31');
  rosterStore.addCharacter('Two', 'MAGE');
  rosterStore.setOblivionUnlocked(true);
  flushSync();
  expect(rosterStore.current.id).not.toBe(firstId);
  expect(press(/Simulate floors/).textContent).toContain('1-30');
  expect(getOblivionSetup(firstId).to).toBe(31);
});

it('F28: edits made after a character switch are saved to the new character', () => {
  // Both characters are set up before mounting, so the switch is a bare selectCharacter
  // with no later mutation of the current character to re-run the persisting effect.
  rosterStore.setOblivionUnlocked(true);
  const firstId = rosterStore.current.id;
  rosterStore.addCharacter('Two', 'MAGE');
  rosterStore.setOblivionUnlocked(true);
  const secondId = rosterStore.current.id;
  rosterStore.selectCharacter(firstId);
  mountPage();
  rosterStore.selectCharacter(secondId);
  flushSync();
  expect(rosterStore.current.id).toBe(secondId);
  target.querySelector('button[aria-label="Increase From floor"]').click();
  flushSync();
  expect(getOblivionSetup(secondId).from).toBe(2);
  target.querySelector('button[aria-label="Increase To floor"]').click();
  flushSync();
  expect(getOblivionSetup(secondId).to).toBe(31);
  expect(getOblivionSetup(firstId).from).toBe(1);
});
