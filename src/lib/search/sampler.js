// search/sampler.js (A3): the common-random-number sample store and the comparisons over it.
// Contract: docs/Reference/simulation.md §Objectives (sample sets, stages, the store) and §Statistics
// (sequential comparator). The objective (search/objectives.js) says what one fight's outcome is;
// this file only stores, extends and compares outcome vectors.
//
// A SAMPLE SET is `{main: number[][], side: Object<string, number[][]>, n}`: one lane per stratum (PVE
// has one, PVP one per matchup), every lane n fights long, fight i of every lane drawn from the
// stage seed and i alone. `side` holds per-fight extras the statistic does not rank on (PVP duel ms).
import { lookSchedule, perLookAlpha, deltaAbs, decide, nNeeded } from '../engine/stats/index.js';

/** Thrown by a sampler or objective when its signal aborts; the fights done so far stay stored. */
export class AbortError extends Error {
  constructor(message = 'aborted') {
    super(message);
    this.name = 'AbortError';
  }
}
export const isAbort = (e) => e?.name === 'AbortError';

/** A sample set over the given lanes (and optional side lanes); all lanes must be equally long. */
export function setOf(main, side = {}) {
  const n = main[0]?.length ?? 0;
  if (main.some((l) => l.length !== n)) throw new RangeError('setOf: lanes differ in length');
  return { main, side, n };
}

/** The first n fights of a set (a copy). */
export function sliceSet(s, n) {
  if (n > s.n) throw new RangeError(`sliceSet: asked for ${n} fights, the set holds ${s.n}`);
  const cut = (lanes) => lanes.map((l) => l.slice(0, n));
  return { main: cut(s.main), side: Object.fromEntries(Object.entries(s.side).map(([k, v]) => [k, cut(v)])), n };
}

// `dst.push(...src)` overflows the call stack on a long chunk, so append in a loop.
const pushAll = (dst, src) => {
  for (let i = 0; i < src.length; i++) dst.push(src[i]);
};

function append(entry, chunk) {
  chunk.main.forEach((l, j) => {
    if (!entry.main[j]) entry.main[j] = [];
    pushAll(entry.main[j], l);
  });
  for (const [k, lanes] of Object.entries(chunk.side ?? {})) {
    if (!entry.side[k]) entry.side[k] = [];
    lanes.forEach((l, j) => {
      if (!entry.side[k][j]) entry.side[k][j] = [];
      pushAll(entry.side[k][j], l);
    });
  }
  entry.n = entry.main[0]?.length ?? 0;
}

/**
 * The sample store of one objective (one target): entries are keyed by `(engineKey, stage)`, so two
 * builds with the same engine inputs share one vector and N is never part of the key. A request for
 * more fights than held simulates only the missing ones (prefix extension).
 * @param {{sample: Function}} objective  from makeObjective
 */
export function createSampler(objective) {
  const store = new Map();
  let fights = 0;
  let hits = 0;
  const keyOf = (engineKey, stage) => `${stage.id}|${stage.seed}|${engineKey}`;

  async function extend(entry, fighter, n, signal) {
    if (entry.n >= n) return;
    const chunk = await objective.sample(fighter, { seed: entry.seed, from: entry.n, to: n, signal });
    const before = entry.n;
    append(entry, chunk);
    fights += (entry.n - before) * Math.max(1, entry.main.length);
    if (chunk.aborted) throw new AbortError();
  }

  return {
    /**
     * The first n fights of the build `engineKey` on `stage` ({id, seed}); `fighter` is only read
     * when fights are missing. Rejects with AbortError when `signal` aborts first.
     * @returns {Promise<{main: number[][], side: Object, n: number}>}
     */
    async get(engineKey, stage, fighter, n, { signal } = {}) {
      const k = keyOf(engineKey, stage);
      let entry = store.get(k);
      if (!entry) {
        entry = { seed: stage.seed, main: [], side: {}, n: 0, busy: Promise.resolve() };
        store.set(k, entry);
      }
      if (entry.n >= n) hits++;
      // one extension at a time per entry: concurrent callers wait, then reuse what the first one drew
      const run = entry.busy.then(() => extend(entry, fighter, n, signal));
      entry.busy = run.catch(() => {});
      await run;
      return sliceSet(entry, n);
    },
    /** Fights held for a build on a stage (0 when none). */
    held: (engineKey, stage) => store.get(keyOf(engineKey, stage))?.n ?? 0,
    /** Fights simulated (lanes counted) and requests served without simulating. */
    stats: () => ({ fights, hits, entries: store.size }),
  };
}

// ---------------------------------------------------------------------------------------------
// contrasts over sample sets (the objective supplies the per-look contrast)

/** Default indifference zone, in win-rate points, when a TTK contrast falls back to win rate. */
export const WIN_RATE_DELTA = 0.02;

function verdictOf(objective, x, y, o, alpha, final) {
  const c = objective.contrast(x, y, { alpha, seed: o.seed, B: o.B });
  const hib = c.higherIsBetter ?? objective.higherIsBetter;
  const zone = c.basis === 'winRate'
    ? o.deltaWinRate ?? WIN_RATE_DELTA
    : deltaAbs(o.delta ?? 0, o.deltaKind ?? objective.deltaKind, c.ref);
  const verdict = decide(c, zone, hib) ?? (final ? 'unresolved' : null);
  if (!verdict) return null;
  return {
    delta: c.delta, lo: c.lo, hi: c.hi,
    pct: Number.isFinite(c.ref) && c.ref !== 0 && Number.isFinite(c.delta) ? c.delta / Math.abs(c.ref) : null,
    n: x.n, seed: o.seed ?? 1, alphaAdj: alpha, method: c.method, basis: c.basis, higherIsBetter: hib,
    verdict, significant: verdict === 'better' || verdict === 'worse',
    nNeeded: verdict === 'unresolved' ? nNeeded({ sd: c.sd, delta: c.delta, deltaMin: zone, alpha }) : null,
    p: c.p ?? null, sd: c.sd ?? null, zone,
  };
}

/**
 * One paired contrast of X against Y at a fixed n (confirm, attribution, a re-measure): a Contrast
 * whose verdict is `unresolved` unless the interval resolves.
 * @param {{delta?: number, deltaKind?: string, deltaWinRate?: number, alpha?: number, seed?: number, B?: number}} [o]
 */
export function contrastSets(objective, x, y, o = {}) {
  const n = Math.min(x.n, y.n);
  return { ...verdictOf(objective, sliceSet(x, n), sliceSet(y, n), o, o.alpha ?? 0.05, true), looks: 1 };
}

/**
 * Sequential comparison of X against Y (simulation.md §Statistics): looks at n0, 2n0, ... maxN, each
 * at alpha / looks, stopping at the first resolved verdict. `getX(n)` / `getY(n)` return (or
 * promise) sample sets of at least n fights, typically `sampler.get` calls.
 * @param {{delta?: number, deltaKind?: string, deltaWinRate?: number, alpha?: number, n0: number, maxN: number, seed?: number, B?: number}} o
 */
export async function compareSets(objective, getX, getY, o) {
  const looks = lookSchedule(o.n0, o.maxN);
  const a = perLookAlpha(o.alpha ?? 0.05, looks);
  for (let k = 0; k < looks.length; k++) {
    const n = looks[k];
    const [x, y] = await Promise.all([getX(n), getY(n)]);
    if (x.n < n || y.n < n) throw new RangeError(`compareSets: sampler returned fewer than ${n} fights`);
    const r = verdictOf(objective, sliceSet(x, n), sliceSet(y, n), o, a, k === looks.length - 1);
    if (r) return { ...r, looks: k + 1 };
  }
  throw new Error('unreachable');
}
