// The Optimiser run's Debug log section (simulation.md §Debug log): the per-phase and per-block table, the
// slowest builds, the JSONL download, and the job store keeping the full log beside a light result.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { setup, click } from '../ui/testkit.js';
import DebugLog from './DebugLog.svelte';
import { createDebugLog } from '../../lib/search/debugLog.js';
import { __resetJobs, startJob, jobsStore, jobDebugLog } from '../../lib/jobs.svelte.js';

function sampleLog() {
  const log = createDebugLog('fights');
  let ctx = { phase: 'search', block: 'sigils', pass: 2, rung: null };
  log.useContext(() => ctx);
  log.enterPhase('search');
  const a = log.entry('search', 'ek-a');
  const b = log.entry('search', 'ek-b');
  log.drew(a, { main: [[1, 1, 0]], trace: { cpu: [[4, 4, 4]], ms: [[900, 800, 700]] } }, 0, 0);
  log.drew(b, { main: [[0]], trace: { cpu: [[2]], ms: [[100]] } }, 0, 0);
  log.build({ step: 'race', stage: 'search', key: 'A', entry: a, changes: ['Sigils: Fox, Owl'], looks: 1, n: 3, decision: 'kept', basis: 'leader' });
  log.build({ step: 'race', stage: 'search', key: 'B', entry: b, changes: [], looks: 1, n: 1, decision: 'dropped', basis: 'worse than the leader' });
  ctx = { phase: 'confirm', block: null, pass: null, rung: null };
  log.enterPhase('confirm');
  return log.finish({ run: 'optimise', seed: 7 });
}

let ui;
afterEach(() => {
  ui?.done();
  ui = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DebugLog', () => {
  it('shows fights, compute and share per phase and per block, the slowest builds, and downloads the JSONL', async () => {
    const full = sampleLog();
    const { builds, fights, ...light } = full;
    const blobs = [];
    // jsdom has no object URLs: stand in for them for this test
    vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL: (b) => { blobs.push(b); return 'blob:x'; }, revokeObjectURL: () => {} }));
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    ui = setup(DebugLog, { debug: light, getLog: () => full, fileName: 'optimiser-log-x.jsonl' });
    const rows = (id) => ui.qa(`[data-testid="${id}"] tbody tr`).map((tr) => [...tr.children].map((c) => c.textContent.trim()));
    expect(rows('debug-phases')[0]).toEqual(['Search', '2', '4', '14 ms', expect.any(String), '100.0%']);
    expect(rows('debug-blocks')).toEqual([['sigils', '2', '4', '14 ms', expect.any(String), '100.0%']]);
    expect(rows('debug-slowest').map((r) => r[1])).toEqual(['Sigils: Fox, Owl', 'Current build']);
    expect(rows('debug-slowest')[0][0]).toBe('Search · sigils · pass 2');
    expect(ui.q('[data-testid="debug-log"]').textContent).toMatch(/Builds and fights: 2 builds, 4 fights/);
    click(ui.q('[data-testid="debug-download"]'));
    expect(clicked).toHaveBeenCalledTimes(1);
    const text = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(blobs[0]); });
    const lines = text.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(['header', 'build', 'build', 'fight', 'fight', 'fight', 'fight']);
    expect(lines[0]).toMatchObject({ seed: 7, level: 'fights' });
  });

  it('a saved run shows its summary without a download', () => {
    const { summary } = sampleLog();
    ui = setup(DebugLog, { debug: summary });
    expect(ui.qa('[data-testid="debug-phases"] tbody tr')).toHaveLength(2);
    expect(ui.target.querySelector('[data-testid="debug-download"]')).toBeNull();
    expect(ui.target.textContent).toMatch(/kept only until you close the app/);
  });
});

describe('a job with a debug log', () => {
  it('keeps the full log beside the job and only the summary on its reactive result', async () => {
    const full = sampleLog();
    let resolve;
    __resetJobs({ run: () => ({ promise: new Promise((r) => (resolve = r)), cancel: () => {} }) });
    const id = startJob({ tool: 'optimiser', title: 't', request: { mode: 'optimize' } });
    resolve({ schema: 'optimiser-result/2', status: 'done', aborted: false, debug: full });
    await new Promise((r) => setTimeout(r, 0));
    const job = jobsStore.list.find((j) => j.id === id);
    expect(job.status).toBe('finished');
    expect(job.result.debug.summary.totals.fights).toBe(4);
    expect(job.result.debug.builds).toBeUndefined();
    expect(job.result.debug.fights).toBeUndefined();
    expect(jobDebugLog(id).fights.rows).toBe(4);
    __resetJobs();
    expect(jobDebugLog(id)).toBeNull();
  });
});
