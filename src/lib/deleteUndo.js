// deleteUndo.js: delete a preset or a saved opponent and offer a one-step Undo on the toast
// (notify's `action`). The store keeps the removed item for this session only.
import { rosterStore } from './rosterStore.svelte.js';
import { notify } from './notify.svelte.js';
import { MAX_PRESETS } from './model/presets.js';
import { MAX_OPPONENTS } from './model/opponents.js';

/** @returns {boolean} whether the preset was deleted (false below the two-preset minimum). */
export function deletePresetWithUndo(preset) {
  const name = preset.name;
  if (!rosterStore.deletePreset(preset.id)) return false;
  notify(`Deleted ${name}`, { action: { label: 'Undo', run: () => undoPreset(name) } });
  return true;
}

function undoPreset(name) {
  if (rosterStore.deletedPresetStatus() === 'full') {
    notify(`At most ${MAX_PRESETS} presets. Delete one to bring back ${name}.`, { kind: 'warn' });
    return;
  }
  if (rosterStore.restoreDeletedPreset()) notify(`Restored ${name}`, { kind: 'success' });
}

/**
 * @param {(id: string) => void} [onRestored] called with the restored opponent's id
 * @returns {boolean} whether the opponent was deleted
 */
export function deleteOpponentWithUndo(opponent, onRestored = () => {}) {
  const name = opponent.name;
  if (!rosterStore.removeOpponent(opponent.id)) return false;
  notify(`Deleted ${name}`, { action: { label: 'Undo', run: () => undoOpponent(name, onRestored) } });
  return true;
}

function undoOpponent(name, onRestored) {
  if (rosterStore.removedOpponentStatus() === 'full') {
    notify(`At most ${MAX_OPPONENTS} opponents. Delete one to bring back ${name}.`, { kind: 'warn' });
    return;
  }
  const id = rosterStore.restoreRemovedOpponent();
  if (!id) return;
  notify(`Restored ${name}`, { kind: 'success' });
  onRestored(id);
}
