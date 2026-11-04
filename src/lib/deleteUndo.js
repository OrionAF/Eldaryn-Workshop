// deleteUndo.js: delete a preset or a saved opponent and offer a one-step Undo on the toast
// (notify's `action`). The store keeps only the latest removed item, for this session only, so each
// Undo names the item it was raised for and refuses once a later delete has replaced it.
import { rosterStore } from './rosterStore.svelte.js';
import { notify } from './notify.svelte.js';
import { MAX_PRESETS } from './model/presets.js';
import { MAX_OPPONENTS } from './model/opponents.js';

/** @returns {boolean} whether the preset was deleted (false below the two-preset minimum). */
export function deletePresetWithUndo(preset) {
  const { id, name } = preset;
  if (!rosterStore.deletePreset(id)) return false;
  notify(`Deleted ${name}`, { action: { label: 'Undo', run: () => undoPreset(id, name) } });
  return true;
}

/** The warning when an Undo's item is no longer in the store's one-step slot. */
export function undoGoneMessage(name) {
  return `Can no longer undo deleting ${name}.`;
}

function undoPreset(id, name) {
  const status = rosterStore.deletedPresetStatus(id);
  if (status === 'none') {
    notify(undoGoneMessage(name), { kind: 'warn' });
    return;
  }
  if (status === 'full') {
    notify(`At most ${MAX_PRESETS} presets. Delete one to bring back ${name}.`, { kind: 'warn' });
    return;
  }
  if (rosterStore.restoreDeletedPreset(id)) notify(`Restored ${name}`, { kind: 'success' });
}

/**
 * @param {(id: string) => void} [onRestored] called with the restored opponent's id
 * @returns {boolean} whether the opponent was deleted
 */
export function deleteOpponentWithUndo(opponent, onRestored = () => {}) {
  const { id, name } = opponent;
  if (!rosterStore.removeOpponent(id)) return false;
  notify(`Deleted ${name}`, { action: { label: 'Undo', run: () => undoOpponent(id, name, onRestored) } });
  return true;
}

function undoOpponent(id, name, onRestored) {
  const status = rosterStore.removedOpponentStatus(id);
  if (status === 'none') {
    notify(undoGoneMessage(name), { kind: 'warn' });
    return;
  }
  if (status === 'full') {
    notify(`At most ${MAX_OPPONENTS} opponents. Delete one to bring back ${name}.`, { kind: 'warn' });
    return;
  }
  const restored = rosterStore.restoreRemovedOpponent(id);
  if (!restored) return;
  notify(`Restored ${name}`, { kind: 'success' });
  onRestored(restored);
}
