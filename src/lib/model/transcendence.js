// model/transcendence.js - STUB from M1, owned by B7 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: transcendence. Shape: rebuild-plan §3 transcendence.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultTranscendence()                       -> fresh partial
//   normaliseTranscendence(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateTranscendenceFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileTranscendence(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultTranscendence() {
  return { transcendence: { presets: [{ id: 'default', name: 'Default', allocatedNodeIds: [] }], activePresetId: 'default' } };
}

// eslint-disable-next-line no-unused-vars
export function normaliseTranscendence(rawCharacter, ctx) {
  return defaultTranscendence();
}

// eslint-disable-next-line no-unused-vars
export function migrateTranscendenceFromV1(v1Character) {
  return { value: defaultTranscendence(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileTranscendence(character) {}
