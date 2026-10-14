// store/sheets.js (M1): the tier-2 in-game stat sheets (rebuild-plan §4). One per preset, plus one for
// the Oblivion realm. `values` is a Partial<ComputedStats>; null / {} clears the sheet.
import { makeSheet } from '../model/character.js';

export function createSheetsStore(ctx) {
  function setPresetSheet(presetId, values) {
    ctx.editPreset(presetId, (p) => {
      p.sheet = values ? makeSheet(values) : null;
    });
  }

  function clearPresetSheet(presetId) {
    setPresetSheet(presetId, null);
  }

  function setOblivionSheet(values) {
    ctx.edit((c) => {
      c.oblivion.sheet = values ? makeSheet(values) : null;
    });
  }

  return { setPresetSheet, clearPresetSheet, setOblivionSheet };
}
