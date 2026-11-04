import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rosterStore } from './rosterStore.svelte.js';
import { notifications, runAction, resetNotifications } from './notify.svelte.js';
import { MAX_PRESETS } from './model/presets.js';
import { deletePresetWithUndo, deleteOpponentWithUndo } from './deleteUndo.js';

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  resetNotifications();
  const id = rosterStore.addCharacter('Undoer', 'WARRIOR');
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
  resetNotifications();
});
afterEach(() => {
  resetNotifications();
  vi.useRealTimers();
});

const presets = () => rosterStore.current.presets;
const lastToast = () => notifications.toasts.at(-1);

it('deleting a preset shows an Undo toast that brings it back', () => {
  rosterStore.addPreset('Arena');
  const p = presets()[2];
  expect(deletePresetWithUndo(p)).toBe(true);
  expect(presets().map((x) => x.id)).not.toContain(p.id);
  expect(lastToast()).toMatchObject({ message: 'Deleted Arena', action: { label: 'Undo' } });
  runAction(lastToast().id);
  expect(presets()[2].id).toBe(p.id);
  expect(lastToast()).toMatchObject({ message: 'Restored Arena', kind: 'success' });
});

it('a refused delete (two-preset minimum) shows no toast', () => {
  expect(deletePresetWithUndo(presets()[0])).toBe(false);
  expect(notifications.toasts).toHaveLength(0);
});

it('Undo at the 8-preset cap warns instead of restoring', () => {
  rosterStore.addPreset('Arena');
  deletePresetWithUndo(presets()[2]);
  const undo = lastToast().id;
  while (presets().length < MAX_PRESETS) rosterStore.addPreset();
  runAction(undo);
  expect(presets()).toHaveLength(MAX_PRESETS);
  expect(presets().map((x) => x.name)).not.toContain('Arena');
  expect(lastToast()).toMatchObject({ kind: 'warn', message: `At most ${MAX_PRESETS} presets. Delete one to bring back Arena.` });
});

it('deleting an opponent shows an Undo toast; Undo restores it and reports its id', () => {
  const id = rosterStore.addOpponent('WARRIOR_TANK', 'Wall');
  const onRestored = vi.fn();
  expect(deleteOpponentWithUndo(rosterStore.current.opponents[0], onRestored)).toBe(true);
  expect(rosterStore.current.opponents).toHaveLength(0);
  expect(lastToast()).toMatchObject({ message: 'Deleted Wall', action: { label: 'Undo' } });
  runAction(lastToast().id);
  expect(rosterStore.current.opponents.map((o) => o.id)).toEqual([id]);
  expect(onRestored).toHaveBeenCalledWith(id);
});

it('two preset deletes: Undo on the first toast warns and leaves the second deleted and undoable', () => {
  rosterStore.addPreset('Arena');
  rosterStore.addPreset('Raid');
  const [a, b] = [presets()[2], presets()[3]];
  deletePresetWithUndo(a);
  const first = lastToast().id;
  deletePresetWithUndo(b);
  const second = lastToast().id;
  runAction(first);
  expect(presets().map((x) => x.id)).not.toContain(a.id);
  expect(presets().map((x) => x.id)).not.toContain(b.id);
  expect(lastToast()).toMatchObject({ kind: 'warn', message: 'Can no longer undo deleting Arena.' });
  runAction(second);
  expect(presets().map((x) => x.id)).toContain(b.id);
  expect(lastToast()).toMatchObject({ kind: 'success', message: 'Restored Raid' });
});

it('two opponent deletes: Undo on the first toast warns and does not restore the second', () => {
  rosterStore.addOpponent('WARRIOR_TANK', 'Wall');
  rosterStore.addOpponent('MYSTIC_MAGE', 'Mage');
  const onRestored = vi.fn();
  const [a, b] = rosterStore.current.opponents;
  deleteOpponentWithUndo(a, onRestored);
  const first = lastToast().id;
  deleteOpponentWithUndo(b, onRestored);
  runAction(first);
  expect(rosterStore.current.opponents).toHaveLength(0);
  expect(onRestored).not.toHaveBeenCalled();
  expect(lastToast()).toMatchObject({ kind: 'warn', message: 'Can no longer undo deleting Wall.' });
});
