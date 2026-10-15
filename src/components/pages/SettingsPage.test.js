// S2: the Performance section of Settings (CPU thermal profile, speed calibration) and the run-time estimate line.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import { setup, click } from '../ui/testkit.js';
import SettingsPage from './SettingsPage.svelte';
import RunEstimate from '../ui/RunEstimate.svelte';
import JobsTray from '../shell/JobsTray.svelte';
import { __resetJobs, jobsStore, startJob } from '../../lib/jobs.svelte.js';
import { applyPrefs, prefs, setPrefs } from '../../lib/prefs.svelte.js';
import { loadUi } from '../../lib/uiState.js';
import { requestImportFocus } from '../../lib/importFlow.svelte.js';
import { APP_VERSION } from '../../lib/calibration.js';

let ui;
let requests;
let finish;

const RESULT = { fightsPerSec: { dummy: 500, dungeon: 250 }, workers: 4, elapsedMs: 6000, aborted: false };

beforeEach(() => {
  localStorage.clear();
  applyPrefs();
  requests = [];
  vi.stubGlobal('navigator', { ...globalThis.navigator, hardwareConcurrency: 8 });
  __resetJobs({
    run: (req) => {
      requests.push(req);
      let resolve;
      const promise = new Promise((r) => (resolve = r));
      finish = (result = RESULT) => resolve(result);
      return { promise, cancel: () => resolve({ ...RESULT, fightsPerSec: {}, aborted: true }) };
    },
  });
});
afterEach(() => {
  ui?.done();
  ui = null;
  vi.unstubAllGlobals();
});

const text = () => ui.target.textContent.replace(/\s+/g, ' ');
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Debug: log the search', () => {
  it('offers Off / Builds / Builds and fights, warns at the fights level, and remembers the choice on this device', () => {
    ui = setup(SettingsPage);
    const group = ui.q('[aria-label="Debug: log the search"]');
    expect([...group.querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(['Off', 'Builds', 'Builds and fights']);
    expect(prefs.debugLog).toBe('off');
    expect(ui.target.querySelector('[data-testid="debug-log-warn"]')).toBeNull();
    click(ui.q('[aria-label="Debug: log the search"] [data-value="fights"]'));
    expect(prefs.debugLog).toBe('fights');
    expect(loadUi().prefs.debugLog).toBe('fights');
    expect(ui.q('[data-testid="debug-log-warn"]').textContent).toMatch(/slows runs.*tens of MB/);
    click(ui.q('[aria-label="Debug: log the search"] [data-value="off"]'));
    expect(loadUi().prefs.debugLog).toBe('off');
  });
});

describe('Performance section', () => {
  it('offers Eco / Balanced / Max with the worker count each means on this device', () => {
    ui = setup(SettingsPage);
    const group = ui.q('[aria-label="CPU thermal profile"]');
    expect([...group.querySelectorAll('button')].map((b) => b.textContent.trim())).toEqual(['Eco', 'Balanced', 'Max']);
    const lines = [...ui.target.querySelectorAll('[data-testid="profile-lines"] li')].map((li) => li.textContent);
    expect(lines).toEqual([
      'Eco: 2 of 8 cores. Battery and laptops on your lap.',
      'Balanced (default): 4 of 8 cores. Fast without heating the device.',
      'Max: 7 of 8 cores. Every core but one; may run hot.',
    ]);
    expect(text()).toContain('applies to the next job');
  });

  it('choosing a profile stores it for the next job', () => {
    ui = setup(SettingsPage);
    click(ui.q('[aria-label="CPU thermal profile"] [data-value="max"]'));
    flushSync();
    expect(prefs.cpuProfile).toBe('max');
    expect(loadUi().prefs.cpuProfile).toBe('max');
  });

  it('never calibrates by itself', () => {
    ui = setup(SettingsPage);
    expect(requests).toHaveLength(0);
    expect(jobsStore.list).toHaveLength(0);
    expect(text()).toContain('Not calibrated');
  });

  it('Calibrate speed runs a cancellable job with the current profile and stores the result', async () => {
    ui = setup(SettingsPage);
    const btn = () => [...ui.target.querySelectorAll('button')].find((b) => /Calibrate speed|Recalibrate|Calibrating/.test(b.textContent));
    click(btn());
    flushSync();
    expect(requests).toHaveLength(1);
    expect(requests[0].mode).toBe('calibrate');
    expect(requests[0].workers).toBe(4);
    expect(jobsStore.list[0].tool).toBe('calibrate');
    expect(jobsStore.list[0].workers).toBe(4);
    expect([...ui.target.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Cancel')).toBe(true);

    finish();
    await flush();
    flushSync();
    expect(loadUi().prefs.calibration).toEqual({ profile: 'balanced', workers: 4, fightsPerSec: { dummy: 500, dungeon: 250 }, measuredAt: expect.any(Number), version: APP_VERSION });
    const last = ui.q('[data-testid="calibration-last"]').textContent.replace(/\s+/g, ' ');
    expect(last).toContain('balanced profile with 4 workers');
    expect(last).toContain('Training dummy 500 fights/s');
    expect(ui.q('[data-testid="calibration-stale"]')).toBeNull();
    expect(btn().textContent.trim()).toBe('Recalibrate');
  });

  it('a cancelled calibration stores nothing', async () => {
    ui = setup(SettingsPage);
    click([...ui.target.querySelectorAll('button')].find((b) => /Calibrate speed/.test(b.textContent)));
    flushSync();
    click([...ui.target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel'));
    await flush();
    flushSync();
    expect(loadUi().prefs.calibration).toBeNull();
    expect(jobsStore.list[0].status).toBe('cancelled');
  });

  it('marks the calibration stale when the profile or the app version changed', () => {
    const cal = { profile: 'balanced', workers: 4, fightsPerSec: { dummy: 500, dungeon: 250 }, measuredAt: Date.now(), version: APP_VERSION };
    setPrefs({ calibration: cal });
    ui = setup(SettingsPage);
    expect(ui.q('[data-testid="calibration-stale"]')).toBeNull();
    setPrefs({ cpuProfile: 'eco' });
    flushSync();
    expect(ui.q('[data-testid="calibration-stale"]').textContent).toContain('another CPU profile');
    setPrefs({ cpuProfile: 'balanced', calibration: { ...cal, version: '0.0.0+old' } });
    flushSync();
    expect(ui.q('[data-testid="calibration-stale"]').textContent).toContain('older version');
  });
});

describe('run-time estimate', () => {
  it('without a calibration it links to Settings', () => {
    ui = setup(RunEstimate, { fights: { dummy: 1000 } });
    const a = ui.q('[data-testid="run-estimate"] a');
    expect(a.getAttribute('href')).toBe('#/settings');
    expect(ui.target.textContent).toContain('Calibrate speed to see run-time estimates');
  });

  it('with one it reads About N min on this device, as an estimate', () => {
    setPrefs({ calibration: { profile: 'balanced', workers: 4, fightsPerSec: { dummy: 100, dungeon: 100 }, measuredAt: Date.now(), version: APP_VERSION } });
    ui = setup(RunEstimate, { fights: { dummy: 100 * 60 * 5 } });
    expect(ui.q('[data-testid="run-estimate"]').textContent).toBe('About 5 min on this device (estimate).');
  });

  it('an upper bound says so, and an old measurement is flagged', () => {
    setPrefs({ cpuProfile: 'max', calibration: { profile: 'balanced', workers: 4, fightsPerSec: { dummy: 100, dungeon: 100 }, measuredAt: Date.now(), version: APP_VERSION } });
    ui = setup(RunEstimate, { fights: { dummy: 100 * 60 * 5 }, bound: 'upper' });
    const t = ui.q('[data-testid="run-estimate"]').textContent;
    expect(t).toContain('Up to about 5 min on this device (estimate).');
    expect(t).toContain('another CPU profile');
  });
});

describe('Jobs tray', () => {
  it('shows the worker count of a running job', () => {
    startJob({ tool: 'optimize', title: 'Optimiser', request: { mode: 'optimize', workers: 3 } });
    ui = setup(JobsTray);
    expect(ui.q('[data-testid="job-workers"]').textContent).toBe('3 workers');
  });

  it('a job without an explicit size gets the pool size of the profile at start', () => {
    setPrefs({ cpuProfile: 'eco' });
    startJob({ tool: 'optimize', title: 'Optimiser', request: { mode: 'optimize' } });
    ui = setup(JobsTray);
    expect(ui.q('[data-testid="job-workers"]').textContent).toBe('2 workers');
    expect(requests[0].workers).toBe(2);
  });
});

describe('Import section', () => {
  it('holds the disclaimer, the drop zone, paste and the file picker; no separate Import button remains', () => {
    ui = setup(SettingsPage);
    const section = ui.target.querySelector('[data-testid="import-section"]');
    expect(section.querySelector('h3').textContent).toBe('Import');
    const note = section.querySelector('[data-testid="import-disclaimer"]').textContent.replace(/\s+/g, ' ');
    expect(note).toContain('HTTP Catcher');
    expect(note).toContain('HTTP Toolkit');
    expect(note).toContain('Android usually needs root');
    expect(note).toContain('Backups exported from this app always import normally');
    expect(section.querySelector('input[type="file"]')).not.toBeNull();
    expect(section.querySelector('textarea')).not.toBeNull();
    expect([...ui.target.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Import a file')).toBe(false);
  });

  it('a pointer link focuses the Import heading', async () => {
    ui = setup(SettingsPage);
    const h = ui.target.querySelector('#settings-import-h');
    requestImportFocus();
    flushSync();
    await Promise.resolve();
    expect(document.activeElement).toBe(h);
  });

  it('a pointer request made before Settings mounts still focuses the heading', async () => {
    requestImportFocus();
    ui = setup(SettingsPage);
    flushSync();
    await Promise.resolve();
    expect(document.activeElement).toBe(ui.target.querySelector('#settings-import-h'));
  });
});
