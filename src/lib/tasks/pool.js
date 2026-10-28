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
/**
 * Fights one message carries: an idle worker takes queued shards (of any jobs) up to this many, never
 * more than its fair share of the queue. A message costs about as much as a few short chapter fights.
 */
export const BATCH_FIGHTS = 64;
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
  // the debug log's per-fight timing (kernels.js objective), merged in index order like the outcomes
  if (c.trace) for (const [k, lanes] of Object.entries(c.trace)) add(((dst.trace ??= {})[k] ??= []), lanes);
  return dst;
}

export function shardSize(len, size) {
  return Math.min(MAX_SHARD, Math.max(MIN_SHARD, Math.ceil(len / Math.max(1, size))));
}

/** Fighters a worker keeps between shards (least recently used out); the pool mirrors the cache. */
export const FIGHTER_CACHE = 2048;

const deepFreeze = (o) => {
  if (o === null || typeof o !== 'object' || Object.isFrozen(o)) return o;
  Object.freeze(o);
  for (const v of Object.values(o)) deepFreeze(v);
  return o;
};

// a least-recently-used set of fighter ids: `use` returns whether the id was already held. The pool's
// copy (sending) and the worker's (receiving) see the same ids in the same order, so they always agree.
function lru(max) {
  const held = new Map();
  return {
    use(id, value) {
      const had = held.has(id);
      const v = had ? held.get(id) : value;
      held.delete(id);
      held.set(id, v);
      if (held.size > max) held.delete(held.keys().next().value);
      return had;
    },
    get: (id) => held.get(id),
  };
}

/**
 * The pool's side of the fighter cache for one worker: a shard's `args.fighter` crosses only on that
 * worker's first shard for it (structured-cloning and preparing it per shard cost more than a chapter
 * fight; optimiser-speed-research.md A4); later shards carry its id. Ids are per pool, by identity.
 */
export function fighterSender(idOf, max = FIGHTER_CACHE) {
  const held = lru(max);
  return (args) => {
    const f = args?.fighter;
    if (f === null || typeof f !== 'object') return args;
    const id = idOf(f);
    const { fighter, ...rest } = args;
    return held.use(id, true) ? { ...rest, fighterId: id } : { ...rest, fighterId: id, fighter };
  };
}

/**
 * The worker's side: the args with `fighter` restored, deep-frozen so the engine reuses its
 * preparation (engine/pve/fight.js preparePveFighter).
 */
export function fighterReceiver(max = FIGHTER_CACHE) {
  const held = lru(max);
  return (args) => {
    if (args?.fighterId == null) return args;
    const { fighterId, fighter, ...rest } = args;
    if (fighter !== undefined) held.use(fighterId, deepFreeze(fighter));
    else if (!held.use(fighterId)) throw new Error(`pool worker: fighter ${fighterId} is not cached`);
    return { ...rest, fighter: held.get(fighterId) };
  };
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
  const fighterIds = new WeakMap();
  let nextFighter = 1;
  const idOf = (f) => {
    let id = fighterIds.get(f);
    if (id === undefined) {
      id = nextFighter++;
      fighterIds.set(f, id);
    }
    return id;
  };

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
    const idle = workers.filter((w) => !w.dead && w.ready && !w.busy);
    for (let k = 0; k < idle.length && queue.length; k++) {
      const w = idle[k];
      // this worker's share of what is queued, so the idle workers split it evenly
      const share = Math.ceil(queue.length / (idle.length - k));
      const batch = [];
      let fights = 0;
      while (queue.length && batch.length < share && (batch.length === 0 || fights < BATCH_FIGHTS)) {
        const s = queue.shift();
        batch.push(s);
        fights += s.to - s.from;
      }
      w.busy = batch;
      try {
        w.ep.postMessage({ type: 'batch', items: batch.map((s) => ({ id: s.id, args: w.send(s.job.args), from: s.from, to: s.to })) });
      } catch {
        die(w);
        return;
      }
    }
  }

  // the shards of `w`'s batch that got no answer go back to the front of the queue
  function requeue(w) {
    const open = (w.busy ?? []).filter((s) => !s.job.done && s.chunk === null);
    w.busy = null;
    queue.unshift(...open);
  }

  function die(w) {
    if (w.dead) return;
    w.dead = true;
    try { w.ep.terminate(); } catch { /* already gone */ }
    requeue(w);
    pump();
  }

  function onMessage(w, msg) {
    if (w.dead) return;
    if (msg?.type === 'ready') {
      w.ready = true;
    } else if (msg?.type === 'batch') {
      const byId = new Map((w.busy ?? []).map((s) => [s.id, s]));
      for (const r of msg.results ?? []) {
        const s = byId.get(r.id);
        if (s) complete(s, r.chunk);
      }
      if (msg.failed) {
        const s = byId.get(msg.failed.id);
        if (s) fail(s.job, errorOf(msg.failed));
      }
      requeue(w);
    } else if (msg?.type === 'fail') {
      if (!w.ready) {
        die(w); // could not prepare: the others (or the inline fallback) take over
        return;
      }
      requeue(w);
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
    const w = { ep, ready: false, busy: null, dead: false, send: fighterSender(idOf) };
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
