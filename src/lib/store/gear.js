// store/gear.js (B1): equipment item and stone-socket mutators. Every mutator ends with persist()
// (through ctx.edit / ctx.editPreset). Items are normalised on the way in, so a bad item never persists.
import { EQUIP_SET_KEYS, realmOfSet, normaliseItem } from '../model/equipment.js';
import { slotsForRealm, BASE_SLOTS } from '../game/gear.js';

export function createGearStore(ctx) {
  /**
   * Put an item in a slot of one set ('set1' | 'set2' | 'oblivion'); null clears it.
   * Returns false when the set or slot does not exist (e.g. BELT in set1).
   */
  function setEquipmentItem(setKey, slot, item) {
    if (!EQUIP_SET_KEYS.includes(setKey)) return false;
    const realm = realmOfSet(setKey);
    if (!slotsForRealm(realm).includes(slot)) return false;
    return ctx.edit((c) => {
      c.equipment[setKey].items[slot] = normaliseItem(item, { cls: c.class, realm });
      return true;
    });
  }

  function clearEquipmentItem(setKey, slot) {
    return setEquipmentItem(setKey, slot, null);
  }

  /**
   * Socket a stone into a base slot of a set. A stone may sit in set1 and set2 at once (stones.md
   * §4) but fills one slot per set, so it leaves any other slot of this set first. The stone must
   * come from the set's own pool (Oblivion set <- oblivion pool); returns false otherwise.
   */
  function socketStone(setKey, slot, stoneId) {
    if (!EQUIP_SET_KEYS.includes(setKey) || !BASE_SLOTS.includes(slot)) return false;
    return ctx.edit((c) => {
      const pool = setKey === 'oblivion' ? c.oblivionEnchantStones : c.enchantStones;
      if (!pool.some((s) => s.id === stoneId)) return false;
      const sockets = c.equipment[setKey].enchantSlots;
      for (const other of BASE_SLOTS) if (sockets[other] === stoneId) sockets[other] = null;
      sockets[slot] = stoneId;
      return true;
    });
  }

  function unsocketStone(setKey, slot) {
    if (!EQUIP_SET_KEYS.includes(setKey) || !BASE_SLOTS.includes(slot)) return false;
    return ctx.edit((c) => {
      c.equipment[setKey].enchantSlots[slot] = null;
      return true;
    });
  }

  return { setEquipmentItem, clearEquipmentItem, socketStone, unsocketStone };
}
