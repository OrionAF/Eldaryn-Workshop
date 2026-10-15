// Test double of a pool worker (tests only): poolWorker.js's handler in this thread behind a
// Worker-shaped endpoint. Messages are structured-cloned both ways and every reply arrives after a
// seeded random delay, so the shards of one range finish out of order.
import { createPoolHandler } from '../poolWorker.js';
import { mulberry32 } from '../engine/rng.js';
import { createPool, inlinePool } from './pool.js';

/**
 * @param {{seed?: number, maxDelayMs?: number, failStart?: number}} [o]  the first `failStart`
 *   endpoints fail to load (onerror before 'ready'), like a blocked module worker
 * @returns {() => Object} a spawn function for createPool; `spawn.made` counts endpoints
 */
export function fakeSpawn({ seed = 1, maxDelayMs = 4, failStart = 0 } = {}) {
  const rng = mulberry32(seed);
  const spawn = () => {
    const k = spawn.made++;
    const ep = { terminated: false, onmessage: null, onerror: null };
    const handle = createPoolHandler((m) => {
      const data = structuredClone(m);
      setTimeout(() => { if (!ep.terminated) ep.onmessage?.({ data }); }, Math.floor(rng() * maxDelayMs));
    });
    ep.postMessage = (m) => {
      if (ep.terminated) return;
      if (k < failStart) {
        setTimeout(() => { if (!ep.terminated) ep.onerror?.({ message: 'failed to load' }); }, 0);
        return;
      }
      const data = structuredClone(m);
      setTimeout(() => handle({ data }), 0);
    };
    ep.terminate = () => { ep.terminated = true; };
    return ep;
  };
  spawn.made = 0;
  return spawn;
}

/** A pool factory for tasks and the optimiser (`ctx.pool` / `hooks.pool`) over fake workers. */
export function fakePoolFactory(size, o = {}) {
  const spawn = fakeSpawn(o);
  const factory = (kind, setup) => (size <= 1 ? inlinePool(kind, setup) : createPool({ kind, setup, size, spawn }));
  factory.spawn = spawn;
  return factory;
}
