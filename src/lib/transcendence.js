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
