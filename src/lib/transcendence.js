/**
 * transcendence.js - pure adjacency/reachability/cost logic for the
 * Transcendence tree (no Svelte, no store access - unit-testable in
 * isolation, same split as dps.js/totals.js from the UI layer).
 *
 * The rules this implements - sparse grid, orthogonal-adjacency unlocking,
 * glyph sockets excluded from the walkable graph, the start position having
 * no prerequisite, and the slot-tiered Ichor cost - are documented in
 * docs/Reference/game-systems.md §1. The cost VALUES live in constants.js
 * (TRANSCENDENCE_COST_TIERS). Neither is restated here.
 */

import { transcendenceBoard, transcendenceBoardKeyForSpec, TRANSCENDENCE_COST_BRACKETS, TRANSCENDENCE_CONSTANTS } from './game/transcendence.js';
import { TRANSCENDENCE_COST_TIERS, TRANSCENDENCE_SIGIL_COST, TRANSCENDENCE_UNCOMMON_SLOTS } from './constants.js';

/** "14:25" -> { col: 14, row: 25 }. */
export function parsePosition(position) {
  const [col, row] = position.split(':').map(Number);
  return { col, row };
}

/** { col: 14, row: 25 } -> "14:25". */
export function positionKey(col, row) {
  return `${col}:${row}`;
}

/** Orthogonal, distance-1 only - no diagonal, no skipping. */
export function isAdjacent(posA, posB) {
  const a = parsePosition(posA);
  const b = parsePosition(posB);
  const dCol = Math.abs(a.col - b.col);
  const dRow = Math.abs(a.row - b.row);
  return (dCol === 1 && dRow === 0) || (dCol === 0 && dRow === 1);
}

/** Map of every node in `tree`, keyed by position - built once per call site, not cached on the tree. */
export function indexNodesByPosition(tree) {
  return new Map(tree.nodes.map((n) => [n.position, n]));
}

/** Every orthogonal neighbor position of `position` that's a real, walkable (non-glyph) node, per `byPosition`. */
export function walkableNeighbors(position, byPosition) {
  const { col, row } = parsePosition(position);
  const candidates = [positionKey(col + 1, row), positionKey(col - 1, row), positionKey(col, row + 1), positionKey(col, row - 1)];
  return candidates.filter((p) => {
    const node = byPosition.get(p);
    return node && node.type !== 'glyph';
  });
}

/** The set of positions currently unlocked - a plain wrapper, kept as a named function since every call site reads it the same way. */
export function effectiveUnlockedSet(unlockedPositions) {
  return new Set(unlockedPositions);
}

/**
 * Whether `position` can be newly unlocked: it must be a real node in the
 * tree, not a glyph socket (inert), not already unlocked, and either *is*
 * the tree's start position (the one node with no prerequisite - it has to
 * be the first thing a player unlocks, not something granted for free) or
 * orthogonally adjacent to some position already unlocked.
 */
export function canUnlock(position, unlockedPositions, tree) {
  const byPosition = indexNodesByPosition(tree);
  const node = byPosition.get(position);
  if (!node || node.type === 'glyph') return false;
  const unlockedSet = effectiveUnlockedSet(unlockedPositions);
  if (unlockedSet.has(position)) return false;
  if (position === tree.startPosition) return true;
  return walkableNeighbors(position, byPosition).some((n) => unlockedSet.has(n));
}

/** BFS: every position in `walkableSet` reachable from `start` via orthogonal adjacency, start included. */
export function reachableFrom(start, walkableSet, tree) {
  const byPosition = indexNodesByPosition(tree);
  const walkable = walkableSet instanceof Set ? walkableSet : new Set(walkableSet);
  if (!walkable.has(start)) return new Set();
  const visited = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const neighbor of walkableNeighbors(current, byPosition)) {
      if (walkable.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return visited;
}

/** Tiered Ichor price of the Nth (1-indexed) slot alone. */
function tierPrice(n) {
  const tier = TRANSCENDENCE_COST_TIERS.find((t) => n <= t.upTo);
  return tier ? tier.cost : TRANSCENDENCE_COST_TIERS[TRANSCENDENCE_COST_TIERS.length - 1].cost;
}

/** How many tiered slots a common/uncommon node fills: uncommon (big) nodes fill 3 at once. */
export function slotsForNode(isUncommon) {
  return isUncommon ? TRANSCENDENCE_UNCOMMON_SLOTS : 1;
}

/**
 * Tiered Ichor cost of a node whose FIRST slot is the Nth (1-indexed).
 * Commons pay slot n's price; uncommon (big) nodes fill the next 3 slots at
 * once and pay those 3 slot prices combined (which can straddle a tier
 * boundary, e.g. slots 4+5+6 = 1+2+2 = 5).
 */
export function costForCount(n, isUncommon) {
  let cost = 0;
  for (let i = 0; i < slotsForNode(isUncommon); i++) cost += tierPrice(n + i);
  return cost;
}

/** Flat Ichor cost of an Ancient Sigil - not part of the tiered common/uncommon count. */
export function costForSigil() {
  return TRANSCENDENCE_SIGIL_COST;
}

/**
 * Replays `unlockedPositions` (in unlock order) through the tiered cost
 * table to produce the running Ichor-spent total shown in the UI (info
 * only - not gated against an owned balance). Commons consume the next
 * tiered slot, uncommons the next 3; sigils cost a flat 30 and don't
 * advance the tiered slot count.
 */
export function totalIchorSpent(unlockedPositions, tree) {
  const byPosition = indexNodesByPosition(tree);
  let spent = 0;
  let slotsFilled = 0;
  for (const position of unlockedPositions) {
    const node = byPosition.get(position);
    if (!node) continue;
    if (node.type === 'sigil') {
      spent += costForSigil();
    } else if (node.type === 'common' || node.type === 'uncommon') {
      const isUncommon = node.type === 'uncommon';
      spent += costForCount(slotsFilled + 1, isUncommon);
      slotsFilled += slotsForNode(isUncommon);
    }
  }
  return spent;
}

// ---------------------------------------------------------------------------------------------
// v2 board graph (rebuild-plan B7). Pure, sync, id-based; the catalogue is game/transcendence.js
// and the rules are docs/Reference/Game/transcendence.md §2, §6, §7, §8. Everything above this line
// is the v1 position-based API, kept only until the legacy model/totals/optimizer modules go.
// ---------------------------------------------------------------------------------------------

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
