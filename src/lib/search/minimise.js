// search/minimise.js (A4): the minimal significant change set and its attribution (redesign plan
// A.8, invariant I3). Contract: docs/Reference/simulation.md §Search (minimise, attribute).
//
// Both phases take a context from the driver (search/search.js):
//   space, B (the baseline arm), armOf(cand) -> arm, objective,
//   compare(X, Y, alpha) -> Contrast        sequential, on the minimise stage (S2)
//   contrastAt(X, Y, n, alpha) -> Contrast  fixed n, on the confirm stage (S3)
//   getSet(arm, n) -> sample set            on the confirm stage (S3)
//   prefetch?(arms, n?)                     optional: draw the fights the next tests will read, in parallel
import { hashSeed, mulberry32 } from '../engine/rng.js';
import { meanInterval, censoredQuantile } from '../engine/stats/index.js';
import { changesOf, revert, addChange, canonicalise } from './effect.js';
import { fillEmptySockets } from './fill.js';
import { socketsOf, savedSockets } from './space.js';

/**
 * Holm's step-down over sequential tests: every open test runs at alpha / (m - rejected); the ones
 * that resolve significant are rejected and the rest run again at the looser level, until a round
 * rejects nothing. `run(item, alphaEach)` returns a Contrast; the last run of each item is kept.
 * @returns {Promise<Object[]>} one Contrast per item
 */
export async function holmSequential(items, alpha, run) {
  const m = items.length;
  const out = new Array(m);
  let open = items.map((_, i) => i);
  let rejected = 0;
  while (open.length) {
    const a = alpha / (m - rejected);
    for (const i of open) out[i] = { ...(await run(items[i], a)), alphaAdj: a };
    const sig = open.filter((i) => out[i].significant);
    if (!sig.length) break;
    rejected += sig.length;
    open = open.filter((i) => !out[i].significant);
  }
  return out;
}

/** The gain of a contrast in the objective's direction (null when it has no delta). */
export const gainOf = (c) => (c?.delta == null || !Number.isFinite(c.delta) ? null : (c.higherIsBetter === false ? -c.delta : c.delta));

const disruption = (c) => c.sideEffects.length + c.bundle.length + (c.scope === 'preset' ? 0 : 1);

/** F with change c taken out, legalised and canonical, before the Combat Power guard is applied. */
function reverted(ctx, F, c) {
  const { space, B } = ctx;
  return canonicalise(space, B.cand, space.legalise(revert(space, B.cand, F.cand, c))).candidate;
}

/** Is change c held by the Combat Power guard (taking it out drops the build below the floor)? */
export function heldByFloor(ctx, F, c) {
  const Y = reverted(ctx, F, c);
  return !!ctx.space.admissible && ctx.armOf(Y).key !== F.key && !ctx.space.admissible(Y);
}

/** F with change c taken out; null when legality puts it straight back or the build would fall below the Power floor. */
export function without(ctx, F, c) {
  const Y = reverted(ctx, F, c);
  const arm = ctx.armOf(Y);
  if (arm.key === F.key) return null;
  return ctx.space.admissible && !ctx.space.admissible(Y) ? null : arm;
}

/** F with every change in cs taken out; null as for `without` (no change left to drop, or below the Power floor). */
export function withoutAll(ctx, F, cs) {
  const { space, B } = ctx;
  let X = F.cand;
  for (const c of cs) X = revert(space, B.cand, X, c);
  const Y = canonicalise(space, B.cand, space.legalise(X)).candidate;
  const arm = ctx.armOf(Y);
  if (arm.key === F.key) return null;
  return space.admissible && !space.admissible(Y) ? null : arm;
}

/**
 * Minimal significant change set (A.8): drop, one at a time, the change whose removal costs least
 * until every remaining change is needed (removing it is significantly worse, Holm over the changes);
 * the result stands only when it is significantly better than the baseline.
 * `batch` (the Optimiser's default, simulation.md §Minimise and confirm): with two or more droppable changes D,
 * first compare F against F - D at the level the round judged D at; `equivalent` or `worse` drops all of D at once, anything else
 * falls back to one at a time for the rest of this finalist.
 * @param {Object} ctx  see the header
 * @param {Object} F0   finalist arm (canonical)
 * @param {{alpha: number, alphaFinal: number, batch?: boolean}} o
 * @returns {Promise<{arm: Object, decided: Record<string, Object>, dropped: Array<{change: Object, contrast: Object, batch?: boolean}>, vsBaseline: Object|null}>}
 *   `decided`: change id -> its last S2 contrast (F against F without it); `vsBaseline`: the final S2 check
 */
export async function minimise(ctx, F0, { alpha, alphaFinal, batch = false }) {
  const { space, B } = ctx;
  let F = F0;
  const dropped = [];
  let decided = {};
  let tryBatch = batch;
  for (;;) {
    if (F.key === B.key) return { arm: B, decided: {}, dropped, vsBaseline: null };
    const C = changesOf(space, B.cand, F.cand);
    const tests = C.map((c) => ({ c, Y: without(ctx, F, c) })).filter((t) => t.Y);
    await ctx.prefetch?.([F, ...tests.map((t) => t.Y)]);
    const res = await holmSequential(tests, alpha, (t, a) => ctx.compare(F, t.Y, a));
    decided = Object.fromEntries(tests.map((t, i) => [t.c.id, res[i]]));
    const droppable = tests.map((t, i) => ({ ...t, r: res[i], i })).filter((t) => t.r.verdict !== 'better');
    if (!droppable.length) break;
    droppable.sort((a, b) => (gainOf(a.r) ?? 0) - (gainOf(b.r) ?? 0) || disruption(b.c) - disruption(a.c) || a.i - b.i);
    if (tryBatch && droppable.length >= 2) {
      const Y = withoutAll(ctx, F, droppable.map((t) => t.c));
      // the level each single drop it replaces was judged at (Holm's last round)
      const r = Y && await ctx.compare(F, Y, droppable[0].r.alphaAdj ?? alpha);
      if (r && (r.verdict === 'equivalent' || r.verdict === 'worse')) {
        for (const t of droppable) dropped.push({ change: t.c, contrast: r, batch: true });
        F = Y;
        continue;
      }
      tryBatch = false;
    }
    const d = droppable[0];
    dropped.push({ change: d.c, contrast: d.r });
    F = d.Y;
  }
  const vs = await ctx.compare(F, B, alphaFinal);
  if (vs.verdict !== 'better') return { arm: B, decided: {}, dropped, vsBaseline: vs, free: [] };
  const filled = ctx.fill ? await withFreeFills(ctx, F, { alpha, alphaFinal }) : null;
  return filled ? { ...filled, dropped } : { arm: F, decided, dropped, vsBaseline: vs, free: [] };
}

/**
 * Free fills (simulation.md §Minimise and confirm): F with its empty glyph sockets filled (fill.js). A change is
 * a fill when it puts a fill glyph into a socket the baseline has empty; one into a baseline glyph's socket
 * replaces that glyph, so it is paid like any other. The filled build FX is kept only when one more Holm round
 * over its paid changes finds each still needed, no fill is worse to keep than to leave out (each at alpha),
 * FX is not worse than F (a fill may put back a glyph F took off, which is then no change at all), and FX is
 * still better than the baseline at alphaFinal.
 * @returns {Promise<Object|null>}  minimise's result for the filled build, `free` its fill change ids; null: no fill
 */
async function withFreeFills(ctx, F, { alpha, alphaFinal }) {
  const { space, B } = ctx;
  const { candidate, glyphs } = fillEmptySockets(space, B.cand, F.cand);
  if (!glyphs.length) return null;
  const FX = ctx.armOf(candidate);
  if (FX.key === F.key) return null;
  const C = changesOf(space, B.cand, FX.cand);
  const fills = new Set(glyphs);
  const isFill = (c) => c.dimension.endsWith('Glyphs') && glyphAt(space, B.cand, c.id) == null && fills.has(glyphAt(space, FX.cand, c.id));
  const tests = C.map((c) => ({ c, Y: without(ctx, FX, c) })).filter((t) => t.Y);
  const paid = tests.filter((t) => !isFill(t.c));
  const free = tests.filter((t) => isFill(t.c));
  await ctx.prefetch?.([FX, ...tests.map((t) => t.Y)]);
  const paidRes = await holmSequential(paid, alpha, (t, a) => ctx.compare(FX, t.Y, a));
  if (paidRes.some((r) => r.verdict !== 'better')) return null;
  const freeRes = [];
  for (const t of free) freeRes.push(await ctx.compare(FX, t.Y, alpha));
  if (freeRes.some((r) => r.verdict === 'worse')) return null;
  if ((await ctx.compare(FX, F, alpha)).verdict === 'worse') return null;
  const vs = await ctx.compare(FX, B, alphaFinal);
  if (vs.verdict !== 'better') return null;
  const decided = Object.fromEntries([...paid.map((t, i) => [t.c.id, paidRes[i]]), ...free.map((t, i) => [t.c.id, freeRes[i]])]);
  return { arm: FX, decided, vsBaseline: vs, free: C.filter(isFill).map((c) => c.id) };
}

/**
 * The glyph id in the socket of change `glyph:<mount>:<tier>:<i>` on candidate X (null: empty). A candidate on
 * another mount sees that mount's saved sockets, as changesOf does.
 */
function glyphAt(space, X, id) {
  const [, m, tier, i] = id.split(':');
  const rows = X.mountId === m ? socketsOf(space.character, X) : savedSockets(space.character, m);
  return rows?.[tier]?.[Number(i)] ?? null;
}

// ---------------------------------------------------------------------------------------------
// attribution (S3)

/** Per-fight values pooled over lanes (PVP matchups weigh equally), in the objective's own points. */
function perFight(set, pointOf = (v) => v) {
  const n = set.n;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const lane of set.main) s += pointOf(lane[i]);
    out[i] = s / set.main.length;
  }
  return out;
}

const finiteOr = (x) => (Number.isFinite(x) ? x : null);

/**
 * The interaction remainder of a row: what the whole change set does beyond the sum of its changes'
 * own effects. Mean and proportion objectives: per fight d_full - Σ d_c, paired t. Quantile objectives:
 * paired bootstrap (fight indices, B = 2 000) of θ(F) - θ(B) - Σ (θ(B + c) - θ(B)).
 */
export function remainderOf(objective, F, Bs, own, { alpha = 0.05, seed = 1, B = 2000 } = {}) {
  const n = Math.min(F.n, Bs.n, ...own.map((s) => s.n));
  if (objective.statistic !== 'censored-quantile') {
    const pt = objective.pointOf;
    const f = perFight(F, pt);
    const b = perFight(Bs, pt);
    const o = own.map((s) => perFight(s, pt));
    const r = new Array(n);
    for (let i = 0; i < n; i++) r[i] = f[i] - b[i] - o.reduce((s, x) => s + x[i] - b[i], 0);
    const m = meanInterval(r, { alpha });
    return { delta: finiteOr(m.est), lo: finiteOr(m.lo), hi: finiteOr(m.hi), method: 'paired-t' };
  }
  const q = objective.q;
  const lanes = [F.main[0], Bs.main[0], ...own.map((s) => s.main[0])];
  const stat = (xs) => {
    const t = xs.map((x) => censoredQuantile(x, q));
    return t[0] - t[1] - t.slice(2).reduce((s, x) => s + x - t[1], 0);
  };
  const point = stat(lanes.map((l) => l.slice(0, n)));
  if (!Number.isFinite(point)) return { delta: null, lo: null, hi: null, method: 'bootstrap' };
  const rng = mulberry32(hashSeed('remainder', seed, n));
  const reps = [];
  const buf = lanes.map(() => new Array(n));
  for (let r = 0; r < B; r++) {
    for (let j = 0; j < n; j++) {
      const i = Math.floor(rng() * n);
      for (let l = 0; l < lanes.length; l++) buf[l][j] = lanes[l][i];
    }
    const d = stat(buf);
    if (Number.isFinite(d)) reps.push(d);
  }
  reps.sort((a, b) => a - b);
  if (reps.length < 2) return { delta: point, lo: null, hi: null, method: 'bootstrap' };
  const lo = reps[Math.min(reps.length - 1, Math.floor((alpha / 2) * reps.length))];
  const hi = reps[Math.max(0, Math.ceil((1 - alpha / 2) * reps.length) - 1)];
  return { delta: point, lo, hi, method: 'bootstrap' };
}

/**
 * Fixed-n contrasts with Holm's step-down (the same rounds as holmSequential, each test a contrast at
 * n): all at alpha / m, then the ones not yet significant at alpha / (m - rejected), until a round
 * rejects nothing. `pairs` is [[X, Y], ...]; one Contrast per pair, with `alphaAdj`.
 */
export function holmFixed(pairs, alpha, contrastAt, n) {
  return holmSequential(pairs, alpha, ([X, Y], a) => contrastAt(X, Y, n, a));
}

/**
 * Attribution of one confirmed row (A.8, on S3 at the row's n): own(c) = (B + c) against B, needed(c)
 * = F against F without c, both Holm within the row; keptBecause; and the interaction remainder.
 * @returns {Promise<{changes: Object[], remainder: Object|null}>}
 */
export async function attribute(ctx, F, n, { alpha, seed, free = new Set() }) {
  const { space, B, objective } = ctx;
  const all = changesOf(space, B.cand, F.cand);
  const C = all.filter((c) => !free.has(c.id));
  const withOnly = C.map((c) => ctx.armOf(canonicalise(space, B.cand, space.legalise(addChange(space, B.cand, F.cand, c))).candidate));
  // a change added alone may fall below the Combat Power floor: that build is never measured (own effect null)
  const soloOk = withOnly.map((X) => !space.admissible || space.admissible(X.cand));
  const minus = C.map((c) => without(ctx, F, c));
  await ctx.prefetch?.([F, B, ...withOnly.filter((_, i) => soloOk[i]), ...minus.filter(Boolean)], n);
  const solo = withOnly.map((X, i) => [X, i]).filter(([, i]) => soloOk[i]);
  const ownT = await holmFixed(solo.map(([X]) => [X, B]), alpha, ctx.contrastAt, n);
  const own = new Array(C.length).fill(null);
  solo.forEach(([, i], j) => { own[i] = ownT[j]; });
  const testable = minus.map((Y, i) => [Y, i]).filter(([Y]) => Y);
  const neededT = await holmFixed(testable.map(([Y]) => [F, Y]), alpha, ctx.contrastAt, n);
  const needed = new Array(C.length).fill(null);
  testable.forEach(([, i], j) => { needed[i] = neededT[j]; });
  const attributed = C.map((c, i) => ({
    ...c,
    own: own[i],
    needed: needed[i],
    keptBecause: own[i]?.significant && gainOf(own[i]) > 0 ? 'own-effect' : heldByFloor(ctx, F, c) ? 'power-floor' : 'interaction',
  }));
  let remainder = null;
  if (C.length === all.length && C.length >= 2 && soloOk.every(Boolean)) {
    const sets = [];
    for (const X of [F, B, ...withOnly]) sets.push(await ctx.getSet(X, n));
    const [fs, bs, ...os] = sets;
    remainder = remainderOf(objective, fs, bs, os, { alpha, seed });
  }
  const byId = new Map(attributed.map((c) => [c.id, c]));
  const changes = all.map((c) => byId.get(c.id) ?? { ...c, free: true, own: null, needed: null, keptBecause: 'free' });
  return { changes, remainder };
}
