// store/transcendence.js (B7). Mutators for character.transcendence. Every one ends with persist()
// (through ctx.edit). Allocation legality is geometry-only, so it validates against the class board;
// the spec-specific board only matters for stats (see lib/transcendence.js boardKeyFor).
// Rules: docs/Reference/Game/transcendence.md §7, §9. Ichor is information, never a gate (plan B7).
import { newId } from '../model/character.js';
import {
  MAX_TRANSCENDENCE_PRESETS, DEFAULT_TRANSCENDENCE_ID, cleanPresetName,
} from '../model/transcendence.js';
import { boardKeyFor, canAllocateNode, canRemoveNode, isAllocatableKind, boardGraph } from '../transcendence.js';

export function createTranscendenceStore(ctx) {
  const presetOf = (c, id) => c.transcendence.presets.find((p) => p.id === id) ?? null;

  /**
   * Allocate a node on the given (default: active) transcendence preset.
   * @returns {'ok'|'no-class'|'unknown'|'not-allocatable'|'owned'|'unreachable'|'no-preset'}
   */
  function allocateTranscendenceNode(nodeId, presetId = null) {
    return ctx.edit((c) => {
      const preset = presetOf(c, presetId ?? c.transcendence.activePresetId);
      if (!preset) return 'no-preset';
      const key = boardKeyFor(c.class, null);
      if (!key) return 'no-class';
      const node = boardGraph(key).byId.get(nodeId);
      if (!node) return 'unknown';
      if (!isAllocatableKind(node.kind)) return 'not-allocatable';
      if (preset.allocatedNodeIds.includes(nodeId)) return 'owned';
      if (!canAllocateNode(key, preset.allocatedNodeIds, nodeId)) return 'unreachable';
      preset.allocatedNodeIds.push(nodeId);
      return 'ok';
    });
  }

  /** Remove a node unless that would strand others (doc §7). @returns {'ok'|'strands'|'not-allocated'|'no-class'|'no-preset'} */
  function removeTranscendenceNode(nodeId, presetId = null) {
    return ctx.edit((c) => {
      const preset = presetOf(c, presetId ?? c.transcendence.activePresetId);
      if (!preset) return 'no-preset';
      const key = boardKeyFor(c.class, null);
      if (!key) return 'no-class';
      if (!preset.allocatedNodeIds.includes(nodeId)) return 'not-allocated';
      if (!canRemoveNode(key, preset.allocatedNodeIds, nodeId)) return 'strands';
      preset.allocatedNodeIds = preset.allocatedNodeIds.filter((id) => id !== nodeId);
      return 'ok';
    });
  }

  function resetTranscendencePreset(presetId = null) {
    return ctx.edit((c) => {
      const preset = presetOf(c, presetId ?? c.transcendence.activePresetId);
      if (!preset) return false;
      preset.allocatedNodeIds = [];
      return true;
    });
  }

  /** New empty preset (becomes active). @returns {string|null} id, or null at the 4-preset cap. */
  function addTranscendencePreset(name) {
    return ctx.edit((c) => {
      const t = c.transcendence;
      if (t.presets.length >= MAX_TRANSCENDENCE_PRESETS) return null;
      const p = { id: newId('t'), name: cleanPresetName(name, `Preset ${t.presets.length + 1}`), allocatedNodeIds: [] };
      t.presets.push(p);
      t.activePresetId = p.id;
      return p.id;
    });
  }

  function renameTranscendencePreset(presetId, name) {
    return ctx.edit((c) => {
      const p = presetOf(c, presetId);
      if (!p) return false;
      p.name = cleanPresetName(name, p.name);
      return true;
    });
  }

  function setActiveTranscendencePreset(presetId) {
    return ctx.edit((c) => {
      if (!presetOf(c, presetId)) return false;
      c.transcendence.activePresetId = presetId;
      return true;
    });
  }

  /** The 'default' preset can't be deleted. Build presets linked to it fall back to null (reconcile). */
  function deleteTranscendencePreset(presetId) {
    return ctx.edit((c) => {
      const t = c.transcendence;
      if (presetId === DEFAULT_TRANSCENDENCE_ID || !presetOf(c, presetId)) return false;
      t.presets = t.presets.filter((p) => p.id !== presetId);
      if (t.activePresetId === presetId) t.activePresetId = DEFAULT_TRANSCENDENCE_ID;
      ctx.reconcile(c);
      return true;
    });
  }

  return {
    allocateTranscendenceNode,
    removeTranscendenceNode,
    resetTranscendencePreset,
    addTranscendencePreset,
    renameTranscendencePreset,
    setActiveTranscendencePreset,
    deleteTranscendencePreset,
  };
}
