/**
 * transcendence.js - pure board-graph logic for the Transcendence boards (no Svelte, no store
 * access). Id-based and sync (rebuild-plan B7); the catalogue is game/transcendence.js and the
 * rules are docs/Reference/Game/transcendence.md §2, §6, §7, §8.
 */

import { transcendenceBoard, transcendenceBoardKeyForSpec, TRANSCENDENCE_COST_BRACKETS, TRANSCENDENCE_CONSTANTS } from './game/transcendence.js';

const ALLOCATABLE_KINDS = new Set(['minor', 'notable', 'sigil']);
const DEFAULT_BOARD_BY_CLASS = {
  WARRIOR: 'WARRIOR',
  SENTINEL: 'SENTINEL',
  MYSTIC: 'MYSTIC/MAGE',
  NECROMANCER: 'NECROMANCER/DOOMWEAVER',
};

/** Core is free and pre-owned; sockets are inert in 2.7.0 (doc §7). */
export const isAllocatableKind = (kind) => ALLOCATABLE_KINDS.has(kind);

/**
 * Board key for a class and (optional) spec key. Without a usable spec this is the class's default
 * flavour (Mage / Doomweaver), which has the same geometry as every other board of the class.
 */
export function boardKeyFor(cls, spec = null) {
  const bySpec = spec ? transcendenceBoardKeyForSpec(spec) : null;
  if (bySpec && (!cls || bySpec.split('/')[0] === cls)) return bySpec;
  return DEFAULT_BOARD_BY_CLASS[cls] ?? null;
}

const indexCache = new Map();

/** { byId, byCell, neighbors: Map<id, id[]>, coreId } for a board key, built once (doc §2: orthogonal links). */
export function boardGraph(boardKey) {
  if (indexCache.has(boardKey)) return indexCache.get(boardKey);
  const board = transcendenceBoard(boardKey);
  if (!board) return null;
  const byId = new Map(board.nodes.map((n) => [n.id, n]));
  const byCell = new Map(board.nodes.map((n) => [`${n.col},${n.row}`, n.id]));
  const neighbors = new Map(board.nodes.map((n) => [n.id, []]));
  for (const n of board.nodes) {
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const other = byCell.get(`${n.col + dc},${n.row + dr}`);
      if (other) {
        neighbors.get(n.id).push(other);
        neighbors.get(other).push(n.id);
      }
    }
  }
  const graph = { byId, byCell, neighbors, coreId: 'core' };
  indexCache.set(boardKey, graph);
  return graph;
}

/** Node id for a (col,row) cell on a board, or null. */
export function nodeIdAt(boardKey, col, row) {
  return boardGraph(boardKey)?.byCell.get(`${col},${row}`) ?? null;
}

/** Core is always reachable; any other node needs a linked core or allocated neighbour (doc §7). */
export function isReachable(boardKey, id, allocated) {
  const g = boardGraph(boardKey);
  if (!g || !g.byId.has(id)) return false;
  if (id === g.coreId) return true;
  const set = allocated instanceof Set ? allocated : new Set(allocated);
  return g.neighbors.get(id).some((n) => n === g.coreId || set.has(n));
}

/** Ids connected to the core through `ids` (flood fill, core excluded from the result). */
function connectedToCore(g, ids) {
  const set = new Set(ids);
  const seen = new Set();
  const queue = [g.coreId];
  while (queue.length) {
    const cur = queue.pop();
    for (const n of g.neighbors.get(cur)) {
      if (set.has(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Removal is allowed only if every other allocated node stays connected to the core (doc §7). */
export function canRemoveNode(boardKey, allocatedIds, id) {
  const g = boardGraph(boardKey);
  if (!g || id === g.coreId || !allocatedIds.includes(id)) return false;
  const rest = allocatedIds.filter((x) => x !== id);
  return connectedToCore(g, rest).size === rest.length;
}

/** Whether `id` can be newly allocated: allocatable kind, not owned, reachable. */
export function canAllocateNode(boardKey, allocatedIds, id) {
  const g = boardGraph(boardKey);
  const node = g?.byId.get(id);
  if (!node || !isAllocatableKind(node.kind) || allocatedIds.includes(id)) return false;
  return isReachable(boardKey, id, allocatedIds);
}

/**
 * Repair an arbitrary id list for a board: drop unknown, non-allocatable and duplicate ids, then
 * anything not connected to the core. Survivor order is kept (the total is order independent, doc §6).
 */
export function sanitiseAllocation(boardKey, ids) {
  const g = boardGraph(boardKey);
  if (!g || !Array.isArray(ids)) return [];
  const seen = new Set();
  const valid = [];
  for (const id of ids) {
    const node = typeof id === 'string' ? g.byId.get(id) : null;
    if (!node || !isAllocatableKind(node.kind) || seen.has(id)) continue;
    seen.add(id);
    valid.push(id);
  }
  const connected = connectedToCore(g, valid);
  return valid.filter((id) => connected.has(id));
}

/** Price of the n-th (1-indexed) filled slot (doc §6 brackets). */
export function slotPrice(n) {
  return TRANSCENDENCE_COST_BRACKETS.find((x) => x.upTo == null || n <= x.upTo).cost;
}

/** Slots a node fills: minor 1, notable 3, everything else 0 (sigil is flat priced). */
export function slotWeight(kind) {
  if (kind === 'minor') return 1;
  if (kind === 'notable') return TRANSCENDENCE_CONSTANTS.notableCostMultiplier;
  return 0;
}

/** Cost of a node whose first slot would be count+1 (doc §6 nextNodeCost). */
export function nextNodeCost(count, kind) {
  if (kind === 'sigil') return TRANSCENDENCE_CONSTANTS.sigilIchorCost;
  let c = 0;
  for (let k = 1; k <= slotWeight(kind); k++) c += slotPrice(count + k);
  return c;
}

/** Total Ichor in use by an allocation (doc §6 setTotalCost). Unknown ids and the core are skipped. */
export function setTotalCost(boardKey, ids) {
  const g = boardGraph(boardKey);
  if (!g) return 0;
  let count = 0;
  let total = 0;
  for (const id of ids) {
    const node = g.byId.get(id);
    if (!node || id === g.coreId) continue;
    total += nextNodeCost(count, node.kind);
    count += slotWeight(node.kind);
  }
  return total;
}

/** Marginal price of allocating `id` on top of `ids`. */
export function allocCost(boardKey, ids, id) {
  return setTotalCost(boardKey, [...ids, id]) - setTotalCost(boardKey, ids);
}

/** Ichor freed by removing `id` from `ids`. */
export function removeRefund(boardKey, ids, id) {
  return setTotalCost(boardKey, ids) - setTotalCost(boardKey, ids.filter((x) => x !== id));
}

/** Total cost if every id is allocatable and connected to the core, else null (doc §7 validateAllocation). */
export function validateAllocation(boardKey, ids) {
  const g = boardGraph(boardKey);
  if (!g) return null;
  for (const id of ids) {
    const node = g.byId.get(id);
    if (!node || !isAllocatableKind(node.kind)) return null;
  }
  if (connectedToCore(g, ids).size !== new Set(ids).size) return null;
  return setTotalCost(boardKey, ids);
}

/** { got, total } of allocatable nodes on one side ('attack' | 'defense') (doc §7). */
export function sideProgress(boardKey, side, ids) {
  const g = boardGraph(boardKey);
  if (!g) return { got: 0, total: 0 };
  const set = new Set(ids);
  let got = 0;
  let total = 0;
  for (const n of g.byId.values()) {
    if (n.side !== side || !isAllocatableKind(n.kind)) continue;
    total++;
    if (set.has(n.id)) got++;
  }
  return { got, total };
}

/** Sum of node stats over the allocated ids; unknown ids and the core contribute nothing (doc §8). */
export function transcendenceBonuses(boardKey, ids) {
  const g = boardGraph(boardKey);
  const out = {};
  if (!g) return out;
  for (const id of ids) {
    if (id === g.coreId) continue;
    for (const s of g.byId.get(id)?.stats ?? []) out[s.stat] = (out[s.stat] ?? 0) + s.value;
  }
  return out;
}
