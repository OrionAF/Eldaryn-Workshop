// features/dropCombo.js: the loot bag's best combination (simulation.md §Drop Check, Best combination).
// A plain batch judges every drop alone against the gear as saved. Gear stats interact (caps, crit chance with
// crit damage, a guard one item breaks and another restores), so a drop's worth depends on what else is worn.
// Per equipment set this climbs from the saved gear:
//
//   1. Alone:    every drop against the saved gear. These are the batch's own comparisons (same items, same
//                seed), so `results` is exactly what the 'dropCheck' task returns for the request.
//   2. Combine:  put the best clear upgrade on, then judge every other drop against that new gear (a drop for a
//                taken slot replaces its pick; with two or more picks, taking one off again is a move too). Repeat
//                until no move is an upgrade.
//   3. Confirm:  a combination of more than one step against the saved gear on a fresh seed, never the search
//                seed: each step was the best of many on those fights, so its gain there is flattered.
//
// A move is taken only when the set's verdict is a simulated `upgrade` with no caveat (dropBatch.js judgeEntry: nothing
// worsens, nothing is unresolved, no guard fails; an upgrade that leaves a goal too close to call is shown in the
// list but never stacked), so the climb never trades one goal for another. It tests one move at a
// time: two drops that only pay off together are not found. Pure over swap.js; runs in the worker
// (tasks/dropCombo.js). Cancelling keeps the finished alone pass and the picks so far.
import { hashSeed } from '../engine/rng.js';
import { EQUIP_SET_KEYS, realmOfSet } from '../model/equipment.js';
import { swapBuilder, runSwapMetrics } from './swap.js';
import { judgeEntry } from './dropBatch.js';

/** Passes over the bag at most (the alone pass is the first): the climb stops `capped` after this many. */
export const COMBO_ROUNDS_MAX = 12;
/** The seed of the confirmation, derived apart from the search seed. */
export const comboConfirmSeed = (seed) => hashSeed('drop-combo-confirm', seed);

const PHASES = [['singles', 'Each drop alone'], ['combine', 'Combination'], ['confirm', 'Confirm']];
const isLive = (it) => !it.goalIds || it.goalIds.length > 0;
const configKey = (chosen) => [...chosen].map(([slot, key]) => `${slot}=${key}`).sort().join(',');
const stripRow = ({ presetId, name, setKey, method, approx, closed, rawDelta }) => ({ presetId, name, setKey, method, approx, closed, rawDelta });
const usable = (r) => (r?.goals?.length || r?.noGoals ? r : null);

function judge(rows, results) {
  const j = judgeEntry(rows, results.map(usable));
  return j ? { verdict: j.verdict, score: j.score, basis: j.basis, caveat: j.caveat } : null;
}

/**
 * @param {{
 *   items: Array<{presetId: string, entry: string, setKey: string, before: Object, after: Object, baseKey?: string, goalIds?: string[]}>,
 *   entries: Array<{key: string, slot: string, realm: 'base'|'oblivion', item: Object}>,
 *   goals: Object[], character: Object, sets?: 'all'|'set1', partner?: Object|null,
 *   pools?: Array<{id: string, entries: string[]}>,
 *   seed?: number, precision?: string, maxN?: number, n0?: number, maxRounds?: number,
 * }} request  a 'dropCheck' request (dropBatch.js prepareBatch with `combine`) whose items name their entry and
 *   set, plus the entries themselves and the character the later passes are built from. `pools` (entry keys) climbs
 *   each pool on its own: a loot bag with Quality 100 variants has `dropped` and `q100` (dropBatch.js)
 * @param {{signal?: AbortSignal, onProgress?: Function, sampleFor?: Function, onGoalDone?: Function}} [hooks]
 *   as runSwapMetrics takes them; progress adds `phases` (alone, combination, confirm) and `round`
 * @returns {Promise<{results: Object[], combo: Object|null, aborted: boolean}>}  `results` as the 'dropCheck' task;
 *   `combo` (`drop-combo/1`, null when the alone pass did not finish): simulation.md §Drop Check, Best combination
 */
export async function dropCombo(request, { signal, onProgress, sampleFor, onGoalDone } = {}) {
  const { items, entries, goals, character } = request ?? {};
  if (!Array.isArray(items)) throw new Error('dropCombo: items is required');
  if (!Array.isArray(entries)) throw new Error('dropCombo: entries is required');
  if (!Array.isArray(goals)) throw new Error('dropCombo: goals is required');
  if (!character) throw new Error('dropCombo: character is required');
  for (const it of items) if (!it?.before || !it?.after) throw new Error('dropCombo: every item needs before and after Fighters');
  const { sets = 'all', seed = 1, precision = 'standard' } = request;
  const sim = { goals, character, partner: request.partner ?? null, precision, ...(request.maxN ? { maxN: request.maxN } : {}), ...(request.n0 ? { n0: request.n0 } : {}) };
  const maxRounds = Number.isInteger(request.maxRounds) && request.maxRounds >= 1 ? request.maxRounds : COMBO_ROUNDS_MAX;
  const entryOf = new Map(entries.map((e) => [e.key, e]));
  const changesOf = (chosen) => [...chosen].map(([slot, key]) => ({ slot, item: entryOf.get(key).item }));

  let phase = 'singles';
  let round = 1;
  const report = (p = null) => {
    const at = PHASES.findIndex(([id]) => id === phase);
    onProgress?.({
      phase, round,
      phases: PHASES.map(([id, label], i) => ({
        id, label, state: i < at ? 'done' : i === at ? 'current' : 'queued',
        done: i === at ? p?.done ?? null : null, total: i === at ? p?.total ?? null : null,
      })),
      ...(p ? { done: p.done, total: p.total } : {}),
    });
  };
  const run = (its, sd) => runSwapMetrics(its, { ...sim, seed: sd }, { signal, sampleFor, onGoalDone, onProgress: report });

  // 1. alone: the batch itself
  report();
  const first = await run(items, seed);
  if (first.aborted) return { results: first.results, combo: null, aborted: true };

  /**
   * Per pool and equipment set: the presets a goal judges, each entry's alone comparisons, and the climb's state.
   * A pool is a set of entries that are candidates together; without `pools` every entry is in the one pool.
   */
  const pools = Array.isArray(request.pools) && request.pools.length
    ? request.pools.map((p) => ({ id: p.id, keys: new Set(p.entries) }))
    : [{ id: null, keys: null }];
  const stateId = (pool, setKey) => `${pool.id ?? ''}|${setKey}`;
  const states = new Map();
  for (const pool of pools) {
    items.forEach((it, i) => {
      const e = entryOf.get(it.entry);
      if (!e || !EQUIP_SET_KEYS.includes(it.setKey) || (pool.keys && !pool.keys.has(e.key))) return;
      const id = stateId(pool, it.setKey);
      if (!states.has(id)) {
        states.set(id, {
          id, pool: pool.id, setKey: it.setKey, realm: realmOfSet(it.setKey), goalIdsOf: new Map(), trials: new Map(), alone: new Map(),
          chosen: new Map(), visited: new Set(['']), steps: [], onTop: null, active: false, status: 'none', total: null,
        });
      }
      const s = states.get(id);
      if (isLive(it) && !s.goalIdsOf.has(it.presetId)) s.goalIdsOf.set(it.presetId, it.goalIds ?? null);
      if (!s.trials.has(e.key)) s.trials.set(e.key, { rows: [], results: [], live: false });
      const t = s.trials.get(e.key);
      t.rows.push({ presetId: it.presetId, setKey: it.setKey, closed: { pct: null }, rawDelta: {} });
      t.results.push(first.results[i] ?? null);
      t.live ||= isLive(it);
    });
  }

  /** The best move that is a simulated upgrade and leads to gear the climb has not worn yet. */
  const pick = (s, moves) => {
    let best = null;
    for (const m of moves) {
      if (m.judged?.verdict !== 'upgrade' || m.judged.caveat?.length || m.judged.basis !== 'sim' || s.visited.has(configKey(m.next))) continue;
      if (!best || m.judged.score > best.judged.score) best = m;
    }
    return best;
  };
  const accept = (s, m) => {
    s.steps.push({ round, move: m.kind, entry: m.key, slot: m.slot, replaces: m.kind === 'equip' ? s.chosen.get(m.slot) ?? null : null, score: m.judged.score });
    s.chosen = m.next;
    s.visited.add(configKey(m.next));
    s.onTop = null;
    s.active = true;
  };

  for (const s of states.values()) {
    s.candidates = [...s.trials].filter(([, t]) => t.live).map(([key]) => key);
    const moves = s.candidates.map((key) => {
      const t = s.trials.get(key);
      const judged = judge(t.rows, t.results);
      s.alone.set(key, judged);
      return { kind: 'equip', key, slot: entryOf.get(key).slot, next: new Map([[entryOf.get(key).slot, key]]), judged };
    });
    const best = pick(s, moves);
    if (best) accept(s, best);
    else s.onTop = new Map(s.candidates.map((key) => [key, s.alone.get(key)?.verdict ?? null]));
  }

  // 2. combine: every other move against the gear picked so far, one pass per accepted step
  const builders = {};
  const builderOf = (realm) => (builders[realm] ??= swapBuilder(character, { realm, sets }));
  const wearers = (s) => builderOf(s.realm).presets.filter((p) => p.setKey === s.setKey);
  const judgedPresets = (s) => wearers(s).filter((p) => s.goalIdsOf.has(p.presetId));
  // a preset no goal judges runs nothing (`noGoals`); null ids mean every goal
  const itemsOf = (s, rows) => rows.map((r) => {
    const ids = s.goalIdsOf.has(r.presetId) ? s.goalIdsOf.get(r.presetId) : [];
    return { presetId: r.presetId, baseKey: `${s.id}|${r.presetId}`, ...(ids ? { goalIds: ids } : {}), before: r.before, after: r.after };
  });
  const active = () => [...states.values()].filter((s) => s.active);
  let aborted = false;
  phase = 'combine';
  while (active().length) {
    if (round >= maxRounds) {
      for (const s of active()) Object.assign(s, { active: false, status: 'capped' });
      break;
    }
    round += 1;
    const batch = [];
    for (const s of active()) {
      const b = builderOf(s.realm);
      const presets = judgedPresets(s);
      const from = changesOf(s.chosen);
      s.moves = [];
      for (const key of s.candidates) {
        const { slot } = entryOf.get(key);
        if (s.chosen.get(slot) !== key) s.moves.push({ kind: 'equip', key, slot, next: new Map(s.chosen).set(slot, key) });
      }
      if (s.chosen.size > 1) {
        for (const [slot, key] of s.chosen) {
          const next = new Map(s.chosen);
          next.delete(slot);
          s.moves.push({ kind: 'revert', key, slot, next });
        }
      }
      for (const m of s.moves) {
        if (s.visited.has(configKey(m.next))) continue;
        m.rows = presets.map((p) => b.row(p, changesOf(m.next), from));
        m.at = batch.length;
        batch.push(...itemsOf(s, m.rows));
      }
    }
    if (!batch.length) {
      for (const s of active()) Object.assign(s, { active: false, status: 'done', onTop: new Map() });
      break;
    }
    report();
    const res = await run(batch, seed);
    if (res.aborted) {
      aborted = true;
      for (const s of active()) Object.assign(s, { active: false, status: 'cancelled' });
      break;
    }
    for (const s of active()) {
      const onTop = new Map();
      for (const m of s.moves) {
        if (!m.rows) continue;
        m.judged = judge(m.rows, res.results.slice(m.at, m.at + m.rows.length));
        if (m.kind === 'equip') onTop.set(m.key, m.judged?.verdict ?? null);
      }
      const best = pick(s, s.moves);
      if (best) accept(s, best);
      else Object.assign(s, { active: false, status: 'done', onTop });
    }
  }

  // 3. confirm: the whole combination against the saved gear, on a fresh seed when it took more than one step
  phase = 'confirm';
  const cSeed = comboConfirmSeed(seed);
  const confirm = [];
  for (const s of states.values()) {
    if (!s.chosen.size) continue;
    const b = builderOf(s.realm);
    // every preset wearing the set, judged or not: applying the combination changes them all
    s.totalRows = wearers(s).map((p) => b.row(p, changesOf(s.chosen)));
    if (s.steps.length === 1) {
      // one drop: its alone comparison is the total
      const t = s.trials.get(s.steps[0].entry);
      const results = s.totalRows.map((r) => t.results[t.rows.findIndex((x) => x.presetId === r.presetId)] ?? null);
      s.total = { results, confirmed: false };
    } else if (s.status !== 'cancelled') {
      s.confirmAt = confirm.length;
      confirm.push(...itemsOf(s, s.totalRows).map(({ baseKey: _shared, ...it }) => it));
    }
  }
  if (confirm.length && !aborted) {
    report();
    const res = await run(confirm, cSeed);
    if (res.aborted) aborted = true;
    else for (const s of states.values()) if (s.confirmAt != null) s.total = { results: res.results.slice(s.confirmAt, s.confirmAt + s.totalRows.length), confirmed: true };
  }

  /** Entries picked by more than one set of a pool. */
  const sharedIn = (poolId) => {
    const picked = [...states.values()].filter((s) => s.pool === poolId).flatMap((s) => [...s.chosen.values()]);
    return [...new Set(picked.filter((key, i) => picked.indexOf(key) !== i))];
  };
  const verdicts = (m) => Object.fromEntries([...m].map(([key, v]) => [key, typeof v === 'string' ? v : v?.verdict ?? null]));
  const combo = {
    schema: 'drop-combo/1',
    seed: { search: seed, confirm: cSeed },
    rounds: round,
    sets: pools.flatMap((pool) => EQUIP_SET_KEYS.map((k) => states.get(stateId(pool, k))).filter(Boolean)).map((s) => {
      const lastStep = (key) => s.steps.findLastIndex((st) => st.move === 'equip' && st.entry === key);
      const judged = s.total ? judge(s.totalRows, s.total.results) : null;
      const shared = sharedIn(s.pool);
      return {
        ...(s.pool != null ? { pool: s.pool } : {}),
        setKey: s.setKey,
        realm: s.realm,
        status: s.status,
        picks: [...s.chosen].sort(([, a], [, b]) => lastStep(a) - lastStep(b)).map(([slot, key]) => ({ entry: key, slot, alone: s.alone.get(key)?.verdict ?? null, ...(s.pool != null && shared.includes(key) ? { shared: true } : {}) })),
        steps: s.steps,
        alone: verdicts(s.alone),
        onTop: s.onTop ? verdicts(s.onTop) : null,
        total: s.total ? { rows: s.totalRows.map(stripRow), results: s.total.results, confirmed: s.total.confirmed, verdict: judged?.verdict ?? null, score: judged?.score ?? null } : null,
      };
    }),
    shared: [...new Set(pools.flatMap((pool) => sharedIn(pool.id)))],
  };
  return { results: first.results, combo, aborted };
}
