// store/pvp.js (F3): saved PVP duel opponents (character.opponents; shape in model/opponents.js).
// Every mutator goes through ctx.edit, so it ends with persist(). Each write is re-normalised through
// normaliseOpponent, so a bad class/spec/sigil never persists.
import { MAX_OPPONENTS, newOpponent, normaliseOpponent } from '../model/opponents.js';
import { cloneAsOpponent } from '../features/duel.js';
import { normaliseSheetValues } from '../engine/pipeline/sheet.js';
import { newId } from '../model/character.js';

const plain = (o) => JSON.parse(JSON.stringify(o));

export function createPvpStore(ctx) {
  // The last removed opponent, for the one-step Undo on its toast. Session only, never persisted.
  let lastRemoved = null;
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

  /**
   * Save an opponent imported from Rankings (model/opponents.js opponentFromRankingsProfile). The same
   * playerId updates that opponent in place (its id is kept); otherwise it is added, and at the cap it
   * takes the place of the oldest saved opponent (the first in the list).
   * @returns {{id: string, updated: boolean, replaced: {id: string, name: string}|null}}
   */
  function saveRankingsOpponent(draft) {
    return ctx.edit((c) => {
      const pid = draft?.imported?.playerId;
      const old = pid ? c.opponents.find((o) => o.imported?.playerId === pid) : null;
      if (old) {
        replace(c, old.id, { ...draft, id: old.id });
        return { id: old.id, updated: true, replaced: null };
      }
      const oldest = c.opponents.length >= MAX_OPPONENTS ? c.opponents.shift() : null;
      const o = normaliseOpponent({ ...draft, id: newId('opp') });
      c.opponents.push(o);
      return { id: o.id, updated: false, replaced: oldest ? { id: oldest.id, name: oldest.name } : null };
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
      lastRemoved = { characterId: c.id, opponent: plain(c.opponents[i]), index: i };
      c.opponents.splice(i, 1);
      return true;
    });
  }

  /** Whether restoreRemovedOpponent has something to bring back, and whether its character has room. */
  function removedOpponentStatus() {
    if (!lastRemoved) return 'none';
    const c = ctx.findCharacter(lastRemoved.characterId);
    if (!c) return 'none';
    return c.opponents.length >= MAX_OPPONENTS ? 'full' : 'ready';
  }

  /**
   * Undo the last removeOpponent, into the character it came from, at its old place (a fresh id if its
   * id is taken by now). One step only; at the cap it refuses and keeps the slot.
   * @returns {string|null} the restored opponent's id
   */
  function restoreRemovedOpponent() {
    if (removedOpponentStatus() !== 'ready') return null;
    const { characterId, opponent, index } = lastRemoved;
    lastRemoved = null;
    const c = ctx.findCharacter(characterId);
    const o = normaliseOpponent(opponent);
    if (c.opponents.some((x) => x.id === o.id)) o.id = newId('opp');
    c.opponents.splice(Math.min(index, c.opponents.length), 0, o);
    ctx.persist();
    return o.id;
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

  return { saveRankingsOpponent, addOpponent, cloneOpponentFromPreset, duplicateOpponent, removeOpponent, removedOpponentStatus, restoreRemovedOpponent, updateOpponent, setOpponentSheet };
}
