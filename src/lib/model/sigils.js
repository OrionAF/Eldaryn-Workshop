// model/sigils.js - STUB from M1, owned by B5 from here on (rebuild-plan §7.3 ownership transfer).
// Persisted character fields: sigils. Shape: rebuild-plan §3 sigils.
//
// Domain contract (§3 "Normalisation layout"); every function deals in a PARTIAL CHARACTER, i.e. an
// object keyed by the character field names above, so multi-field domains need no special case:
//   defaultSigils()                       -> fresh partial
//   normaliseSigils(rawCharacter, ctx)    -> partial; rawCharacter is the whole raw (untrusted) character,
//                                          ctx = { class, spec } for gating; must be idempotent
//   migrateSigilsFromV1(v1Character)      -> { value: partial, idMap }  (idMap: v1 id -> v2 ref, {} unless
//                                          presets reference this domain; see §3 contract steps 1-4)
//   reconcileSigils(character)            -> void; mutate cross-references in place after ALL domains normalised
// The stub ignores its input and returns defaults, so preset references to this domain migrate to null.

export function defaultSigils() {
  return { sigils: { altarTier: 1, owned: {} } };
}

// eslint-disable-next-line no-unused-vars
export function normaliseSigils(rawCharacter, ctx) {
  return defaultSigils();
}

// eslint-disable-next-line no-unused-vars
export function migrateSigilsFromV1(v1Character) {
  return { value: defaultSigils(), idMap: {} };
}

// eslint-disable-next-line no-unused-vars
export function reconcileSigils(character) {}
