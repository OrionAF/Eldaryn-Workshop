// model/opponents.js - STUB from M1, owned by F3 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: opponents. Shape: rebuild-plan §3 opponents.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultOpponents()                       -> fresh partial
//   normaliseOpponents(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateOpponentsFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileOpponents(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultOpponents() {
  return { opponents: [] };
}

// eslint-disable-next-line no-unused-vars
export function normaliseOpponents(rawCharacter, ctx) {
  return defaultOpponents();
}

// eslint-disable-next-line no-unused-vars
export function migrateOpponentsFromV1(v1Character) {
  return { value: defaultOpponents(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileOpponents(character) {}
