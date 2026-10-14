// model/drop.js - STUB from M1, owned by F1 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: drop. Shape: rebuild-plan §3 drop.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultDrop()                       -> fresh partial
//   normaliseDrop(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateDropFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileDrop(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultDrop() {
  return { drop: null };
}

// eslint-disable-next-line no-unused-vars
export function normaliseDrop(rawCharacter, ctx) {
  return defaultDrop();
}

// eslint-disable-next-line no-unused-vars
export function migrateDropFromV1(v1Character) {
  return { value: defaultDrop(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileDrop(character) {}
