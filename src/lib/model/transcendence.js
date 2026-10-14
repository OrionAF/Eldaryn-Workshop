// model/transcendence.js (B7). Persisted character field: transcendence. Shape: rebuild-plan §3.
//   transcendence: { presets: [{id, name, allocatedNodeIds: string[]}] (1..4, 'default' first), activePresetId }
// Game rules: docs/Reference/Game/transcendence.md §7-§9. Allocations are validated against the class
// board's geometry, which is identical for every board of a class, so a spec swap never loses nodes
// (doc §4: ids missing from the new board simply contribute nothing).
import { boardKeyFor, sanitiseAllocation, nodeIdAt } from '../transcendence.js';
import { TRANSCENDENCE_CONSTANTS } from '../game/transcendence.js';

export const MAX_TRANSCENDENCE_PRESETS = TRANSCENDENCE_CONSTANTS.presetMaxSlots;
export const TRANSCENDENCE_NAME_MAX = TRANSCENDENCE_CONSTANTS.presetNameMax;
export const DEFAULT_TRANSCENDENCE_ID = 'default';

export function defaultTranscendence() {
  return { transcendence: { presets: [{ id: 'default', name: 'Default', allocatedNodeIds: [] }], activePresetId: 'default' } };
}

/** Trimmed, length-capped preset name; falls back when empty. */
export function cleanPresetName(raw, fallback) {
  const s = typeof raw === 'string' ? raw.trim().slice(0, TRANSCENDENCE_NAME_MAX) : '';
  return s || fallback;
}

export function normaliseTranscendence(rawCharacter, ctx) {
  const raw = rawCharacter?.transcendence;
  const boardKey = boardKeyFor(ctx?.class ?? rawCharacter?.class ?? null, null);
  const seen = new Set();
  const presets = [];
  for (const p of Array.isArray(raw?.presets) ? raw.presets : []) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    presets.push({
      id: p.id,
      name: cleanPresetName(p.name, p.id === DEFAULT_TRANSCENDENCE_ID ? 'Default' : `Preset ${presets.length + 1}`),
      allocatedNodeIds: boardKey ? sanitiseAllocation(boardKey, p.allocatedNodeIds) : [],
    });
  }
  let def = presets.find((p) => p.id === DEFAULT_TRANSCENDENCE_ID);
  if (!def) def = { id: DEFAULT_TRANSCENDENCE_ID, name: 'Default', allocatedNodeIds: [] };
  const ordered = [def, ...presets.filter((p) => p !== def)].slice(0, MAX_TRANSCENDENCE_PRESETS);
  const wanted = raw?.activePresetId;
  const activePresetId = ordered.some((p) => p.id === wanted) ? wanted : DEFAULT_TRANSCENDENCE_ID;
  return { transcendence: { presets: ordered, activePresetId } };
}

/**
 * v1 `transcendence.unlockedPositions` ("col:row", 1-indexed, start 14:25) -> default preset ids.
 * v1 row r is v2 row r-26 and v1 col c is v2 col c-14 (v1 has no core cell; its start 14:25 is v2
 * `n_0,-1`). Positions with no v2 cell are dropped; normalise then gates by class and connectivity.
 * idMap['*'] = 'default' so every migrated build preset links to the default board.
 */
export function migrateTranscendenceFromV1(v1Character) {
  const out = defaultTranscendence();
  const positions = v1Character?.transcendence?.unlockedPositions;
  const ids = [];
  for (const pos of Array.isArray(positions) ? positions : []) {
    const m = typeof pos === 'string' ? /^(\d+):(\d+)$/.exec(pos) : null;
    if (!m) continue;
    const id = nodeIdAt('WARRIOR', Number(m[1]) - 14, Number(m[2]) - 26);
    if (id && id !== 'core' && !ids.includes(id)) ids.push(id);
  }
  out.transcendence.presets[0].allocatedNodeIds = ids;
  return { value: out, idMap: { '*': DEFAULT_TRANSCENDENCE_ID } };
}

/** Build-preset links are repaired in reconcilePresets; here only the active id. */
export function reconcileTranscendence(character) {
  const t = character.transcendence;
  if (!t) return;
  if (!t.presets.some((p) => p.id === t.activePresetId)) t.activePresetId = DEFAULT_TRANSCENDENCE_ID;
}
