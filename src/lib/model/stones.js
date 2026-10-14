// model/stones.js - STUB from M1, owned by B1 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: enchantStones, oblivionEnchantStones. Shape: rebuild-plan §3 Stone.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultStones()                       -> fresh partial
//   normaliseStones(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateStonesFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileStones(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultStones() {
  return { enchantStones: [], oblivionEnchantStones: [] };
}

// eslint-disable-next-line no-unused-vars
export function normaliseStones(rawCharacter, ctx) {
  return defaultStones();
}

// eslint-disable-next-line no-unused-vars
export function migrateStonesFromV1(v1Character) {
  return { value: defaultStones(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileStones(character) {}
