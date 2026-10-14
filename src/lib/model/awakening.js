// model/awakening.js - STUB from M1, owned by B6a from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: awakening. Shape: rebuild-plan §3 awakening.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultAwakening()                       -> fresh partial
//   normaliseAwakening(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateAwakeningFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileAwakening(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultAwakening() {
  return { awakening: { path: null, level: 0 } };
}

// eslint-disable-next-line no-unused-vars
export function normaliseAwakening(rawCharacter, ctx) {
  return defaultAwakening();
}

// eslint-disable-next-line no-unused-vars
export function migrateAwakeningFromV1(v1Character) {
  return { value: defaultAwakening(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileAwakening(character) {}
