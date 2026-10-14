// model/fortress.js - STUB from M1, owned by B6b from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: fortress. Shape: rebuild-plan §3 fortress (+ migration contract step 5).
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultFortress()                       -> fresh partial
//   normaliseFortress(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateFortressFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileFortress(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultFortress() {
  return { fortress: { owned: [] } };
}

// eslint-disable-next-line no-unused-vars
export function normaliseFortress(rawCharacter, ctx) {
  return defaultFortress();
}

// eslint-disable-next-line no-unused-vars
export function migrateFortressFromV1(v1Character) {
  return { value: defaultFortress(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileFortress(character) {}
