/**
 * jobs.svelte.js - the session job store (redesign plan U3, ia.md G4, design-system §4.18).
 *
 * A job wraps one long simulation (optimiser, duel, Drop Check, batch, Oblivion scan). It lives in
 * module state, not in a page, so it survives navigation; a reload ends running jobs. Not persisted,
 * except an opt-in IndexedDB copy of cancelled jobs' checkpoints so a reload can offer Resume.
 *
 * Status: queued -> running -> finished | failed | cancelled (| skipped, set by the caller for a
 * job that was not run, with a reason). At most MAX_RUNNING jobs run; the rest wait queued.
 *
 * Cancel is soft (plan A.10): the task posts its checkpoint, then resolves `aborted: true`; the job
 * becomes `cancelled`, keeps the checkpoint and the best-so-far result, and can be resumed: the same
 * request is re-run with `request.resumeFrom = checkpoint`, which the task guarantees equals an
 * uninterrupted run. Retry (failed) re-runs from scratch.
 *
 * Staleness: `signature` = characterKey + preset + inputs, taken when the job starts. The caller
 * may pass `currentSignature()` (reading reactive state); `isStale(job)` is true once it differs,
 * so a result computed for an edited preset is marked, never silently shown as current.
 */
import { runOptimizerTask, jobWorkers } from './optimizerClient.js';
import { go } from './router.svelte.js';
import { notify, dismissKey } from './notify.svelte.js';
import { createCheckpointDb, readFlag, writeFlag } from './jobCheckpoints.js';

export const MAX_RUNNING = 2;

/** Staleness signature: one string out of the three parts the plan names. */
export function jobSignature({ characterKey = '', presetId = '', inputs = '' } = {}) {
  return JSON.stringify([characterKey, presetId, inputs]);
}

let seq = 1;
let jobs = $state([]);
let persistCheckpoints = $state(readFlag());
let runner = runOptimizerTask;
let db = createCheckpointDb();
const handles = new Map(); // id -> {cancel}
// id -> an Optimiser run's full debug log (simulation.md §Debug log). Kept out of the reactive job, whose
// result keeps only the log's summary: up to millions of rows must not be proxied or persisted.
const debugLogs = new Map();

const find = (id) => jobs.find((j) => j.id === id);
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

function pump() {
  let running = jobs.filter((j) => j.status === 'running').length;
  for (const job of jobs) {
    if (running >= MAX_RUNNING) break;
    if (job.status === 'queued') {
      launch(job.id);
      running++;
    }
  }
}

function launch(id) {
  const job = find(id);
  job.status = 'running';
  job.startedAt = Date.now();
  job.endedAt = null;
  job.error = null;
  job.progress = null;
  job.cancelRequested = false;
  // The pool size is fixed when the job starts (a changed CPU profile applies to the next job) and shown in the tray.
  job.workers = Number.isInteger(job.request.workers) && job.request.workers >= 1 ? job.request.workers : jobWorkers();
  const request = { ...job.request, workers: job.workers, ...(job.resumeFrom ? { resumeFrom: job.resumeFrom } : {}) };
  let handle;
  try {
    handle = runner(request, {
      onProgress: (p) => {
        const j = find(id);
        if (j) j.progress = p;
      },
      onCheckpoint: (cp) => {
        const j = find(id);
        if (j) j.checkpoint = plain(cp);
      },
    });
  } catch (err) {
    settle(id, 'failed', { error: err });
    return;
  }
  handles.set(id, handle);
  handle.promise.then(
    (result) => settle(id, find(id)?.cancelRequested || result?.aborted ? 'cancelled' : 'finished', { result }),
    (error) => settle(id, 'failed', { error }),
  );
}

function settle(id, status, { result, error } = {}) {
  handles.delete(id);
  const job = find(id);
  if (!job || job.status !== 'running') return;
  dismissKey(id);
  job.status = status;
  job.endedAt = Date.now();
  if (result?.debug) {
    const { builds, fights, ...light } = result.debug;
    debugLogs.set(id, result.debug);
    result = { ...result, debug: light };
  }
  if (result !== undefined) job.result = result;
  if (error) job.error = error instanceof Error ? error.message : String(error);
  if (status === 'finished') {
    job.checkpoint = null;
    job.resumeFrom = null;
    try {
      job.onFinish?.(job);
    } catch {
      // a failing hook must not unsettle the job
    }
  }
  if (status === 'cancelled' && persistCheckpoints && job.checkpoint) saveCheckpoint(job);
  else void db.remove(id);
  pump();
}

function saveCheckpoint(job) {
  void db.put({
    id: job.id,
    tool: job.tool,
    title: job.title,
    context: job.context,
    request: job.request,
    signature: job.signature,
    openRoute: job.openRoute,
    checkpoint: job.checkpoint,
    at: job.endedAt,
  });
}

/**
 * @param {{ tool: string, title: string, context?: string, request: object, signature?: string,
 *   currentSignature?: () => string, openRoute?: string, notice?: string,
 *   summarize?: (result) => Array<{tone?: string, text: string}>, onFinish?: (job) => void }} spec
 * `onFinish` runs once when the job finishes (not when it is cancelled or fails).
 * @returns {string} the job id
 */
export function startJob(spec) {
  const job = {
    id: `job-${seq++}`,
    tool: spec.tool,
    title: spec.title,
    context: spec.context ?? '',
    request: plain(spec.request),
    signature: spec.signature ?? null,
    currentSignature: spec.currentSignature ?? null,
    openRoute: spec.openRoute ?? null,
    summarize: spec.summarize ?? null,
    onFinish: spec.onFinish ?? null,
    workers: null,
    status: 'queued',
    progress: null,
    result: null,
    error: null,
    checkpoint: null,
    resumeFrom: null,
    cancelRequested: false,
    interrupted: false,
    queuedAt: Date.now(),
    startedAt: null,
    endedAt: null,
  };
  jobs.push(job);
  // The "started" note belongs to the job: it goes when the job settles.
  if (spec.notice) notify(spec.notice, { kind: 'info', key: job.id });
  pump();
  return job.id;
}

/** Soft cancel. A queued job is cancelled at once (nothing to checkpoint). */
export function cancelJob(id) {
  const job = find(id);
  if (!job) return;
  if (job.status === 'queued') {
    job.status = 'cancelled';
    job.endedAt = Date.now();
  } else if (job.status === 'running' && !job.cancelRequested) {
    job.cancelRequested = true;
    handles.get(id)?.cancel();
  }
}

/** Resume a cancelled job from its checkpoint (or from scratch when it has none). */
export function resumeJob(id) {
  const job = find(id);
  if (!job || job.status !== 'cancelled') return;
  job.resumeFrom = job.checkpoint ? plain(job.checkpoint) : null;
  job.interrupted = false;
  job.status = 'queued';
  pump();
}

/** Re-run a failed job from scratch. */
export function retryJob(id) {
  const job = find(id);
  if (!job || job.status !== 'failed') return;
  job.resumeFrom = null;
  job.checkpoint = null;
  job.status = 'queued';
  pump();
}

export function dismissJob(id) {
  const job = find(id);
  if (!job || job.status === 'running') return;
  jobs = jobs.filter((j) => j.id !== id);
  debugLogs.delete(id);
  void db.remove(id);
}

/** A job's full debug log (header, summary, build and fight rows), or null when its run kept none. */
export const jobDebugLog = (id) => debugLogs.get(id) ?? null;

export function clearFinished() {
  for (const j of jobs.filter((x) => x.status !== 'running' && x.status !== 'queued')) {
    void db.remove(j.id);
    debugLogs.delete(j.id);
  }
  jobs = jobs.filter((j) => j.status === 'running' || j.status === 'queued');
}

/** Navigate to the page that shows the job's result. */
export function openResult(id) {
  const job = find(id);
  if (job?.openRoute) go(job.openRoute);
}

export function isStale(job) {
  if (!job.currentSignature || job.signature == null) return false;
  return job.currentSignature() !== job.signature;
}

/** Phase counts of the latest progress report (A.10 `phases`), or null before the first one. */
export function progressOf(job) {
  const phases = job.progress?.phases;
  if (!Array.isArray(phases) || phases.length === 0) return null;
  return { phases, done: phases.filter((p) => p.state === 'done').length, total: phases.length };
}

export function summaryOf(job) {
  if (job.status !== 'finished' || !job.summarize) return [];
  try {
    return job.summarize(job.result) ?? [];
  } catch {
    return [];
  }
}

export function setPersistCheckpoints(on) {
  persistCheckpoints = !!on;
  writeFlag(persistCheckpoints);
  if (persistCheckpoints) {
    for (const j of jobs) if (j.status === 'cancelled' && j.checkpoint) saveCheckpoint(j);
  }
}

/** Offer Resume for checkpoints saved before a reload (call once at start-up when enabled). */
export async function restoreInterrupted() {
  if (!persistCheckpoints) return 0;
  const records = await db.all();
  let n = 0;
  for (const r of records ?? []) {
    if (!r?.request || jobs.some((j) => j.restoredFrom === r.id)) continue;
    jobs.push({
      id: `job-${seq++}`,
      restoredFrom: r.id,
      tool: r.tool,
      title: r.title,
      context: r.context ?? '',
      request: r.request,
      signature: r.signature ?? null,
      currentSignature: null,
      openRoute: r.openRoute ?? null,
      summarize: null,
      onFinish: null,
      workers: null,
      status: 'cancelled',
      progress: null,
      result: null,
      error: null,
      checkpoint: r.checkpoint ?? null,
      resumeFrom: null,
      cancelRequested: false,
      interrupted: true,
      queuedAt: r.at ?? Date.now(),
      startedAt: null,
      endedAt: r.at ?? Date.now(),
    });
    n++;
  }
  return n;
}

export const jobsStore = {
  get list() {
    return jobs;
  },
  // A job whose Cancel was pressed no longer counts: it only winds down (posts its checkpoint) until the
  // worker answers, and the Jobs pill must drop at once.
  get running() {
    return jobs.filter((j) => j.status === 'running' && !j.cancelRequested).length;
  },
  get active() {
    return jobs.filter((j) => (j.status === 'running' && !j.cancelRequested) || j.status === 'queued').length;
  },
  get persistCheckpoints() {
    return persistCheckpoints;
  },
};

/** Test seam: swap the runner / checkpoint db and clear all state. */
export function __resetJobs({ run = runOptimizerTask, checkpointDb = createCheckpointDb(), persist = false } = {}) {
  for (const h of handles.values()) h.cancel?.();
  handles.clear();
  debugLogs.clear();
  jobs = [];
  seq = 1;
  runner = run;
  db = checkpointDb;
  persistCheckpoints = persist;
}
