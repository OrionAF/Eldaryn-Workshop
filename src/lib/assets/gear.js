// Gear item art: the client's getItemImage (itemArtPath, then fallbackArtPath; decompiled.js
// L1202510-1202760). Files are cut from its `items/<rarity>/<itemType>/[<class>/]<slot>.png` to 128px
// and named gear_<rarity>_<itemType>[_<class>]_<slot>.png.
import { assetUrl } from './base.js';
import { itemTypesFor } from '../game/gear.js';

// The client's SLOT_FILENAME
const SLOT_FILE = {
  HEAD: 'helmet',
  SHOULDERS: 'shoulders',
  CHEST: 'chest',
  LEGGINGS: 'pants',
  BOOTS: 'boots',
  WEAPON: 'weapon',
  OFFHAND: 'offhand',
  RING: 'ring',
  TRINKET: 'amulet',
  BELT: 'belt',
  GLOVES: 'gloves',
  RIFT_CORE: 'riftcore',
};
const CLASS_SLOTS = new Set(['WEAPON', 'OFFHAND']);
const CLASSES = new Set(['warrior', 'sentinel', 'mystic', 'necromancer']);

/**
 * Art for an item in a slot, or null (no rarity, or no file even for Common Iron, e.g. a Common belt).
 * `item.itemType` picks the material; when unknown, the rarity's first. Weapon and off-hand art is
 * per class (Warrior for an unknown class, as in the client).
 */
export function gearImage(item, slot, cls) {
  const file = SLOT_FILE[slot];
  if (!item?.rarity || !file) return null;
  const type = item.itemType ?? itemTypesFor(item.rarity)[0]?.type;
  const c = String(cls ?? '').toLowerCase();
  const classPart = CLASS_SLOTS.has(slot) ? `${CLASSES.has(c) ? c : 'warrior'}_` : '';
  const own = type ? assetUrl(`gear_${item.rarity.toLowerCase()}_${type.toLowerCase()}_${classPart}${file}`) : null;
  return own ?? assetUrl(`gear_common_iron_${classPart}${file}`);
}
