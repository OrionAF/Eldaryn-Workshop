// Transcendence source (a9). Pure and synchronous: the caller passes the class board
// (game/transcendence.js transcendenceBoardForSpec); this module never imports the catalogue.
// See docs/Reference/Game/transcendence.md §8.
import { zeroBonuses } from './talents.js';

const CORE_NODE_ID = 'core';

// port of calculateTranscendenceBonuses L1217901-1217995
/**
 * @param {string[]} allocatedNodeIds
 * @param {{nodes: {id: string, stats: {stat: string, value: number}[]}[]}|null} board
 *   Unknown ids (e.g. after a spec swap) and the core are skipped; a null board gives zeros.
 * @returns {import('../types.js').TranscendenceBonuses}
 */
export function calculateTranscendenceBonuses(allocatedNodeIds, board) {
  const out = zeroBonuses();
  if (!board) return out;
  const byId = new Map();
  for (const n of board.nodes) byId.set(n.id, n);
  for (const id of allocatedNodeIds ?? []) {
    if (id === CORE_NODE_ID) continue;
    const node = byId.get(id);
    if (!node) continue;
    for (const s of node.stats) out[s.stat] = (out[s.stat] ?? 0) + s.value;
  }
  return out;
}
