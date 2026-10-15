// features/dropBatch.js: "Import drops" for Drop Check. A loot-bag server response (or a full game
// profile, which carries the same `pendingItems`) becomes a list of candidate items for the current
// character, and every one is judged with the existing Drop Check evaluation (swap.js prepareSwap,
// the 'dropCheck' worker task, verdictFor). No metric of its own: this file only prepares the batch
// and ranks the verdicts the single-drop view already produces.
//
//   parseDropBatch(input, character)   JSON text or object -> {entries, skipped, source, error}
//   prepareBatch(character, entries)   -> {request, rows, offsets}: the dropCheck request for all of them
//   entryResults(offsets, rows, i, results)  the slice of the task's results belonging to entry i
//   judgeEntry(rows, results)          best verdict across that item's presets/sets, with its key delta
//   rankEntries(...)                   best verdict first
import { isGameProfile, mapItem } from '../model/gameProfile.js';
import { normaliseItem } from '../model/equipment.js';
import { dropAscension } from '../model/drop.js';
import { dropHasStats } from '../model/drop.js';
import { slotsForRealm } from '../game/gear.js';
import { prepareSwap, verdictFor } from './swap.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Mirrors the Drop Check screen's simulated line (N, seconds), so a batch verdict matches the single view. */
export const BATCH_SIM = { seconds: 60, nSim: 32, seed: 1 };

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

const VERDICT_RANK = { upgrade: 3, mixed: 2, sidegrade: 1, downgrade: 0 };

/** Percent change of a row: the simulated DPS delta over its starting DPS, else the closed form. */
function scoreOf(row, res) {
  if (res?.sim) {
    const base = res.sim.before.mean;
    return base > 0 ? (res.sim.delta.delta / base) * 100 : 0;
  }
  return row.closed.pct ?? 0;
}

/**
 * The best verdict across an item's presets (and so sets): upgrade over mixed over sidegrade over
 * downgrade, ties broken by the size of the DPS change. Rows without a finished simulation are judged
 * on the closed form (`basis: 'closed'`), exactly as the single-drop view does while it waits.
 * @param {Array<object>} rows  the item's prepareSwap rows
 * @param {Array<object|null>} results  per row, its runSwapMetrics result or null
 * @returns {{verdict: string, basis: 'sim'|'closed', score: number, row: object, sim: object|null,
 *   presetCount: number, upgrades: number}|null}
 */
export function judgeEntry(rows, results = []) {
  let best = null;
  let upgrades = 0;
  rows.forEach((row, k) => {
    const res = results[k] ?? null;
    const v = verdictFor(row, res);
    if (v.verdict === 'upgrade') upgrades += 1;
    const cand = { verdict: v.verdict, basis: v.basis, score: scoreOf(row, res), row, sim: res?.sim ?? null };
    if (!best || VERDICT_RANK[cand.verdict] > VERDICT_RANK[best.verdict]
      || (VERDICT_RANK[cand.verdict] === VERDICT_RANK[best.verdict] && cand.score > best.score)) best = cand;
  });
  return best ? { ...best, presetCount: rows.length, upgrades } : null;
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
