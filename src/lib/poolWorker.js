/**
 * poolWorker.js - one engine worker of a job's pool (tasks/pool.js; simulation.md §Worker pool).
 *
 * Messages in:  { type: 'prepare', kind, setup }   once: builds the kernel's context (tasks/kernels.js)
 *               { type: 'shard', id, args, from, to }  one fight index range
 * Messages out: { type: 'ready' }
 *               { type: 'shard', id, chunk }
 *               { type: 'fail', id, message, name }   id null when prepare failed
 * Messages are handled one at a time, in arrival order.
 */

import { KERNELS } from './tasks/kernels.js';

/** Builds the onmessage handler; `post` is injected so tests can drive it without a Worker. */
export function createPoolHandler(post) {
  let kernel = null;
  let ctx = null;
  let chain = Promise.resolve();
  const failed = (id, err) => post({ type: 'fail', id, message: err?.message || String(err), name: err?.name });

  async function handle(msg) {
    if (msg?.type === 'prepare') {
      try {
        kernel = KERNELS[msg.kind];
        if (!kernel) throw new Error(`unknown pool kernel '${msg.kind}'`);
        ctx = await kernel.prepare(msg.setup);
        post({ type: 'ready' });
      } catch (err) {
        kernel = null;
        failed(null, err);
      }
    } else if (msg?.type === 'shard') {
      try {
        if (!kernel) throw new Error('pool worker: shard before prepare');
        post({ type: 'shard', id: msg.id, chunk: await kernel.run(ctx, msg.args, msg.from, msg.to) });
      } catch (err) {
        failed(msg.id, err);
      }
    }
  }

  return (e) => {
    chain = chain.then(() => handle(e.data));
  };
}

if (typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined') {
  self.onmessage = createPoolHandler((m) => self.postMessage(m));
}
