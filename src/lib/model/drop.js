// model/drop.js (F1): the Drop Check candidate. Persisted character field: drop.
// Shape: rebuild-plan §3 `drop: { realm, slot, item: Item } | null`.
//
//   drop = { realm: 'base'|'oblivion', slot: Slot, item: Item }   (null until the screen first opens)
//
// `item` is the drop under test, in the engine's units (model/equipment.js: Attack Speed, Crit Damage
// and Minion Attack Speed are multipliers). It is never part of a build until "Apply to set" writes it
// into `equipment.<set>.items[slot]`. Domain contract: see model/index.js (default/normalise/migrate/reconcile).
import { slotsForRealm } from '../game/gear.js';
import { emptyItem, normaliseItem } from './equipment.js';

export const DROP_REALMS = ['base', 'oblivion'];

export function defaultDrop() {
  return { drop: null };
}

/** A fresh empty drop for a slot (the screen's "new drop"). */
export function newDrop(slot, realm = 'base') {
  return { realm, slot, item: emptyItem() };
}

/** True when the item carries at least one stat, i.e. there is something to judge. */
export function dropHasStats(item) {
  if (!item) return false;
  return (
    (item.primaryStats?.attack ?? 0) > 0 ||
    (item.primaryStats?.hp ?? 0) > 0 ||
    (item.secondaryStats?.length ?? 0) > 0 ||
    !!item.conduit
  );
}

/** Any value -> a valid drop or null. Idempotent. An unknown slot for the realm discards the drop. */
export function normaliseDrop(rawCharacter, ctx) {
  const raw = rawCharacter?.drop;
  if (!raw || typeof raw !== 'object') return defaultDrop();
  const realm = raw.realm === 'oblivion' ? 'oblivion' : 'base';
  if (!slotsForRealm(realm).includes(raw.slot)) return defaultDrop();
  const item = normaliseItem(raw.item, { cls: ctx?.class ?? null, realm }) ?? emptyItem();
  return { drop: { realm, slot: raw.slot, item } };
}

// v1 drops (loose stat blocks) are not worth migrating: they are scratch input (rebuild-plan §3 table).
// eslint-disable-next-line no-unused-vars
export function migrateDropFromV1(v1Character) {
  return { value: defaultDrop(), idMap: {} };
}

// A drop references nothing else in the character.
// eslint-disable-next-line no-unused-vars
export function reconcileDrop(character) {}
