/**
 * jobCheckpoints.js - optional IndexedDB copy of a cancelled job's checkpoint, so a reload can offer
 * Resume (redesign plan A.10, U3). Opt-in: the job store only calls it when the user enabled it.
 * Every call is best-effort: no IndexedDB (jsdom, private window) or any error resolves to
 * "nothing stored" and never throws. The records are small (request + checkpoint, no samples).
 */

const DB_NAME = 'eldaryn_jobs_v1';
const STORE = 'checkpoints';

export const FLAG_KEY = 'eldaryn_jobs_checkpoints_v1';

export function readFlag() {
  try {
    return localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(on) {
  try {
    localStorage.setItem(FLAG_KEY, on ? '1' : '0');
  } catch {
    /* per-device convenience only */
  }
}

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** @param {IDBFactory|undefined} [factory] injectable for tests */
export function createCheckpointDb(factory = globalThis.indexedDB) {
  let dbPromise = null;
  const open = () => {
    if (!factory) return Promise.resolve(null);
    dbPromise ??= new Promise((resolve) => {
      try {
        const req = factory.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return dbPromise;
  };
  const run = async (mode, fn, fallback) => {
    try {
      const db = await open();
      if (!db) return fallback;
      return await wrap(fn(db.transaction(STORE, mode).objectStore(STORE)));
    } catch {
      return fallback;
    }
  };
  return {
    put: (record) => run('readwrite', (s) => s.put(record), undefined),
    remove: (id) => run('readwrite', (s) => s.delete(id), undefined),
    all: () => run('readonly', (s) => s.getAll(), []),
  };
}
