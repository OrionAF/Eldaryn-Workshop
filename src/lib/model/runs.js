// model/runs.js - STUB from M1, owned by F2a from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: runs. Shape: rebuild-plan §3 runs.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultRuns()                       -> fresh partial
//   normaliseRuns(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateRunsFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileRuns(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultRuns() {
  return { runs: [] };
}

// eslint-disable-next-line no-unused-vars
export function normaliseRuns(rawCharacter, ctx) {
  return defaultRuns();
}

// eslint-disable-next-line no-unused-vars
export function migrateRunsFromV1(v1Character) {
  return { value: defaultRuns(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileRuns(character) {}
