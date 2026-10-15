// features/dropBatch.js: "Import drops" for Drop Check. A loot-bag server response (or a full game
// profile, which carries the same `pendingItems`) becomes a list of candidate items for the current
// character, and every one is judged with the existing Drop Check evaluation (swap.js prepareSwap,
// the 'dropCheck' worker task, verdictFor). No metric of its own: this file only prepares the batch
// and ranks the verdicts the single-drop view already produces.
//
//   parseDropBatch(input, character)   JSON text or object -> {entries, skipped, source, error}
//   prepareBatch(character, entries)   -> {request, rows, offsets}: the dropCheck request for all of them
//   entryResults(offsets, rows, i, results)  the slice of the task's results belonging to entry i
//   judgeEntry(rows, results)          per equipment set (all presets wearing it), the best set's verdict
//   rankEntries(...)                   best verdict first
import { isGameProfile, mapItem } from '../model/gameProfile.js';
import { normaliseItem } from '../model/equipment.js';
import { dropAscension } from '../model/drop.js';
import { dropHasStats } from '../model/drop.js';
import { slotsForRealm } from '../game/gear.js';
import { prepareSwap, verdictFor, aggregateVerdict } from './swap.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Mirrors the Drop Check screen's simulated line (N, seconds), so a batch verdict matches the single view. */
export const BATCH_SIM = { seconds: 60, nSim: 32, seed: 1, precision: 'standard' };

/**
 * @typedef {Object} BatchEntry
 * @property {string} key       stable id within the batch (`<realm>:<index>`)
 * @property {string} name
 * @property {'base'|'oblivion'} realm
 * @property {string} slot
 * @property {Object} item      a normalised v2 Item (class-gated secondaries)
 * @property {number} dropped   secondaries the character's class or the rarity cannot hold, left off
 */

/**
 * Parse a loot bag. Accepts the batch shape `{pendingItems, realm, oblivionPendingItems}` and a full
 * game profile (its `pendingItems`). `pendingItems` are base-realm drops; `oblivionPendingItems` are
 * Oblivion drops and only count when the character's Oblivion is unlocked. Items of another class and
 * items that do not fit a slot are listed in `skipped` with the reason, never dropped silently.
 *
 * @param {string|object} input  JSON text or an already parsed value
 * @param {object} character  a normalised v2 Character
 * @returns {{entries: BatchEntry[], skipped: Array<{name: string, reason: string}>, source: 'batch'|'profile'|null, error: string|null}}
 */
export function parseDropBatch(input, character) {
  const fail = (error) => ({ entries: [], skipped: [], source: null, error });
  let json = input;
  if (typeof input === 'string') {
    if (!input.trim()) return fail('Paste the loot-bag JSON or load a .json file.');
    try {
      json = JSON.parse(input);
    } catch {
      return fail('That is not valid JSON.');
    }
  }
  if (!isObj(json)) return fail('Expected a loot-bag object with pendingItems.');
  const source = isGameProfile(json) ? 'profile' : 'batch';
  const base = json.pendingItems;
  const obl = json.oblivionPendingItems;
  if (!Array.isArray(base) && !Array.isArray(obl)) return fail('No pendingItems list found in that JSON.');

  const cls = character?.class ?? null;
  const unlocked = character?.oblivion?.unlocked === true;
  const entries = [];
  const skipped = [];

  const take = (list, realm) => {
    list.forEach((raw, i) => {
      const name = (isObj(raw) && typeof raw.name === 'string' && raw.name) || `Item ${i + 1}`;
      const skip = (reason) => skipped.push({ name, reason });
      if (!isObj(raw)) return skip('Not an item');
      if (realm === 'oblivion' && !unlocked) return skip('Oblivion is not unlocked for this character');
      const itemClass = typeof raw.class === 'string' ? raw.class.toUpperCase() : null;
      if (itemClass && cls && itemClass !== cls) return skip(`Item for another class (${itemClass})`);
      if (!slotsForRealm(realm).includes(raw.slot)) return skip(`Unknown ${realm === 'oblivion' ? 'Oblivion ' : ''}slot ${raw.slot ?? '(none)'}`);
      const mapped = mapItem(raw);
      const item = normaliseItem(mapped, { cls, realm, ascension: dropAscension(character) });
      if (!item || !dropHasStats(item)) return skip('No stats');
      const dropped = Math.max(0, mapped.secondaryStats.length - item.secondaryStats.length);
      entries.push({ key: `${realm}:${i}`, name, realm, slot: raw.slot, item, dropped });
    });
  };
  if (Array.isArray(base)) take(base, 'base');
  if (Array.isArray(obl)) take(obl, 'oblivion');
  return { entries, skipped, source, error: null };
}

/**
 * The dropCheck task request for every entry against every preset (sim DPS only), plus the prepared
 * rows to judge with. The unchanged "before" of a preset is simulated once and shared (`baseKey`).
 * @returns {{request: object|null, rows: Array<Array<object>>, offsets: number[]}}
 *   `rows[i]` are entry i's prepareSwap rows; `offsets[i]` is where they start in the request's items
 */
export function prepareBatch(character, entries) {
  const rows = [];
  const offsets = [];
  const items = [];
  for (const e of entries) {
    const r = prepareSwap(character, { slot: e.slot, item: e.item, realm: e.realm });
    offsets.push(items.length);
    rows.push(r);
    for (const row of r) items.push({ presetId: row.presetId, baseKey: `${e.realm}:${row.presetId}`, before: row.before, after: row.after });
  }
  const request = items.length ? { mode: 'dropCheck', items, sim: true, ...BATCH_SIM } : null;
  return { request, rows, offsets };
}

/** Entry i's slice of a flat dropCheck `results` array; null where the run has not got to it. */
export function entryResults(offsets, rows, i, results) {
  return rows[i].map((_, k) => {
    const r = results?.[offsets[i] + k];
    return r?.sim ? r : null;
  });
}

const VERDICT_RANK = { upgrade: 4, mixed: 3, inconclusive: 2, sidegrade: 1, downgrade: 0 };

/** Percent change of a row: the simulated DPS delta over its starting DPS, else the closed form. */
function scoreOf(row, res) {
  if (res?.sim) {
    const base = res.sim.before.mean;
    return base > 0 ? (res.sim.delta.delta / base) * 100 : 0;
  }
  return row.closed.pct ?? 0;
}

/**
 * The best verdict across the equipment sets an item could go into. Applying a drop writes to a whole
 * set, so every preset wearing that set is judged together (aggregateVerdict, as the single view does):
 * an item that helps one preset and hurts another on the same set is `mixed` (#97). Sets rank
 * upgrade, mixed, inconclusive, sidegrade, downgrade; ties go to the larger mean DPS change. Rows without
 * a finished simulation are judged on the closed form (`basis: 'closed'`, an estimate).
 *
 * @param {Array<object>} rows  the item's prepareSwap rows
 * @param {Array<object|null>} results  per row, its runSwapMetrics result or null
 * @returns {{verdict: string, basis: 'sim'|'closed', score: number, row: object, sim: object|null,
 *   setKey: string, presetCount: number, upgrades: number, coverage: string[], coverageLabel: string,
 *   notJudged: string[], sets: Array<{setKey: string, verdict: string, score: number, presetCount: number}>}|null}
 *   `row` is the set's row with the largest change (what the list shows); `score` the set's mean change in percent
 */
export function judgeEntry(rows, results = []) {
  const bySet = new Map();
  rows.forEach((row, k) => {
    if (!bySet.has(row.setKey)) bySet.set(row.setKey, []);
    const res = results[k] ?? null;
    bySet.get(row.setKey).push({ row, res, v: verdictFor(row, res), score: scoreOf(row, res) });
  });
  const sets = [...bySet.entries()].map(([setKey, members]) => {
    const verdict = aggregateVerdict(members.map((m) => m.v.verdict));
    const score = members.reduce((a, m) => a + m.score, 0) / members.length;
    const lead = members.reduce((a, m) => (m.score > a.score ? m : a), members[0]);
    const coverage = [...new Set(members.flatMap((m) => m.v.coverage))];
    return {
      setKey, verdict, score, lead, members, coverage,
      basis: members.every((m) => m.v.basis === 'sim') ? 'sim' : 'closed',
    };
  });
  let best = null;
  for (const s of sets) {
    if (!best || VERDICT_RANK[s.verdict] > VERDICT_RANK[best.verdict]
      || (VERDICT_RANK[s.verdict] === VERDICT_RANK[best.verdict] && s.score > best.score)) best = s;
  }
  if (!best) return null;
  const notJudged = [...new Set(best.members.flatMap((m) => m.v.notJudged))];
  return {
    verdict: best.verdict,
    basis: best.basis,
    score: best.score,
    row: best.lead.row,
    sim: best.lead.res?.sim ?? null,
    setKey: best.setKey,
    presetCount: best.members.length,
    upgrades: best.members.filter((m) => m.v.verdict === 'upgrade').length,
    coverage: best.coverage,
    coverageLabel: best.members[0].v.coverageLabel,
    notJudged,
    sets: sets.map((s) => ({ setKey: s.setKey, verdict: s.verdict, score: s.score, presetCount: s.members.length })),
  };
}

/** Entries with their judgement, best first (verdict, then DPS change; import order breaks ties). */
export function rankEntries(entries, rows, offsets, results) {
  return entries
    .map((entry, i) => ({ entry, order: i, best: judgeEntry(rows[i], entryResults(offsets, rows, i, results)) }))
    .sort((a, b) => {
      const ra = a.best ? VERDICT_RANK[a.best.verdict] : -1;
      const rb = b.best ? VERDICT_RANK[b.best.verdict] : -1;
      return rb - ra || (b.best?.score ?? 0) - (a.best?.score ?? 0) || a.order - b.order;
    });
}
