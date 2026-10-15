// store/drop.js (F1): Drop Check mutators. Every mutator ends with persist() (through ctx.edit).
// The candidate item is normalised on the way in, so a bad item never persists.
import { slotsForRealm } from '../game/gear.js';
import { EQUIP_SET_KEYS, realmOfSet, normaliseItem } from '../model/equipment.js';
import { newDrop, dropAscension } from '../model/drop.js';

export function createDropStore(ctx) {
  /** Start a fresh, empty drop. Defaults keep the current slot and realm. Returns false for an unknown slot. */
  function startDrop(slot, realm) {
    return ctx.edit((c) => {
      const r = (realm ?? c.drop?.realm ?? 'base') === 'oblivion' ? 'oblivion' : 'base';
      const s = slot ?? c.drop?.slot ?? 'WEAPON';
      if (!slotsForRealm(r).includes(s)) return false;
      c.drop = newDrop(s, r);
      return true;
    });
  }

  /** Switch the slot under test. A different slot has different stats, so the item starts empty. */
  function setDropSlot(slot) {
    const c = ctx.current();
    if (c?.drop && c.drop.slot === slot) return true;
    return startDrop(slot);
  }

  /** Switch realm. The slot is kept when the new realm has it (conduit rules re-apply to the item). */
  function setDropRealm(realm) {
    const r = realm === 'oblivion' ? 'oblivion' : 'base';
    return ctx.edit((c) => {
      const slot = c.drop && slotsForRealm(r).includes(c.drop.slot) ? c.drop.slot : 'WEAPON';
      const item = c.drop?.item ? normaliseItem(c.drop.item, { cls: c.class, realm: r, ascension: dropAscension(c) }) : null;
      c.drop = { ...newDrop(slot, r), ...(item ? { item } : {}) };
      return true;
    });
  }

  /** Replace the candidate item (null clears it). Starts a base-realm WEAPON drop when none exists. */
  function setDropItem(item) {
    return ctx.edit((c) => {
      const base = c.drop ?? newDrop('WEAPON', 'base');
      const next = normaliseItem(item, { cls: c.class, realm: base.realm, ascension: dropAscension(c) });
      c.drop = { ...base, item: next ?? newDrop(base.slot, base.realm).item };
      return true;
    });
  }

  /** Empty the candidate item (slot and realm stay). */
  function discardDrop() {
    return ctx.edit((c) => {
      if (c.drop) c.drop = newDrop(c.drop.slot, c.drop.realm);
      return true;
    });
  }

  /**
   * "Apply to set": write the drop into `equipment.<setKey>.items[slot]`. Refuses (false) when there is
   * no drop, the set is in a different realm than the drop, or the set lacks the slot. The drop is kept,
   * so the same item can then go to the other set.
   */
  function applyDropToSet(setKey) {
    if (!EQUIP_SET_KEYS.includes(setKey)) return false;
    return ctx.edit((c) => {
      const d = c.drop;
      if (!d || realmOfSet(setKey) !== d.realm) return false;
      const item = normaliseItem(d.item, { cls: c.class, realm: d.realm, ascension: dropAscension(c) });
      if (!item || !(d.slot in c.equipment[setKey].items)) return false;
      c.equipment[setKey].items[d.slot] = item;
      return true;
    });
  }

  return { startDrop, setDropSlot, setDropRealm, setDropItem, discardDrop, applyDropToSet };
}
