// Search allocations on existing boards; graph and cost rules: Game/transcendence.md §6–9.
import { boardKeyFor, boardGraph, isAllocatableKind, canAllocateNode, canRemoveNode, sanitiseAllocation, setTotalCost } from '../transcendence.js';
import { effectiveTranscendencePreset } from '../model/legality.js';
import { sigilBySpecies } from '../game/sigils.js';

export const normaliseIchorBudget = (v) => Number.isSafeInteger(v) && v >= 0 ? v : null;
const sameIds = (a, b) => a.length === b.length && new Set(a).size === new Set(b).size && a.every((id) => b.includes(id));
export const boardKeyOf = (character, cand) => boardKeyFor(character.class, character.talentSets?.[cand.talentSet]?.spec);
export const savedBoard = (character, id) => character.transcendence?.presets?.find((p) => p.id === id) ?? null;
export function boardCapacity(character, cand, boardId, budget) {
  return normaliseIchorBudget(budget) ?? setTotalCost(boardKeyOf(character, cand), savedBoard(character, boardId)?.allocatedNodeIds ?? []);
}

export function canonicalBoardAllocation(character, value) {
  if (!value) return null;
  const ids = Array.isArray(value.allocatedNodeIds) ? [...value.allocatedNodeIds].sort() : value.allocatedNodeIds;
  const saved = savedBoard(character, value.boardId);
  if (saved && Array.isArray(ids) && sameIds(saved.allocatedNodeIds, ids)) return null;
  return { boardId: value.boardId, allocatedNodeIds: ids };
}

export function allocationOf(character, cand, boardId) {
  return cand.boardAllocation?.boardId === boardId ? cand.boardAllocation.allocatedNodeIds : savedBoard(character, boardId)?.allocatedNodeIds ?? [];
}

export function boardAllocationViolations(character, cand) {
  const value = cand.boardAllocation;
  if (value == null) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['Board allocation must be an object'];
  const running = effectiveTranscendencePreset(character, cand);
  if (!running || value.boardId !== running.id) return ['Allocation must target the existing board this build runs'];
  const ids = value.allocatedNodeIds;
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string') || new Set(ids).size !== ids.length) return ['Board nodes must be unique node IDs'];
  const clean = sanitiseAllocation(boardKeyOf(character, cand), ids);
  return sameIds(ids, clean) ? [] : ['Board allocation has unknown, unavailable or disconnected nodes'];
}

export function boardAllocationAllowed(character, cand, enabled, budget) {
  if (!cand.boardAllocation) return true;
  if (!enabled || boardAllocationViolations(character, cand).length) return false;
  const { boardId, allocatedNodeIds } = cand.boardAllocation;
  return setTotalCost(boardKeyOf(character, cand), allocatedNodeIds) <= boardCapacity(character, cand, boardId, budget);
}

/** Connected additions, removable-leaf deletions and leaf-to-frontier swaps; never create a board. */
export function boardAllocationNeighbours(character, cand, budget) {
  const board = effectiveTranscendencePreset(character, cand);
  if (!board) return [];
  const key = boardKeyOf(character, cand), graph = boardGraph(key);
  if (!graph) return [];
  const current = allocationOf(character, cand, board.id);
  const required = sigilBySpecies(cand.ancientSigilSpecies)?.transcendenceNode;
  const capacity = boardCapacity(character, cand, board.id, budget);
  const nodes = [...graph.byId.keys()];
  const out = [], seen = new Set([JSON.stringify([...current].sort())]);
  const add = (ids) => {
    if (required && !ids.includes(required)) return;
    if (setTotalCost(key, ids) > capacity) return;
    const sorted = [...ids].sort(), k = JSON.stringify(sorted);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ...cand, boardAllocation: { boardId: board.id, allocatedNodeIds: sorted } });
  };
  const grow = (ids) => {
    for (const id of nodes) if (canAllocateNode(key, ids, id)) add([...ids, id]);
  };
  grow(current);
  for (const id of current) {
    if (id === required || !canRemoveNode(key, current, id)) continue;
    const rest = current.filter((n) => n !== id);
    add(rest);
    grow(rest);
  }
  // Reach a notable/Ancient without requiring every intermediate path node to win a race.
  // Two deterministic leaf orders offer different legal ways to free its capacity.
  for (const node of graph.byId.values()) {
    if (!['notable', 'sigil'].includes(node.kind) || current.includes(node.id)) continue;
    const parents = new Map([[graph.coreId, null], ...current.map((id) => [id, null])]);
    const queue = [...parents.keys()];
    for (let i = 0; i < queue.length && !parents.has(node.id); i++) {
      for (const next of graph.neighbors.get(queue[i])) {
        if (parents.has(next) || !isAllocatableKind(graph.byId.get(next)?.kind)) continue;
        parents.set(next, queue[i]); queue.push(next);
      }
    }
    if (!parents.has(node.id)) continue;
    const path = [];
    for (let id = node.id; id && !current.includes(id) && id !== graph.coreId; id = parents.get(id)) path.push(id);
    for (const reverse of [false, true]) {
      let ids = [...new Set([...current, ...path])];
      while (setTotalCost(key, ids) > capacity) {
        const leaves = ids.filter((id) => !path.includes(id) && id !== required && canRemoveNode(key, ids, id)).sort();
        const leaf = reverse ? leaves.at(-1) : leaves[0];
        if (!leaf) break;
        ids = ids.filter((id) => id !== leaf);
      }
      add(ids);
    }
  }
  return out;
}
