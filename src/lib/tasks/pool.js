// Deterministic engine-worker pool (J2). Contract: docs/Reference/simulation.md §Worker pool.
//
// A pool runs one kernel (tasks/kernels.js) for one job. `run(args, from, to)` splits the fight index
// range into shards, hands them to whichever worker is idle, and resolves with the chunks merged in
// index order, so the result never depends on which worker finished first or on the pool size.
// On abort it resolves with the contiguous prefix of finished shards and `aborted: true`.
//
// Workers are reached through `spawn()`, which returns anything Worker-shaped ({postMessage,
// onmessage, onerror, terminate}); tests pass an in-process fake. A worker that fails before it is
// ready is dropped; when none is left the remaining shards run inline in this thread (same numbers).
import { KERNELS } from './kernels.js';

/** Fights per shard: the range split evenly over the workers, within these bounds. */
export const MIN_SHARD = 4;
export const MAX_SHARD = 64;
/** Fights an inline pool runs between abort checks and yields. */
const INLINE_SLICE = 8;
const YIELD_MS = 25;
const tick = () => new Promise((r) => setTimeout(r, 0));

const emptyChunk = () => ({ main: [], side: {} });

/** Append chunk `c` to `dst` lane by lane (in place). */
export function appendChunk(dst, c) {
  const add = (lanes, src) => src.forEach((l, j) => {
    if (!lanes[j]) lanes[j] = [];
    for (let i = 0; i < l.length; i++) lanes[j].push(l[i]);
  });
  add(dst.main, c.main ?? []);
  for (const [k, lanes] of Object.entries(c.side ?? {})) add((dst.side[k] ??= []), lanes);
  return dst;
}

export function shardSize(len, size) {
  return Math.min(MAX_SHARD, Math.max(MIN_SHARD, Math.ceil(len / Math.max(1, size))));
}

function errorOf(msg) {
  const e = new Error(msg.message || 'pool worker failed');
  if (msg.name) e.name = msg.name;
  return e;
}

/**
 * The pool of size 1: the kernel runs in this thread, in slices, checking the signal and yielding
 * every ~25 ms so a cancel lands. Also the fallback of a worker pool.
 */
export function inlinePool(kind, setup) {
  const kernel = KERNELS[kind];
  if (!kernel) throw new Error(`unknown pool kernel '${kind}'`);
  let ctx;
  return {
    kind, size: 1,
    async run(args, from, to, { signal, onProgress } = {}) {
      ctx ??= await kernel.prepare(setup);
      const out = emptyChunk();
      let last = Date.now();
      for (let i = from; i < to;) {
        if (signal?.aborted) return { ...out, aborted: true };
        const j = Math.min(to, i + INLINE_SLICE);
        appendChunk(out, await kernel.run(ctx, args, i, j));
        i = j;
        onProgress?.(i - from);
        if (Date.now() - last >= YIELD_MS) {
          await tick();
          last = Date.now();
        }
      }
      return { ...out, aborted: false };
    },
    close() {},
  };
}

/**
 * A pool of `size` workers, each prepared once with (kind, setup).
 * @param {{kind: string, setup: Object, size: number, spawn: () => Object}} o
 */
export function createPool({ kind, setup, size, spawn }) {
  if (!KERNELS[kind]) throw new Error(`unknown pool kernel '${kind}'`);
  const workers = [];
  const queue = [];
  let local = null;
  let nextId = 1;

  const alive = () => workers.filter((w) => !w.dead);

  function finish(job, aborted) {
    if (job.done) return;
    job.done = true;
    job.signal?.removeEventListener?.('abort', job.onAbort);
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].job === job) queue.splice(i, 1);
    job.resolve({ ...job.out, aborted });
  }

  function fail(job, err) {
    if (job.done) return;
    job.done = true;
    job.signal?.removeEventListener?.('abort', job.onAbort);
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].job === job) queue.splice(i, 1);
    job.reject(err);
  }

  function complete(s, chunk) {
    const { job } = s;
    if (job.done) return;
    s.chunk = chunk;
    const before = job.next;
    while (job.next < job.shards.length && job.shards[job.next].chunk) {
      appendChunk(job.out, job.shards[job.next].chunk);
      job.shards[job.next].chunk = true; // merged; drop the data
      job.next++;
    }
    if (job.next > before) job.onProgress?.(job.shards[job.next - 1].to - job.from);
    if (job.next === job.shards.length) finish(job, false);
  }

  // Every worker failed: the queued shards run here, one after another (the numbers are the same).
  function drainLocal() {
    local ??= inlinePool(kind, setup);
    while (queue.length) {
      const s = queue.shift();
      local.run(s.job.args, s.from, s.to, { signal: s.job.signal }).then(
        (c) => (c.aborted ? finish(s.job, true) : complete(s, c)),
        (err) => fail(s.job, err),
      );
    }
  }

  function pump() {
    if (!alive().length) {
      drainLocal();
      return;
    }
    for (const w of workers) {
      if (w.dead || !w.ready || w.busy) continue;
      const s = queue.shift();
      if (!s) break;
      w.busy = s;
      try {
        w.ep.postMessage({ type: 'shard', id: s.id, args: s.job.args, from: s.from, to: s.to });
      } catch {
        die(w);
        return;
      }
    }
  }

  function die(w) {
    if (w.dead) return;
    w.dead = true;
    try { w.ep.terminate(); } catch { /* already gone */ }
    if (w.busy && !w.busy.job.done) queue.unshift(w.busy);
    w.busy = null;
    pump();
  }

  function onMessage(w, msg) {
    if (w.dead) return;
    if (msg?.type === 'ready') {
      w.ready = true;
    } else if (msg?.type === 'shard') {
      const s = w.busy;
      w.busy = null;
      if (s && s.id === msg.id) complete(s, msg.chunk);
    } else if (msg?.type === 'fail') {
      if (!w.ready) {
        die(w); // could not prepare: the others (or the inline fallback) take over
        return;
      }
      const s = w.busy;
      w.busy = null;
      if (s) fail(s.job, errorOf(msg));
    }
    pump();
  }

  for (let k = 0; k < size; k++) {
    let ep;
    try {
      ep = spawn();
    } catch {
      continue;
    }
    const w = { ep, ready: false, busy: null, dead: false };
    workers.push(w);
    ep.onmessage = (e) => onMessage(w, e.data);
    ep.onerror = (e) => {
      e?.preventDefault?.();
      die(w);
    };
    try {
      ep.postMessage({ type: 'prepare', kind, setup });
    } catch {
      die(w);
    }
  }

  return {
    kind, size,
    /** Workers still usable (0 once the pool has fallen back to inline). */
    get workers() { return alive().length; },
    run(args, from, to, { signal, onProgress } = {}) {
      return new Promise((resolve, reject) => {
        const job = { args, signal, from, shards: [], next: 0, out: emptyChunk(), done: false, resolve, reject, onProgress };
        if (signal?.aborted || to <= from) {
          job.done = true;
          resolve({ ...job.out, aborted: !!signal?.aborted });
          return;
        }
        const step = shardSize(to - from, size);
        for (let i = from; i < to; i += step) job.shards.push({ id: nextId++, job, from: i, to: Math.min(to, i + step), chunk: null });
        job.onAbort = () => finish(job, true);
        signal?.addEventListener?.('abort', job.onAbort, { once: true });
        queue.push(...job.shards);
        pump();
      });
    },
    close() {
      for (const w of workers) {
        w.dead = true;
        try { w.ep.terminate(); } catch { /* already gone */ }
      }
      queue.length = 0;
    },
  };
}

/**
 * Pools opened by one task, closed together when it ends. `factory(kind, setup)` makes a pool
 * (the worker host's, see optimizerWorker.js); without one every pool is inline.
 */
export function poolScope(factory) {
  const open = [];
  return {
    open(kind, setup) {
      const p = (factory ?? inlinePool)(kind, setup);
      open.push(p);
      return p;
    },
    close() {
      for (const p of open.splice(0)) p.close();
    },
  };
}
