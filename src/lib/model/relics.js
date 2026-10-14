// model/relics.js - STUB from M1, owned by B6a from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: relics. Shape: rebuild-plan §3 relics.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultRelics()                       -> fresh partial
//   normaliseRelics(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateRelicsFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileRelics(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultRelics() {
  return { relics: {} };
}

// eslint-disable-next-line no-unused-vars
export function normaliseRelics(rawCharacter, ctx) {
  return defaultRelics();
}

// eslint-disable-next-line no-unused-vars
export function migrateRelicsFromV1(v1Character) {
  return { value: defaultRelics(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileRelics(character) {}
