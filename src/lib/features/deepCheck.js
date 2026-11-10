// features/deepCheck.js: Drop Check's deep check (drop-check-goals.md §5, simulation.md §Drop Check, Deep check).
// A plain swap fixes everything around one gear change; the Optimiser tunes everything around fixed gear. The deep
// check asks "with this item, how good can this preset get?" for one preset and one judge goal:
//
//   1. Without (W0): optimise the preset for the goal, or reuse a saved run of the same goal that is still current.
//   2. With (W1):    optimise a copy of the character wearing the drop, warm-started from W0's winner.
//   3. Confirm:      on a fresh seed (never a search seed: each winner was picked on its own search fights, so
//                    comparing them there would favour the luckier search), the paired contrasts
//                    W1 vs W0 (what the drop is worth once both sides are re-tuned) and W0 vs current (what
//                    re-tuning alone gives, so the drop is not credited with it). The profile's guards are
//                    checked on W1 against the current build.
//
// Both sides carry the original preset's sheet residual (search.js prepare `residual`), so the copy is not judged
// without the in-game correction the original has. Pure over search/ and features/swap.js; runs in the worker
// (tasks/deepCheck.js). Cancelling returns what finished: W0 alone when W1 did not.
import { optimize, prepare } from '../search/search.js';
import { changesOf } from '../search/effect.js';
import { residualFor, resolveTarget, makeObjective } from '../search/objectives.js';
import { BLOCKS, SPACE_DEFAULTS } from '../search/space.js';
import { computePresetStats } from '../build/stats.js';
import { equipSetKey } from '../build/presetInputs.js';
import { hashSeed } from '../engine/rng.js';
import { runSwapMetrics, verdictFor, withItem } from './swap.js';

/** The blocks the Light space searches: the ones gear stats interact with (stones, talents, sigils, relics). */
const LIGHT_BLOCKS = new Set(['sigils', 'utility', 'ancient', 'conditions', 'relics', 'talents', 'stones']);
export const DEEP_SPACES = Object.freeze({
  full: null, // the Optimiser's defaults (search/space.js SPACE_DEFAULTS: no paid progression)
  light: Object.freeze(Object.fromEntries(BLOCKS.map((b) => [b, LIGHT_BLOCKS.has(b)]))),
});
const PHASE_LABEL = { without: 'Without the drop', with: 'With the drop', confirm: 'Confirm' };
/** Time budget per side by default (simulation.md §Time budget): a deep check has a known upper cost. */
export const DEEP_BUDGET_MS = 120_000;

/** The seed of the confirmation: derived apart from the search seeds (search.js seedsFor), so they never coincide. */
export const confirmSeed = (seed) => hashSeed('drop-deep-confirm', seed);

/** The candidate a result recommends: its top row when it beats the current build, else the current build. */
export function winnerOf(result) {
  const top = result?.rows?.[0];
  if (top && !top.isBaseline && top.vsBaseline?.verdict === 'better') return top.candidate;
  return result?.baseline?.candidate ?? null;
}

/**
 * A saved Optimiser run that can stand in for W0: same preset, same target and objective, the same search space,
 * finished (not cancelled), and still current (`isCurrent(run)`: its character key matches today's character,
 * ui/optimiserSetup.js runIsStale). Returns its winning candidate, or null.
 * @param {Object[]} runs  character.runs
 */
export function reusableRun(runs, { presetId, goal, space = null, character, isCurrent }) {
  let tKey;
  let spec;
  try {
    const t = resolveTarget(goal.target, { character, partner: goal.partner ?? null });
    tKey = t.key;
    spec = makeObjective(goal.objective, t).spec;
  } catch {
    return null;
  }
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const toggles = space ?? SPACE_DEFAULTS;
  for (const run of runs ?? []) {
    if (run?.schema !== 2 || run.presetId !== presetId || run.headline?.aborted || run.headline?.truncated) continue;
    if (run.target?.key !== tKey || !Object.entries(spec).every(([k, v]) => same(run.objective?.[k], v))) continue;
    if (!BLOCKS.every((b) => !!run.space?.[b] === !!toggles[b])) continue;
    if (!isCurrent(run)) continue;
    const rows = run.detail?.rows ?? [];
    const top = rows[0];
    const cand = top && !top.isBaseline && top.vsBaseline?.verdict === 'better' ? top.candidate : run.detail?.baseline?.candidate;
    if (cand) return { runId: run.id, candidate: cand };
  }
  return null;
}

const stripChange = (c) => ({ id: c.id, dimension: c.dimension, label: c.label, from: c.from, to: c.to, scope: c.scope });
const runOf = (res, reused = null) => (reused
  ? { reused: true, runId: reused.runId, status: 'done', evaluated: null, ms: 0 }
  : { reused: false, status: res?.status ?? 'failed', evaluated: res?.search?.evaluated ?? null, ms: res?.stats?.ms ?? 0, warnings: (res?.warnings ?? []).map((w) => w.message) });

/**
 * @param {{
 *   character: Object, presetId: string, drop: {slot: string, realm?: 'base'|'oblivion', item: Object},
 *   goal: {id: string, target: Object, objective: Object, partner?: Object},
 *   guards?: Array<{id: string, target: Object, objective: Object, role: 'guard', guard: {target: number}, partner?: Object}>,
 *   space?: 'full'|'light', effort?: Object, budgetMs?: number, seed?: number, precision?: string, maxN?: number, n0?: number,
 *   reuse?: {runId: string, candidate: Object}|null,
 * }} request  `effort` is the Optimiser's (search.js resolveEffort); `budgetMs` the time budget per side
 * @param {{signal?: AbortSignal, onProgress?: Function, phaseScope?: Function}} [hooks]  `phaseScope()` gives one phase
 *   `{open, sampleFor, close}`: `open` the pool factory an Optimiser run takes, `sampleFor(goal)` the confirmation's
 *   sampler (tasks/deepCheck.js); without it everything runs inline
 * @returns {Promise<Object>}  simulation.md §Drop Check, Deep check (`deep-check/1`)
 */
export async function deepCheck(request, { signal, onProgress, phaseScope } = {}) {
  /** Run one phase in its own pool scope, closed when the phase ends. */
  const inPhase = async (fn) => {
    const sc = phaseScope?.() ?? null;
    try {
      return await fn(sc ?? {});
    } finally {
      sc?.close();
    }
  };
  const { character, presetId, drop, goal, guards = [], seed = 1, precision = 'standard', reuse = null } = request ?? {};
  if (!character || !presetId || !drop?.item || !drop.slot || !goal) throw new Error('deepCheck: character, presetId, drop and goal are required');
  const preset = character.presets.find((p) => p.id === presetId);
  if (!preset) throw new Error(`deepCheck: unknown preset ${presetId}`);
  const realm = drop.realm === 'oblivion' ? 'oblivion' : 'base';
  const setKey = equipSetKey(preset, realm);
  const withDrop = withItem(character, setKey, drop.slot, drop.item);
  const { residual } = residualFor(computePresetStats(character, presetId, { realm }));
  // 'full' | 'light', or a toggles object (benchmarks and tests)
  const space = request.space && typeof request.space === 'object' ? request.space : request.space === 'light' ? DEEP_SPACES.light : DEEP_SPACES.full;
  const effort = { ...(request.effort ?? {}), budgetMs: request.budgetMs ?? request.effort?.budgetMs ?? DEEP_BUDGET_MS };
  const base = { presetId, realm, target: goal.target, objective: goal.objective, partner: goal.partner ?? null, ...(space ? { space } : {}), effort, seed, residual };
  // `phases` as the Jobs tray draws them (jobs.svelte.js progressOf); `inner` the running phase's own report
  const order = ['without', 'with', 'confirm'];
  const progress = (phase, p = null) => onProgress?.({
    phase,
    phases: order.map((id, i) => ({
      id, label: PHASE_LABEL[id],
      state: i < order.indexOf(phase) ? 'done' : id === phase ? 'current' : 'queued',
      done: id === phase && id === 'confirm' ? p?.done ?? null : null, total: id === phase && id === 'confirm' ? p?.total ?? null : null,
    })),
    ...(p ? { inner: p } : {}),
  });
  const out = { schema: 'deep-check/1', presetId, goalId: goal.id, setKey, space: typeof request.space === 'object' && request.space ? 'custom' : request.space === 'light' ? 'light' : 'full', aborted: false, partial: false };

  // 1. without the drop
  progress('without');
  let w0Res = null;
  let c0;
  if (reuse?.candidate) c0 = reuse.candidate;
  else {
    w0Res = await inPhase(({ open }) => optimize({ ...base, character }, { signal, pool: open, onProgress: (p) => progress('without', p) }));
    if (w0Res.status === 'failed') return { ...out, status: 'failed', error: w0Res.error ?? 'The Optimiser could not run this preset.' };
    if (w0Res.aborted) return { ...out, status: 'cancelled', aborted: true, partial: true, without: { run: runOf(w0Res), candidate: winnerOf(w0Res) } };
    c0 = winnerOf(w0Res);
  }
  const prep0 = prepare({ ...base, character });
  const without = { run: runOf(w0Res, reuse), candidate: c0, changes: changesOf(prep0.space, prep0.space.start, c0).map(stripChange) };
  if (signal?.aborted) return { ...out, status: 'cancelled', aborted: true, partial: true, without };

  // 2. with the drop, warm-started from W0's winner (legalised on the copy by prepare)
  progress('with');
  const w1Res = await inPhase(({ open }) => optimize({ ...base, character: withDrop, warmStarts: [c0] }, { signal, pool: open, onProgress: (p) => progress('with', p) }));
  if (w1Res.status === 'failed') return { ...out, status: 'failed', error: w1Res.error ?? 'The Optimiser could not run the preset with the drop.', without };
  if (w1Res.aborted) return { ...out, status: 'cancelled', aborted: true, partial: true, without };
  const c1 = winnerOf(w1Res);
  const prep1 = prepare({ ...base, character: withDrop, warmStarts: [c0] });
  const wearsDrop = equipSetKey({ equipmentSet: c1.equipmentSet }, realm) === setKey;
  const withRes = { run: runOf(w1Res), candidate: c1, wearsDrop, changes: changesOf(prep1.space, prep1.space.start, c1).map(stripChange) };

  // 3. confirm on a fresh seed: the drop's worth after both re-tunes, the re-tune alone, and the guards
  progress('confirm');
  const fC = prep0.space.fighterOf(prep0.space.start);
  const f0 = prep0.space.fighterOf(c0);
  const f1 = prep1.space.fighterOf(c1);
  const guardIds = guards.map((g) => g.id);
  const items = [
    { presetId: 'drop', before: f0, after: f1, goalIds: [goal.id] },
    { presetId: 'retune', before: fC, after: f0, goalIds: [goal.id] },
    ...(guardIds.length ? [{ presetId: 'guards', before: fC, after: f1, goalIds: guardIds }] : []),
  ];
  const cSeed = confirmSeed(seed);
  const confirm = await inPhase(({ sampleFor }) => runSwapMetrics(items, {
    goals: [{ ...goal, role: 'judge' }, ...guards], character, seed: cSeed, precision,
    ...(request.maxN ? { maxN: request.maxN } : {}), ...(request.n0 ? { n0: request.n0 } : {}),
  }, { signal, sampleFor, onProgress: (p) => progress('confirm', p) }));
  const byId = Object.fromEntries(confirm.results.map((r) => [r.presetId, r]));
  const dropGoal = byId.drop?.goals?.[0] ?? null;
  const retuneGoal = byId.retune?.goals?.[0] ?? null;
  const guardGoals = byId.guards?.goals ?? [];
  if (confirm.aborted && !dropGoal) return { ...out, status: 'cancelled', aborted: true, partial: true, without, with: withRes };

  // verdict: the drop's contrast and the guards, as a plain swap is judged (swap.js verdictFor); a re-tuned build
  // that moves the preset off the drop's set never wears it, so the drop is worth nothing to it
  const v = verdictFor({ closed: { pct: null }, rawDelta: {} }, { goals: [...(dropGoal ? [dropGoal] : []), ...guardGoals] });
  const verdict = !wearsDrop ? 'sidegrade' : v.verdict;
  return {
    ...out,
    status: confirm.aborted ? 'cancelled' : 'done',
    aborted: confirm.aborted,
    partial: confirm.aborted,
    verdict,
    reason: !wearsDrop ? 'unworn' : null,
    seed: { search: prep1.seeds, confirm: cSeed },
    drop: dropGoal,
    retune: retuneGoal,
    guards: guardGoals,
    guardNotes: v.guardNotes,
    without,
    with: withRes,
  };
}
