// store/sheets.js (M1, S1): the tier-2 in-game stat sheets (rebuild-plan §4). One per preset, plus one
// for the Oblivion realm, owned by one preset. `values` is a Partial<ComputedStats>; null / {} clears
// the sheet. Status rules (fresh / stale / unverified): data-model.md §6.
import { makeSheet } from '../model/character.js';
import { sheetInputsKey } from '../build/stats.js';

export function createSheetsStore(ctx) {
  // The stamp a written sheet carries. A new sheet, or a confirmed one, gets the current build's
  // fingerprint. An edit keeps the old stamp: changing a few rows of a stale sheet does not make it
  // fresh. `inherited` (values carried over from another owner) leaves it unverified.
  function nextSheet(prev, values, { confirm, inherited = false, key, presetId }) {
    if (!values) return null;
    let inputsKey;
    if (confirm || (!prev && !inherited)) inputsKey = key();
    else inputsKey = inherited ? null : (prev.inputsKey ?? null);
    const meta = presetId === undefined ? { inputsKey } : { inputsKey, presetId };
    const keepDate = prev && !confirm && !inherited;
    return makeSheet(values, keepDate ? (prev.enteredAt ?? undefined) : undefined, meta);
  }

  /** Enter or edit a preset's sheet; `{confirm: true}` also confirms it matches the current build. */
  function setPresetSheet(presetId, values, { confirm = false } = {}) {
    ctx.editPreset(presetId, (p, c) => {
      p.sheet = nextSheet(p.sheet, values, { confirm, key: () => sheetInputsKey(c, presetId) });
    });
  }

  function clearPresetSheet(presetId) {
    setPresetSheet(presetId, null);
  }

  /** "Confirm sheet matches this build": stamp the preset's sheet with the current build. */
  function confirmPresetSheet(presetId) {
    const p = ctx.findPreset(presetId);
    if (p?.sheet) setPresetSheet(presetId, p.sheet.values, { confirm: true });
  }

  /**
   * Enter or edit the Oblivion sheet of `presetId` (default: the active preset), which becomes its
   * owner. Rows carried over from another owner's sheet are unverified until confirmed.
   */
  function setOblivionSheet(values, presetId = null, { confirm = false } = {}) {
    ctx.edit((c) => {
      const owner = presetId ?? c.activePresetId;
      const prev = c.oblivion.sheet;
      c.oblivion.sheet = nextSheet(prev, values, {
        confirm,
        inherited: !!prev?.presetId && prev.presetId !== owner,
        presetId: owner,
        key: () => sheetInputsKey(c, owner, { realm: 'oblivion' }),
      });
    });
  }

  /** Confirm the Oblivion sheet matches `presetId`'s build (default: the active preset). */
  function confirmOblivionSheet(presetId = null) {
    const sheet = ctx.current()?.oblivion?.sheet;
    if (sheet) setOblivionSheet(sheet.values, presetId, { confirm: true });
  }

  return { setPresetSheet, clearPresetSheet, confirmPresetSheet, setOblivionSheet, confirmOblivionSheet };
}
