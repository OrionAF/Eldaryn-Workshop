// model/equipment.js - STUB from M1, owned by B1 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: equipment. Shape: rebuild-plan §3 Equip/Item.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultEquipment()                       -> fresh partial
//   normaliseEquipment(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateEquipmentFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileEquipment(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.
function emptyEquip() {
  return { items: {}, enchantSlots: {} };
}

export function defaultEquipment() {
  return { equipment: { set1: emptyEquip(), set2: emptyEquip(), oblivion: emptyEquip() } };
}

// eslint-disable-next-line no-unused-vars
export function normaliseEquipment(rawCharacter, ctx) {
  return defaultEquipment();
}

// eslint-disable-next-line no-unused-vars
export function migrateEquipmentFromV1(v1Character) {
  return { value: defaultEquipment(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileEquipment(character) {}
