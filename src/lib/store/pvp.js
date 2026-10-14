// store/pvp.js (F3): saved PVP duel opponents (character.opponents; shape in model/opponents.js).
// Every mutator goes through ctx.edit, so it ends with persist(). Each write is re-normalised through
// normaliseOpponent, so a bad class/spec/sigil never persists.
import { MAX_OPPONENTS, newOpponent, normaliseOpponent } from '../model/opponents.js';
import { cloneAsOpponent } from '../features/duel.js';
import { normaliseSheetValues } from '../engine/pipeline/sheet.js';
import { newId } from '../model/character.js';

const plain = (o) => JSON.parse(JSON.stringify(o));

export function createPvpStore(ctx) {
  const find = (c, id) => c.opponents.find((o) => o.id === id) ?? null;
  const replace = (c, id, next) => {
    const i = c.opponents.findIndex((o) => o.id === id);
    if (i >= 0) c.opponents[i] = normaliseOpponent({ ...next, id });
  };

  /** @returns {string|null} the new opponent's id, or null at the cap. */
  function addOpponent(spec = 'WARRIOR_DPS', name) {
    return ctx.edit((c) => {
      if (c.opponents.length >= MAX_OPPONENTS) return null;
      const o = newOpponent(spec, name?.trim() || `Opponent ${c.opponents.length + 1}`);
      c.opponents.push(o);
      return o.id;
    });
  }

  /** "Clone my preset as spec X": a saved opponent with my preset's stats. Null at the cap or for an unknown preset. */
  function cloneOpponentFromPreset(presetId, spec, name) {
    return ctx.edit((c) => {
      if (c.opponents.length >= MAX_OPPONENTS || !ctx.findPreset(presetId, c)) return null;
      const o = cloneAsOpponent(c, presetId, spec, name);
      c.opponents.push(o);
      return o.id;
    });
  }

  function duplicateOpponent(id) {
    return ctx.edit((c) => {
      const src = find(c, id);
      if (!src || c.opponents.length >= MAX_OPPONENTS) return null;
      const copy = normaliseOpponent({ ...plain(src), id: newId('opp'), name: `${src.name} copy` });
      c.opponents.splice(c.opponents.indexOf(src) + 1, 0, copy);
      return copy.id;
    });
  }

  function removeOpponent(id) {
    return ctx.edit((c) => {
      const i = c.opponents.findIndex((o) => o.id === id);
      if (i < 0) return false;
      c.opponents.splice(i, 1);
      return true;
    });
  }

  /**
   * Patch any of name, class, spec, sigils, utility, ancient, conditions, majorGlyphs, altarTier.
   * Changing the class or spec re-normalises, which drops loadout parts the new spec cannot use.
   * The id and the sheet are not patchable here (see setOpponentSheet).
   */
  function updateOpponent(id, patch) {
    return ctx.edit((c) => {
      const o = find(c, id);
      if (!o) return false;
      const rest = { ...(patch ?? {}) };
      delete rest.id;
      delete rest.sheet;
      replace(c, id, { ...plain(o), ...rest });
      return true;
    });
  }

  /** Replace the stat block. `values` is filtered to known non-negative sheet keys. */
  function setOpponentSheet(id, values) {
    return ctx.edit((c) => {
      const o = find(c, id);
      if (!o) return false;
      replace(c, id, { ...plain(o), sheet: { values: normaliseSheetValues(values), enteredAt: new Date().toISOString() } });
      return true;
    });
  }

  return { addOpponent, cloneOpponentFromPreset, duplicateOpponent, removeOpponent, updateOpponent, setOpponentSheet };
}
